import type {
  AcceptanceId,
  ActorRef,
  ApprovalRecord,
  ApprovalRecordId,
  ApprovalStage,
  ApprovalStageId,
  ChallengeId,
  ChallengeResolutionOutcome,
  ChallengeState,
  ChallengeTarget,
  CompletionId,
  CreateMilestoneInput,
  Criterion,
  CriterionId,
  CriterionState,
  DeliverableRequirement,
  DeliverableRequirementId,
  DeliverableRequirementState,
  DependencyId,
  EvaluationInvalidation,
  Milestone,
  MilestoneArtifactContext,
  MilestoneChange,
  MilestoneClock,
  MilestoneDefinition,
  MilestoneDependency,
  MilestoneDependencyGate,
  MilestoneEditResult,
  MilestoneEvent,
  MilestoneGraphSnapshot,
  MilestoneIdGenerator,
  MilestoneProfile,
  MilestoneReview,
  MilestoneRevision,
  MilestoneRevisionSnapshot,
  ReopenRequest,
  ReviewId,
  ReviewResult,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { defaultEvaluationPolicy, evaluateAcceptance, evaluateApprovalStage, evaluateCompletion } from "../services/evaluation.js";
import { assertValidGraph, downstreamImpact, graphNodeFromMilestone } from "../services/graph.js";
import { assertValidMilestone, validateProfile } from "../services/validation.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
interface DraftMilestone extends Omit<Mutable<Milestone>, "revisions" | "criteria" | "deliverables" | "dependencies" | "challenges" | "reviews" | "approvalRecords" | "acceptanceRecords" | "completionRecords"> {
  revisions: MilestoneRevision[];
  criteria: Criterion[];
  deliverables: DeliverableRequirement[];
  dependencies: MilestoneDependency[];
  challenges: Mutable<Milestone["challenges"][number]>[];
  reviews: Mutable<MilestoneReview>[];
  approvalRecords: ApprovalRecord[];
  acceptanceRecords: Milestone["acceptanceRecords"][number][];
  completionRecords: Milestone["completionRecords"][number][];
}

interface EditorOptions {
  readonly clock: MilestoneClock;
  readonly ids: MilestoneIdGenerator;
  readonly graph?: MilestoneGraphSnapshot;
  readonly artifacts?: MilestoneArtifactContext;
  readonly expectedSequence?: number;
  readonly correlationId?: string;
}

interface Session {
  readonly original: Milestone;
  readonly draft: DraftMilestone;
  profile: MilestoneProfile;
  readonly graph?: MilestoneGraphSnapshot;
  readonly artifacts?: MilestoneArtifactContext;
  readonly clock: MilestoneClock;
  readonly ids: MilestoneIdGenerator;
  readonly expectedSequence: number;
  readonly correlationId?: string;
  readonly changes: MilestoneChange[];
  readonly events: MilestoneEvent[];
  readonly invalidations: EvaluationInvalidation[];
  revision?: MilestoneRevision;
  closed: boolean;
}

type EventType = MilestoneEvent["type"];
type EventFor<T extends EventType> = Extract<MilestoneEvent, { readonly type: T }>;

function clone<T>(value: T): T { return structuredClone(value); }

function emit<T extends EventType>(session: Session, type: T, payload: EventFor<T>["payload"], actor?: ActorRef): void {
  session.draft.sequence += 1;
  const event = {
    id: session.ids.event(),
    type,
    milestoneId: session.draft.id,
    sequence: session.draft.sequence,
    revisionId: session.draft.currentRevisionId,
    ...(actor === undefined ? {} : { actor }),
    occurredAt: session.clock.now(),
    ...(session.correlationId === undefined ? {} : { correlationId: session.correlationId }),
    payload,
  } as EventFor<T>;
  session.events.push(event);
  session.draft.updatedAt = event.occurredAt;
}

function ensureOpen(session: Session): void { invariant(!session.closed, "EDITOR_CLOSED", "The editor session is closed"); }
function feature(enabled: boolean, name: string): void { invariant(enabled, "FEATURE_DISABLED", `${name} is disabled by the milestone profile`, { feature: name }); }
function requiredText(value: string, name: string): void { invariant(value.trim().length > 0, "INVALID_ARGUMENT", `${name} must be non-empty`); }

function snapshot(session: Session): MilestoneRevisionSnapshot {
  return {
    profile: clone(session.profile.ref),
    evaluationPolicy: session.revision?.snapshot.evaluationPolicy ?? defaultEvaluationPolicy(session.profile),
    definition: clone(session.draft.definition),
    criteria: session.draft.criteria.map(({ state: _state, ...definition }) => clone(definition)),
    deliverables: session.draft.deliverables.map(({ state: _state, ...definition }) => clone(definition)),
    dependencies: clone(session.draft.dependencies),
    ...(session.draft.approvalPolicy === undefined ? {} : { approvalPolicy: clone(session.draft.approvalPolicy) }),
  };
}

function beginMaterialRevision(session: Session, reason = "Material milestone change", actor?: ActorRef, evaluationPolicy = defaultEvaluationPolicy(session.profile)): void {
  ensureOpen(session);
  feature(session.profile.revisions.enabled, "revisions");
  if (session.revision !== undefined) return;
  const previousRevisionId = session.draft.currentRevisionId;
  const revision: MilestoneRevision = {
    id: session.ids.revision(), milestoneId: session.draft.id,
    number: session.draft.revisions.length + 1, previousRevisionId,
    reason, ...(actor === undefined ? {} : { actor }), createdAt: session.clock.now(),
    snapshot: { ...snapshot(session), evaluationPolicy },
  };
  session.draft.revisions.push(revision);
  session.draft.currentRevisionId = revision.id;
  if (session.draft.currentCompletionId !== undefined) session.invalidations.push({ type: "completion", ref: session.draft.currentCompletionId, reason: `Material revision ${revision.id}` });
  if (session.draft.currentAcceptanceId !== undefined) session.invalidations.push({ type: "acceptance", ref: session.draft.currentAcceptanceId, reason: `Material revision ${revision.id}` });
  delete session.draft.currentCompletionId;
  delete session.draft.currentAcceptanceId;
  session.revision = revision;
  session.changes.push({ type: "revised", revisionId: revision.id });
  emit(session, "milestone.revised", { revisionId: revision.id, previousRevisionId, reason }, actor);
}

export class DefinitionEditor {
  public constructor(private readonly session: Session) {}
  public update(definition: MilestoneDefinition, options: { readonly reason?: string; readonly actor?: ActorRef } = {}): void {
    requiredText(definition.title, "Definition title");
    beginMaterialRevision(this.session, options.reason, options.actor);
    this.session.draft.definition = clone(definition);
    this.session.changes.push({ type: "definition_changed" });
    emit(this.session, "definition.changed", { definition: clone(definition) }, options.actor);
  }
}

export class CriteriaEditor {
  public constructor(private readonly session: Session) {}
  public add(input: Omit<Criterion, "id">, options: { readonly reason?: string; readonly actor?: ActorRef } = {}): CriterionId {
    feature(this.session.profile.criteria.enabled, "criteria"); requiredText(input.title, "Criterion title");
    invariant(input.weight === undefined || (Number.isFinite(input.weight) && input.weight >= 0), "INVALID_ARGUMENT", "Criterion weight must be finite and non-negative");
    beginMaterialRevision(this.session, options.reason, options.actor);
    const criterion: Criterion = { id: this.session.ids.criterion(), ...clone(input) };
    this.session.draft.criteria.push(criterion); this.session.changes.push({ type: "criterion_changed", criterionId: criterion.id });
    emit(this.session, "criterion.added", { criterion }, options.actor); return criterion.id;
  }
  public update(id: CriterionId, patch: Partial<Omit<Criterion, "id" | "state">>, options: { readonly reason?: string; readonly actor?: ActorRef; readonly verificationEffect?: "preserve" | "invalidate" } = {}): void {
    const criterion = this.get(id); beginMaterialRevision(this.session, options.reason, options.actor);
    const updated = { ...criterion, ...clone(patch), id, state: criterion.state };
    requiredText(updated.title, "Criterion title");
    invariant(updated.weight === undefined || (Number.isFinite(updated.weight) && updated.weight >= 0), "INVALID_ARGUMENT", "Criterion weight must be finite and non-negative");
    const state = options.verificationEffect === "invalidate" && (updated.state === "verified" || updated.state === "waived") ? "not_started" : updated.state;
    if (state !== updated.state) this.session.invalidations.push({ type: "criterion_verification", ref: id, reason: options.reason ?? "Criterion definition changed" });
    this.put(id, { ...updated, state }); this.session.changes.push({ type: "criterion_changed", criterionId: id });
    emit(this.session, "criterion.changed", { criterionId: id, state }, options.actor);
  }
  public replace(id: CriterionId, replacement: Omit<Criterion, "id">, options: { readonly reason?: string; readonly actor?: ActorRef } = {}): CriterionId {
    const index = this.index(id);
    beginMaterialRevision(this.session, options.reason ?? "Criterion semantically replaced", options.actor);
    const criterion: Criterion = { id: this.session.ids.criterion(), ...clone(replacement) };
    this.session.draft.criteria[index] = criterion; this.session.changes.push({ type: "criterion_changed", criterionId: criterion.id });
    emit(this.session, "criterion.removed", { criterionId: id }, options.actor); emit(this.session, "criterion.added", { criterion }, options.actor);
    return criterion.id;
  }
  public remove(id: CriterionId, options: { readonly reason?: string; readonly actor?: ActorRef } = {}): void {
    this.index(id); beginMaterialRevision(this.session, options.reason, options.actor);
    this.session.draft.criteria = this.session.draft.criteria.filter((item) => item.id !== id);
    this.session.changes.push({ type: "criterion_changed", criterionId: id }); emit(this.session, "criterion.removed", { criterionId: id }, options.actor);
  }
  public start(id: CriterionId, actor?: ActorRef): void { this.transition(id, "in_progress", actor); }
  public submit(id: CriterionId, actor?: ActorRef): void { this.transition(id, "submitted", actor); }
  public verify(id: CriterionId, actor?: ActorRef): void { this.transition(id, "verified", actor); }
  public fail(id: CriterionId, actor?: ActorRef): void { this.transition(id, "failed", actor); }
  public waive(id: CriterionId, actor?: ActorRef): void { this.transition(id, "waived", actor); }
  public reset(id: CriterionId, actor?: ActorRef): void { this.transition(id, "not_started", actor); }
  private transition(id: CriterionId, state: CriterionState, actor?: ActorRef): void {
    feature(this.session.profile.criteria.enabled, "criteria"); const criterion = this.get(id);
    invariant(criterion.state !== state, "INVALID_STATE_TRANSITION", `Criterion ${id} is already ${state}`);
    this.put(id, { ...criterion, state }); this.session.changes.push({ type: "criterion_changed", criterionId: id });
    emit(this.session, "criterion.changed", { criterionId: id, state }, actor);
  }
  private get(id: CriterionId): Criterion { const value = this.session.draft.criteria.find((item) => item.id === id); invariant(value !== undefined, "NOT_FOUND", `Criterion ${id} was not found`); return value; }
  private put(id: CriterionId, criterion: Criterion): void { this.session.draft.criteria[this.index(id)] = clone(criterion); }
  private index(id: CriterionId): number { const index = this.session.draft.criteria.findIndex((item) => item.id === id); invariant(index >= 0, "NOT_FOUND", `Criterion ${id} was not found`); return index; }
}

export class DeliverableEditor {
  public constructor(private readonly session: Session) {}
  public add(input: Omit<DeliverableRequirement, "id">, options: { readonly reason?: string; readonly actor?: ActorRef } = {}): DeliverableRequirementId {
    feature(this.session.profile.deliverables.enabled, "deliverables"); requiredText(input.title, "Deliverable title"); beginMaterialRevision(this.session, options.reason, options.actor);
    const deliverable: DeliverableRequirement = { id: this.session.ids.deliverableRequirement(), ...clone(input) };
    this.session.draft.deliverables.push(deliverable); this.session.changes.push({ type: "deliverable_changed", deliverableRequirementId: deliverable.id });
    emit(this.session, "deliverable.added", { deliverable }, options.actor); return deliverable.id;
  }
  public update(id: DeliverableRequirementId, patch: Partial<Omit<DeliverableRequirement, "id" | "state">>, options: { readonly reason?: string; readonly actor?: ActorRef; readonly satisfactionEffect?: "preserve" | "invalidate" } = {}): void {
    const item = this.get(id); beginMaterialRevision(this.session, options.reason, options.actor); const updated = { ...item, ...clone(patch), id, state: item.state };
    requiredText(updated.title, "Deliverable title"); const state = options.satisfactionEffect === "invalidate" && (updated.state === "satisfied" || updated.state === "waived") ? "missing" : updated.state;
    if (state !== updated.state) this.session.invalidations.push({ type: "deliverable_satisfaction", ref: id, reason: options.reason ?? "Deliverable definition changed" });
    this.put(id, { ...updated, state }); this.session.changes.push({ type: "deliverable_changed", deliverableRequirementId: id });
    emit(this.session, "deliverable.changed", { deliverableRequirementId: id, state }, options.actor);
  }
  public replace(id: DeliverableRequirementId, replacement: Omit<DeliverableRequirement, "id">, options: { readonly reason?: string; readonly actor?: ActorRef } = {}): DeliverableRequirementId {
    const index = this.index(id); beginMaterialRevision(this.session, options.reason ?? "Deliverable semantically replaced", options.actor);
    const item: DeliverableRequirement = { id: this.session.ids.deliverableRequirement(), ...clone(replacement) }; this.session.draft.deliverables[index] = item;
    this.session.changes.push({ type: "deliverable_changed", deliverableRequirementId: item.id }); emit(this.session, "deliverable.removed", { deliverableRequirementId: id }, options.actor); emit(this.session, "deliverable.added", { deliverable: item }, options.actor); return item.id;
  }
  public remove(id: DeliverableRequirementId, options: { readonly reason?: string; readonly actor?: ActorRef } = {}): void {
    this.index(id); beginMaterialRevision(this.session, options.reason, options.actor); this.session.draft.deliverables = this.session.draft.deliverables.filter((item) => item.id !== id);
    this.session.changes.push({ type: "deliverable_changed", deliverableRequirementId: id }); emit(this.session, "deliverable.removed", { deliverableRequirementId: id }, options.actor);
  }
  public submit(id: DeliverableRequirementId, actor?: ActorRef): void { this.transition(id, "submitted", actor); }
  public satisfy(id: DeliverableRequirementId, actor?: ActorRef): void { this.transition(id, "satisfied", actor); }
  public reject(id: DeliverableRequirementId, actor?: ActorRef): void { this.transition(id, "rejected", actor); }
  public waive(id: DeliverableRequirementId, actor?: ActorRef): void { this.transition(id, "waived", actor); }
  public reset(id: DeliverableRequirementId, actor?: ActorRef): void { this.transition(id, "missing", actor); }
  private transition(id: DeliverableRequirementId, state: DeliverableRequirementState, actor?: ActorRef): void {
    feature(this.session.profile.deliverables.enabled, "deliverables"); const item = this.get(id); invariant(item.state !== state, "INVALID_STATE_TRANSITION", `Deliverable ${id} is already ${state}`);
    this.put(id, { ...item, state }); this.session.changes.push({ type: "deliverable_changed", deliverableRequirementId: id }); emit(this.session, "deliverable.changed", { deliverableRequirementId: id, state }, actor);
  }
  private put(id: DeliverableRequirementId, item: DeliverableRequirement): void { this.session.draft.deliverables[this.index(id)] = item; }
  private get(id: DeliverableRequirementId): DeliverableRequirement { const value = this.session.draft.deliverables.find((item) => item.id === id); invariant(value !== undefined, "NOT_FOUND", `Deliverable ${id} was not found`); return value; }
  private index(id: DeliverableRequirementId): number { const index = this.session.draft.deliverables.findIndex((item) => item.id === id); invariant(index >= 0, "NOT_FOUND", `Deliverable ${id} was not found`); return index; }
}

export class DependencyEditor {
  public constructor(private readonly session: Session) {}
  public add(dependsOnMilestoneId: Milestone["id"], gate: MilestoneDependencyGate, blocking = true, options: { readonly reason?: string; readonly actor?: ActorRef } = {}): DependencyId {
    feature(this.session.profile.dependencies.enabled, "dependencies"); invariant(dependsOnMilestoneId !== this.session.draft.id, "SELF_DEPENDENCY", "A milestone cannot depend on itself");
    invariant(!this.session.draft.dependencies.some((item) => item.dependsOnMilestoneId === dependsOnMilestoneId && JSON.stringify(item.gate) === JSON.stringify(gate)), "DUPLICATE_DEPENDENCY", "Duplicate dependency gate");
    beginMaterialRevision(this.session, options.reason, options.actor); const dependency: MilestoneDependency = { id: this.session.ids.dependency(), milestoneId: this.session.draft.id, dependsOnMilestoneId, gate: clone(gate), blocking };
    this.session.draft.dependencies.push(dependency); this.session.changes.push({ type: "dependency_changed", dependencyId: dependency.id }); emit(this.session, "dependency.added", { dependency }, options.actor); return dependency.id;
  }
  public remove(id: DependencyId, options: { readonly reason?: string; readonly actor?: ActorRef } = {}): void {
    invariant(this.session.draft.dependencies.some((item) => item.id === id), "NOT_FOUND", `Dependency ${id} was not found`); beginMaterialRevision(this.session, options.reason, options.actor);
    this.session.draft.dependencies = this.session.draft.dependencies.filter((item) => item.id !== id); this.session.changes.push({ type: "dependency_changed", dependencyId: id }); emit(this.session, "dependency.removed", { dependencyId: id }, options.actor);
  }
  public update(id: DependencyId, patch: Partial<Pick<MilestoneDependency, "gate" | "blocking">>, options: { readonly reason?: string; readonly actor?: ActorRef } = {}): void {
    const index = this.session.draft.dependencies.findIndex((item) => item.id === id); invariant(index >= 0, "NOT_FOUND", `Dependency ${id} was not found`);
    beginMaterialRevision(this.session, options.reason, options.actor); const current = this.session.draft.dependencies[index]!; const updated = { ...current, ...clone(patch), id: current.id, milestoneId: current.milestoneId, dependsOnMilestoneId: current.dependsOnMilestoneId };
    invariant(!this.session.draft.dependencies.some((item) => item.id !== id && item.dependsOnMilestoneId === updated.dependsOnMilestoneId && JSON.stringify(item.gate) === JSON.stringify(updated.gate)), "DUPLICATE_DEPENDENCY", "Duplicate dependency gate");
    this.session.draft.dependencies[index] = updated; this.session.changes.push({ type: "dependency_changed", dependencyId: id }); emit(this.session, "dependency.changed", { dependency: updated }, options.actor);
  }
}

export class ChallengeEditor {
  public constructor(private readonly session: Session) {}
  public raise(target: ChallengeTarget, reason: string, severity: "non_blocking" | "blocking", raisedBy?: ActorRef): ChallengeId {
    feature(this.session.profile.challenges.enabled, "challenges"); requiredText(reason, "Challenge reason"); this.assertTarget(target); const id = this.session.ids.challenge();
    const challenge = { id, milestoneId: this.session.draft.id, milestoneRevisionId: this.session.draft.currentRevisionId, target: clone(target), reason, severity, state: "open" as const, ...(raisedBy === undefined ? {} : { raisedBy }), createdAt: this.session.clock.now() };
    this.session.draft.challenges.push(challenge); this.session.changes.push({ type: "challenge_changed", challengeId: id }); emit(this.session, "challenge.raised", { challenge }, raisedBy); return id;
  }
  public startReview(id: ChallengeId, actor?: ActorRef): void { this.transition(id, "under_review", actor); }
  public reject(id: ChallengeId, actor?: ActorRef): void { this.transition(id, "rejected", actor); }
  public withdraw(id: ChallengeId, actor?: ActorRef): void { this.transition(id, "withdrawn", actor); }
  public reopen(id: ChallengeId, actor?: ActorRef): void { this.transition(id, "reopened", actor); }
  public resolve(id: ChallengeId, outcome: ChallengeResolutionOutcome, options: { readonly summary?: string; readonly actor?: ActorRef } = {}): void {
    const challenge = this.get(id); invariant(challenge.state === "open" || challenge.state === "under_review" || challenge.state === "reopened", "INVALID_STATE_TRANSITION", `Challenge ${id} cannot resolve from ${challenge.state}`);
    const resolution = { outcome, ...(options.summary === undefined ? {} : { summary: options.summary }), ...(options.actor === undefined ? {} : { resolvedBy: options.actor }), resolvedAt: this.session.clock.now() };
    challenge.state = "resolved"; challenge.resolution = resolution; this.session.changes.push({ type: "challenge_changed", challengeId: id }); emit(this.session, "challenge.resolved", { challengeId: id, resolution }, options.actor);
    if (outcome !== "no_effect" && this.session.draft.currentAcceptanceId !== undefined) applyReopen(this.session, { effect: "invalidate_acceptance_and_completion", reason: `Challenge ${id} resolved with ${outcome}`, ...(options.actor === undefined ? {} : { actor: options.actor }), cause: { type: "challenge", challengeId: id } });
  }
  private transition(id: ChallengeId, state: ChallengeState, actor?: ActorRef): void {
    const challenge = this.get(id); const allowed: Readonly<Record<ChallengeState, readonly ChallengeState[]>> = { open: ["under_review", "rejected", "withdrawn"], under_review: ["rejected", "withdrawn"], resolved: ["reopened"], rejected: ["reopened"], withdrawn: ["reopened"], reopened: ["under_review", "rejected", "withdrawn"] };
    invariant(allowed[challenge.state].includes(state), "INVALID_STATE_TRANSITION", `Challenge ${id} cannot transition from ${challenge.state} to ${state}`); challenge.state = state; if (state !== "resolved") delete challenge.resolution; this.session.changes.push({ type: "challenge_changed", challengeId: id }); emit(this.session, "challenge.changed", { challengeId: id, state }, actor);
  }
  private get(id: ChallengeId): Mutable<Milestone["challenges"][number]> { const value = this.session.draft.challenges.find((item) => item.id === id); invariant(value !== undefined, "NOT_FOUND", `Challenge ${id} was not found`); return value; }
  private assertTarget(target: ChallengeTarget): void {
    if (target.type === "criterion") invariant(this.session.draft.criteria.some((item) => item.id === target.criterionId), "NOT_FOUND", `Challenge criterion ${target.criterionId} was not found`);
    else if (target.type === "deliverable_requirement") invariant(this.session.draft.deliverables.some((item) => item.id === target.deliverableRequirementId), "NOT_FOUND", `Challenge deliverable ${target.deliverableRequirementId} was not found`);
    else if (target.type === "review") invariant(this.session.draft.reviews.some((item) => item.id === target.reviewId), "NOT_FOUND", `Challenge review ${target.reviewId} was not found`);
    else if (target.type === "artifact" && this.session.artifacts !== undefined) invariant(this.session.artifacts.artifacts.has(target.artifactId) && (target.artifactVersionId === undefined || this.session.artifacts.versions.get(target.artifactVersionId)?.artifactId === target.artifactId), "NOT_FOUND", "Challenge artifact target was not found in the supplied artifact context");
  }
}

export class ReviewEditor {
  public constructor(private readonly session: Session) {}
  public request(options: { readonly requestedBy?: ActorRef; readonly assignedReviewer?: ActorRef } = {}): ReviewId {
    feature(this.session.profile.reviews.enabled, "reviews"); const id = this.session.ids.review(); const review: MilestoneReview = { id, milestoneId: this.session.draft.id, milestoneRevisionId: this.session.draft.currentRevisionId, ...(options.requestedBy === undefined ? {} : { requestedBy: options.requestedBy }), ...(options.assignedReviewer === undefined ? {} : { assignedReviewer: options.assignedReviewer }), state: "requested", createdAt: this.session.clock.now() };
    this.session.draft.reviews.push(clone(review)); this.session.changes.push({ type: "review_changed", reviewId: id }); emit(this.session, "review.requested", { review }, options.requestedBy); return id;
  }
  public assign(id: ReviewId, reviewer: ActorRef, actor?: ActorRef): void { const review = this.get(id); invariant(review.state !== "completed" && review.state !== "cancelled", "INVALID_STATE_TRANSITION", "Cannot assign a closed review"); review.assignedReviewer = reviewer; this.changed(review, actor); }
  public start(id: ReviewId, actor?: ActorRef): void { const review = this.get(id); invariant(review.state === "requested", "INVALID_STATE_TRANSITION", "Only a requested review can start"); review.state = "in_progress"; this.changed(review, actor); }
  public cancel(id: ReviewId, actor?: ActorRef): void { const review = this.get(id); invariant(review.state !== "completed" && review.state !== "cancelled", "INVALID_STATE_TRANSITION", "Review is already closed"); review.state = "cancelled"; this.changed(review, actor); }
  public complete(id: ReviewId, result: ReviewResult, options: { readonly completedBy?: ActorRef; readonly summary?: string; readonly artifactVersionIds?: readonly string[] } = {}): void {
    const review = this.get(id); invariant(review.state === "requested" || review.state === "in_progress", "INVALID_STATE_TRANSITION", "Only an open review can complete"); review.state = "completed"; review.result = result; review.completedAt = this.session.clock.now();
    if (options.completedBy !== undefined) review.completedBy = options.completedBy; if (options.summary !== undefined) review.summary = options.summary; if (options.artifactVersionIds !== undefined) review.artifactVersionIds = [...options.artifactVersionIds];
    this.session.changes.push({ type: "review_changed", reviewId: id }); emit(this.session, "review.completed", { reviewId: id, result }, options.completedBy);
  }
  private changed(review: Mutable<MilestoneReview>, actor?: ActorRef): void { this.session.changes.push({ type: "review_changed", reviewId: review.id }); emit(this.session, "review.changed", { reviewId: review.id, state: review.state }, actor); }
  private get(id: ReviewId): Mutable<MilestoneReview> { const value = this.session.draft.reviews.find((item) => item.id === id); invariant(value !== undefined, "NOT_FOUND", `Review ${id} was not found`); return value; }
}

export class ApprovalEditor {
  public constructor(private readonly session: Session) {}
  public grant(stageId: ApprovalStageId, actor: ActorRef): ApprovalRecordId { return this.record(stageId, actor, "granted"); }
  public reject(stageId: ApprovalStageId, actor: ActorRef, reason?: string): ApprovalRecordId { return this.record(stageId, actor, "rejected", reason); }
  public waive(stageId: ApprovalStageId, actor: ActorRef, reason: string): ApprovalRecordId { requiredText(reason, "Waiver reason"); return this.record(stageId, actor, "waived", reason); }
  public revoke(approvalId: ApprovalRecordId, actor: ActorRef, reason?: string): ApprovalRecordId {
    feature(this.session.profile.approvals.enabled, "approvals"); const approval = this.session.draft.approvalRecords.find((item) => item.id === approvalId);
    invariant(approval?.type === "granted", "INVALID_ARGUMENT", `Approval ${approvalId} is not a granted approval`); invariant(approval.milestoneRevisionId === this.session.draft.currentRevisionId, "INVALID_ARGUMENT", "Only an approval for the current revision can be revoked");
    invariant(!this.session.draft.approvalRecords.some((item) => item.type === "revoked" && item.revokesApprovalId === approvalId), "INVALID_STATE_TRANSITION", `Approval ${approvalId} is already revoked`);
    const record = { id: this.session.ids.approvalRecord(), type: "revoked" as const, milestoneId: this.session.draft.id, milestoneRevisionId: this.session.draft.currentRevisionId, stageId: approval.stageId, actor, revokesApprovalId: approvalId, ...(reason === undefined ? {} : { reason }), createdAt: this.session.clock.now() };
    this.session.draft.approvalRecords.push(record); this.session.changes.push({ type: "approval_recorded", approvalRecordId: record.id }); emit(this.session, "approval.revoked", { record }, actor);
    const stage = this.stage(approval.stageId); if (stage.required && !evaluateApprovalStage(this.session.draft, stage).satisfied && this.session.draft.currentAcceptanceId !== undefined) applyReopen(this.session, { effect: "invalidate_acceptance_and_completion", reason: `Required approval ${approvalId} was revoked`, actor, cause: { type: "approval_revocation", approvalRecordId: record.id } });
    return record.id;
  }
  public addStage(input: Omit<ApprovalStage, "id">, options: { readonly reason?: string; readonly actor?: ActorRef } = {}): ApprovalStageId {
    feature(this.session.profile.approvals.enabled, "approvals"); requiredText(input.label, "Approval stage label"); invariant(Number.isSafeInteger(input.requiredApprovalCount) && input.requiredApprovalCount >= (input.required ? 1 : 0), "INVALID_ARGUMENT", "Invalid required approval count");
    beginMaterialRevision(this.session, options.reason, options.actor); const stage = { id: this.session.ids.approvalStage(), ...clone(input) }; const stages = [...(this.session.draft.approvalPolicy?.stages ?? []), stage]; this.session.draft.approvalPolicy = { stages }; return stage.id;
  }
  public updateStage(id: ApprovalStageId, patch: Partial<Omit<ApprovalStage, "id">>, options: { readonly reason?: string; readonly actor?: ActorRef } = {}): void {
    const stage = this.stage(id); beginMaterialRevision(this.session, options.reason, options.actor); const updated = { ...stage, ...clone(patch), id }; requiredText(updated.label, "Approval stage label"); invariant(Number.isSafeInteger(updated.requiredApprovalCount) && updated.requiredApprovalCount >= (updated.required ? 1 : 0), "INVALID_ARGUMENT", "Invalid required approval count");
    this.session.draft.approvalPolicy = { stages: this.session.draft.approvalPolicy!.stages.map((item) => item.id === id ? updated : item) };
  }
  public removeStage(id: ApprovalStageId, options: { readonly reason?: string; readonly actor?: ActorRef } = {}): void {
    this.stage(id); beginMaterialRevision(this.session, options.reason, options.actor); this.session.draft.approvalPolicy = { stages: this.session.draft.approvalPolicy!.stages.filter((item) => item.id !== id) };
  }
  private record(stageId: ApprovalStageId, actor: ActorRef, type: "granted" | "rejected" | "waived", reason?: string): ApprovalRecordId {
    feature(this.session.profile.approvals.enabled, "approvals"); this.stage(stageId);
    if (type === "granted") invariant(!effectiveDuplicate(this.session.draft.approvalRecords, stageId, this.session.draft.currentRevisionId, actor), "INVALID_STATE_TRANSITION", "Actor already has an effective approval for this stage and revision");
    const record = { id: this.session.ids.approvalRecord(), type, milestoneId: this.session.draft.id, milestoneRevisionId: this.session.draft.currentRevisionId, stageId, actor, ...(reason === undefined ? {} : { reason }), createdAt: this.session.clock.now() } as ApprovalRecord;
    this.session.draft.approvalRecords.push(record); this.session.changes.push({ type: "approval_recorded", approvalRecordId: record.id });
    if (record.type === "revoked") throw new Error("Unreachable"); emit(this.session, "approval.recorded", { record }, actor); return record.id;
  }
  private stage(id: ApprovalStageId): ApprovalStage { const stage = this.session.draft.approvalPolicy?.stages.find((item) => item.id === id); invariant(stage !== undefined, "NOT_FOUND", `Approval stage ${id} was not found`); return stage; }
}

function effectiveDuplicate(records: readonly ApprovalRecord[], stageId: ApprovalStageId, revisionId: string, actor: ActorRef): boolean {
  const grants = records.filter((record) => record.type === "granted" && record.stageId === stageId && record.milestoneRevisionId === revisionId && record.actor.id === actor.id && record.actor.type === actor.type);
  const revoked = new Set(records.filter((record) => record.type === "revoked").map((record) => record.revokesApprovalId)); return grants.some((grant) => !revoked.has(grant.id));
}

export class RevisionEditor {
  public constructor(private readonly session: Session) {}
  public begin(reason: string, actor?: ActorRef): void { requiredText(reason, "Revision reason"); beginMaterialRevision(this.session, reason, actor); }
  public applyProfile(profile: MilestoneProfile, reason: string, actor?: ActorRef): void {
    requiredText(reason, "Profile revision reason"); const issues = validateProfile(profile); invariant(issues.length === 0, "INVALID_ARGUMENT", "Invalid milestone profile", { issues });
    beginMaterialRevision(this.session, reason, actor, defaultEvaluationPolicy(profile)); this.session.profile = clone(profile); this.session.draft.profile = clone(profile.ref);
  }
}

function applyReopen(session: Session, request: ReopenRequest): void {
  ensureOpen(session); requiredText(request.reason, "Reopen reason");
  const hadCompletion = session.draft.currentCompletionId !== undefined; const hadAcceptance = session.draft.currentAcceptanceId !== undefined;
  invariant(hadCompletion || (request.effect === "invalidate_acceptance_and_completion" && hadAcceptance), "LIFECYCLE_CONFLICT", "Requested reopening has no current lifecycle state to invalidate");
  if (hadCompletion) { session.invalidations.push({ type: "completion", ref: session.draft.currentCompletionId!, reason: request.reason }); delete session.draft.currentCompletionId; }
  if (request.effect === "invalidate_acceptance_and_completion" && hadAcceptance) { session.invalidations.push({ type: "acceptance", ref: session.draft.currentAcceptanceId!, reason: request.reason }); delete session.draft.currentAcceptanceId; }
  session.changes.push({ type: "reopened", effect: request.effect }); emit(session, "milestone.reopened", { effect: request.effect, reason: request.reason, ...(request.cause === undefined ? {} : { cause: request.cause }) }, request.actor);
}

export class MilestoneEditor {
  public readonly definition: DefinitionEditor;
  public readonly criteria: CriteriaEditor;
  public readonly deliverables: DeliverableEditor;
  public readonly dependencies: DependencyEditor;
  public readonly challenges: ChallengeEditor;
  public readonly reviews: ReviewEditor;
  public readonly approvals: ApprovalEditor;
  public readonly revisions: RevisionEditor;
  private readonly session: Session;

  public constructor(milestone: Milestone, profile: MilestoneProfile, options: EditorOptions) {
    const expectedSequence = options.expectedSequence ?? milestone.sequence;
    invariant(expectedSequence === milestone.sequence, "CONCURRENCY_CONFLICT", `Expected sequence ${expectedSequence}, received ${milestone.sequence}`, { expectedSequence, actualSequence: milestone.sequence });
    invariant(profile.ref.id === milestone.profile.id && profile.ref.version === milestone.profile.version, "PROFILE_MISMATCH", "Editor profile does not match the milestone current profile");
    this.session = { original: milestone, draft: clone(milestone) as DraftMilestone, profile: clone(profile), ...(options.graph === undefined ? {} : { graph: options.graph }), ...(options.artifacts === undefined ? {} : { artifacts: options.artifacts }), clock: options.clock, ids: options.ids, expectedSequence, ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }), changes: [], events: [], invalidations: [], closed: false };
    this.definition = new DefinitionEditor(this.session); this.criteria = new CriteriaEditor(this.session); this.deliverables = new DeliverableEditor(this.session); this.dependencies = new DependencyEditor(this.session); this.challenges = new ChallengeEditor(this.session); this.reviews = new ReviewEditor(this.session); this.approvals = new ApprovalEditor(this.session); this.revisions = new RevisionEditor(this.session);
  }

  public static create(input: CreateMilestoneInput, options: Pick<EditorOptions, "clock" | "ids" | "correlationId">): MilestoneEditResult {
    const profileIssues = validateProfile(input.profile); invariant(profileIssues.length === 0, "INVALID_ARGUMENT", "Invalid milestone profile", { issues: profileIssues }); requiredText(input.definition.title, "Milestone title");
    const milestoneId = options.ids.milestone(); const revisionId = options.ids.revision(); const createdAt = options.clock.now();
    const criteria = (input.criteria ?? []).map((item) => ({ id: options.ids.criterion(), ...clone(item) }));
    const deliverables = (input.deliverables ?? []).map((item) => ({ id: options.ids.deliverableRequirement(), ...clone(item) }));
    const dependencies = (input.dependencies ?? []).map((item) => ({ id: options.ids.dependency(), milestoneId, ...clone(item) }));
    const approvalPolicy = input.approvalPolicy === undefined ? undefined : { stages: input.approvalPolicy.stages.map((stage) => ({ id: options.ids.approvalStage(), ...clone(stage) })) };
    const revision: MilestoneRevision = { id: revisionId, milestoneId, number: 1, ...(input.actor === undefined ? {} : { actor: input.actor }), createdAt, snapshot: { profile: clone(input.profile.ref), evaluationPolicy: defaultEvaluationPolicy(input.profile), definition: clone(input.definition), criteria: criteria.map(({ state: _state, ...item }) => item), deliverables: deliverables.map(({ state: _state, ...item }) => item), dependencies: clone(dependencies), ...(approvalPolicy === undefined ? {} : { approvalPolicy: clone(approvalPolicy) }) } };
    const milestone: Milestone = { id: milestoneId, profile: clone(input.profile.ref), currentRevisionId: revisionId, revisions: [revision], definition: clone(input.definition), criteria, deliverables, dependencies, challenges: [], reviews: [], ...(approvalPolicy === undefined ? {} : { approvalPolicy }), approvalRecords: [], acceptanceRecords: [], completionRecords: [], sequence: 1, createdAt };
    const event = { id: options.ids.event(), type: "milestone.created" as const, milestoneId, sequence: 1, revisionId, ...(input.actor === undefined ? {} : { actor: input.actor }), occurredAt: createdAt, ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }), payload: { profile: clone(input.profile.ref) } };
    assertValidMilestone(milestone, input.profile); return { milestone, changes: [{ type: "created" }], events: [event], revision };
  }

  public evaluateAcceptance() { ensureOpen(this.session); return evaluateAcceptance(this.session.draft, this.session.profile, this.effectiveGraph(), this.session.artifacts); }
  public accept(actor?: ActorRef): AcceptanceId {
    ensureOpen(this.session); invariant(this.session.draft.currentAcceptanceId === undefined, "LIFECYCLE_CONFLICT", "Milestone already has a current acceptance");
    const evaluation = this.evaluateAcceptance(); invariant(evaluation.accepted, "EVALUATION_FAILED", "Milestone acceptance gates are not satisfied", { reasons: evaluation.reasons });
    const acceptance = { id: this.session.ids.acceptance(), milestoneId: this.session.draft.id, milestoneRevisionId: this.session.draft.currentRevisionId, acceptedAt: this.session.clock.now(), ...(actor === undefined ? {} : { actor }), snapshot: evaluation.snapshot };
    this.session.draft.acceptanceRecords.push(acceptance); this.session.draft.currentAcceptanceId = acceptance.id; this.session.changes.push({ type: "accepted", acceptanceId: acceptance.id }); emit(this.session, "milestone.accepted", { acceptance }, actor);
    if (this.session.profile.completion.enabled && evaluation.snapshot.revisionId === this.session.draft.currentRevisionId && this.currentRevision().snapshot.evaluationPolicy.closeImmediatelyOnAcceptance) this.complete(actor, "Profile closes immediately on acceptance");
    return acceptance.id;
  }
  public complete(actor?: ActorRef, reason?: string): CompletionId {
    ensureOpen(this.session); invariant(this.session.draft.currentCompletionId === undefined, "LIFECYCLE_CONFLICT", "Milestone already has a current completion"); const evaluation = evaluateCompletion(this.session.draft, this.session.profile);
    invariant(evaluation.completable, "EVALUATION_FAILED", "Milestone completion gates are not satisfied", { reasons: evaluation.reasons });
    const acceptanceId = this.session.draft.currentAcceptanceId!; const completion = { id: this.session.ids.completion(), milestoneId: this.session.draft.id, milestoneRevisionId: this.session.draft.currentRevisionId, acceptanceId, completedAt: this.session.clock.now(), ...(actor === undefined ? {} : { actor }), ...(reason === undefined ? {} : { reason }) };
    this.session.draft.completionRecords.push(completion); this.session.draft.currentCompletionId = completion.id; this.session.changes.push({ type: "completed", completionId: completion.id }); emit(this.session, "milestone.completed", { completion }, actor); return completion.id;
  }
  public reopen(request: ReopenRequest): void { applyReopen(this.session, request); }
  public commit(): MilestoneEditResult {
    ensureOpen(this.session); invariant(this.session.original.sequence === this.session.expectedSequence, "CONCURRENCY_CONFLICT", "Original milestone sequence changed during edit");
    if (this.session.revision !== undefined) {
      const finalRevision = { ...this.session.revision, snapshot: snapshot(this.session) }; const index = this.session.draft.revisions.findIndex((item) => item.id === finalRevision.id); this.session.draft.revisions[index] = finalRevision; this.session.revision = finalRevision;
    }
    assertValidMilestone(this.session.draft, this.session.profile);
    const effectiveGraph = this.effectiveGraph(); if (effectiveGraph !== undefined) assertValidGraph(effectiveGraph);
    this.session.closed = true; const milestone = clone(this.session.draft) as Milestone;
    const affected = effectiveGraph === undefined || this.session.events.length === 0 ? [] : downstreamImpact(effectiveGraph, milestone.id);
    return { milestone, changes: clone(this.session.changes), events: clone(this.session.events), ...(this.session.revision === undefined ? {} : { revision: clone(this.session.revision) }), ...(this.session.invalidations.length === 0 ? {} : { invalidations: clone(this.session.invalidations) }), ...(affected.length === 0 ? {} : { affectedMilestoneIds: affected }) };
  }
  public rollback(): void { ensureOpen(this.session); this.session.closed = true; }
  private currentRevision(): MilestoneRevision { const revision = this.session.draft.revisions.find((item) => item.id === this.session.draft.currentRevisionId); invariant(revision !== undefined, "NOT_FOUND", "Current revision was not found"); return revision; }
  private effectiveGraph(): MilestoneGraphSnapshot | undefined {
    if (!this.session.profile.dependencies.enabled) return this.session.graph;
    if (this.session.graph === undefined) return undefined;
    const milestones = new Map(this.session.graph.milestones); milestones.set(this.session.draft.id, graphNodeFromMilestone(this.session.draft));
    const dependencies = [...this.session.graph.dependencies.filter((item) => item.milestoneId !== this.session.draft.id), ...this.session.draft.dependencies]; return { milestones, dependencies };
  }
}
