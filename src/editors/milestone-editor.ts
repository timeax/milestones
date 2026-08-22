import type {
  AcceptanceEvaluation,
  AcceptanceId,
  ActorRef,
  CompletionId,
  CompletionEvaluation,
  CreateMilestoneInput,
  Milestone,
  MilestoneEditResult,
  MilestoneGraphSnapshot,
  MilestoneProfile,
  MilestoneRevision,
  ReopenRequest,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import {
  defaultEvaluationPolicy,
  evaluateAcceptance,
  evaluateCompletion,
} from "../services/evaluation.js";
import {
  assertValidGraph,
  downstreamImpact,
  graphNodeFromMilestone,
} from "../services/graph.js";
import { assertValidMilestone, validateProfile } from "../services/validation.js";
import { ApprovalEditor, createApprovalEditor } from "./approval-editor.js";
import { ChallengeEditor, createChallengeEditor } from "./challenge-editor.js";
import { CriteriaEditor, createCriteriaEditor } from "./criteria-editor.js";
import { DefinitionEditor, createDefinitionEditor } from "./definition-editor.js";
import { DeliverableEditor, createDeliverableEditor } from "./deliverable-editor.js";
import { DependencyEditor, createDependencyEditor } from "./dependency-editor.js";
import { EvidenceEditor, createEvidenceEditor } from "./evidence-editor.js";
import type { MilestoneEditorOptions } from "./editor-contracts.js";
import {
  createHistoryState,
  historyAwareCommands,
  initializeHistory,
  MilestoneEditorHistoryController,
  runMutation,
  runTransaction,
  type MilestoneEditorHistory,
} from "./editor-history.js";
import { emit } from "./internal/events.js";
import { authorize, clone, ensureOpen, requiredText } from "./internal/helpers.js";
import { applyReopen, createRevisionSnapshot } from "./internal/revision.js";
import type { DraftMilestone } from "./internal/draft.js";
import type { EditorSession } from "./internal/session.js";
import { createReviewEditor, ReviewEditor } from "./review-editor.js";
import { createRevisionEditor, RevisionEditor } from "./revision-editor.js";
import { createSourceEditor, MilestoneSourceEditor } from "./source-editor.js";

export class MilestoneEditor {
  public readonly definition: DefinitionEditor;
  public readonly sources: MilestoneSourceEditor;
  public readonly criteria: CriteriaEditor;
  public readonly deliverables: DeliverableEditor;
  public readonly dependencies: DependencyEditor;
  public readonly challenges: ChallengeEditor;
  public readonly evidence: EvidenceEditor;
  public readonly reviews: ReviewEditor;
  public readonly approvals: ApprovalEditor;
  public readonly revisions: RevisionEditor;
  public readonly history: MilestoneEditorHistory;
  private readonly session: EditorSession;

  public constructor(
    milestone: Milestone,
    profile: MilestoneProfile,
    options: MilestoneEditorOptions,
  ) {
    const expectedSequence = options.expectedSequence ?? milestone.sequence;
    invariant(
      expectedSequence === milestone.sequence,
      "CONCURRENCY_CONFLICT",
      `Expected sequence ${expectedSequence}, received ${milestone.sequence}`,
      { expectedSequence, actualSequence: milestone.sequence },
    );
    invariant(
      profile.ref.id === milestone.profile.id && profile.ref.version === milestone.profile.version,
      "PROFILE_MISMATCH",
      "Editor profile does not match the milestone current profile",
    );
    this.session = {
      aggregateType: "milestone",
      original: milestone,
      draft: clone(milestone) as DraftMilestone,
      profile: clone(profile),
      ...(options.graph === undefined ? {} : { graph: clone(options.graph) }),
      ...(options.artifacts === undefined ? {} : { artifacts: clone(options.artifacts) }),
      clock: options.clock,
      ids: options.ids,
      expectedSequence,
      ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
      ...(options.causationId === undefined ? {} : { causationId: options.causationId }),
      ...(options.authorization === undefined ? {} : { authorization: options.authorization }),
      changes: [],
      events: [],
      invalidations: [],
      historyState: createHistoryState(options.historyLimit),
      closed: false,
    };
    initializeHistory(this.session);
    this.history = new MilestoneEditorHistoryController(this.session);
    this.definition = historyAwareCommands(this.session, createDefinitionEditor(this.session));
    this.sources = historyAwareCommands(this.session, createSourceEditor(this.session));
    this.criteria = historyAwareCommands(this.session, createCriteriaEditor(this.session));
    this.deliverables = historyAwareCommands(this.session, createDeliverableEditor(this.session));
    this.dependencies = historyAwareCommands(this.session, createDependencyEditor(this.session));
    this.challenges = historyAwareCommands(this.session, createChallengeEditor(this.session));
    this.evidence = historyAwareCommands(this.session, createEvidenceEditor(this.session));
    this.reviews = historyAwareCommands(this.session, createReviewEditor(this.session));
    this.approvals = historyAwareCommands(this.session, createApprovalEditor(this.session));
    this.revisions = historyAwareCommands(this.session, createRevisionEditor(this.session));
  }

  public static create(
    input: CreateMilestoneInput,
    options: Pick<MilestoneEditorOptions, "clock" | "ids" | "correlationId" | "causationId">,
  ): MilestoneEditResult {
    const profileIssues = validateProfile(input.profile);
    invariant(
      profileIssues.length === 0,
      "INVALID_ARGUMENT",
      "Invalid milestone profile",
      { issues: profileIssues },
    );
    requiredText(input.definition.title, "Milestone title");
    const milestoneId = options.ids.milestone();
    const revisionId = options.ids.revision();
    const createdAt = options.clock.now();
    const criteria = (input.criteria ?? []).map(
      (item) => ({ id: options.ids.criterion(), ...clone(item), sourceLinks: [] }),
    );
    const deliverables = (input.deliverables ?? []).map(
      (item) => ({ id: options.ids.deliverableRequirement(), ...clone(item), sourceLinks: [] }),
    );
    const dependencies = (input.dependencies ?? []).map(
      (item) => ({ id: options.ids.dependency(), milestoneId, ...clone(item) }),
    );
    const approvalPolicy = input.approvalPolicy === undefined
      ? undefined
      : {
          stages: input.approvalPolicy.stages.map(
            (stage) => ({ id: options.ids.approvalStage(), ...clone(stage) }),
          ),
        };
    const revision: MilestoneRevision = {
      id: revisionId,
      milestoneId,
      number: 1,
      ...(input.actor === undefined ? {} : { actor: input.actor }),
      createdAt,
      sourceLinks: [],
      snapshot: {
        profile: clone(input.profile.ref),
        evaluationPolicy: defaultEvaluationPolicy(input.profile),
        definition: clone(input.definition),
        criteria: criteria.map(({ state: _state, ...item }) => item),
        deliverables: deliverables.map(({ state: _state, ...item }) => item),
        dependencies: clone(dependencies),
        sources: [],
        ...(approvalPolicy === undefined ? {} : { approvalPolicy: clone(approvalPolicy) }),
      },
    };
    const milestone: Milestone = {
      id: milestoneId,
      profile: clone(input.profile.ref),
      currentRevisionId: revisionId,
      revisions: [revision],
      definition: clone(input.definition),
      sourceLinks: [],
      criteria,
      deliverables,
      dependencies,
      challenges: [],
      reviews: [],
      ...(approvalPolicy === undefined ? {} : { approvalPolicy }),
      approvalRecords: [],
      acceptanceRecords: [],
      completionRecords: [],
      sequence: 1,
      createdAt,
    };
    const event = {
      id: options.ids.event(),
      type: "milestone.created" as const,
      milestoneId,
      sequence: 1,
      revisionId,
      ...(input.actor === undefined ? {} : { actor: input.actor }),
      occurredAt: createdAt,
      ...(options.correlationId === undefined
        ? {}
        : { correlationId: options.correlationId }),
      ...(options.causationId === undefined ? {} : { causationId: options.causationId }),
      payload: { profile: clone(input.profile.ref) },
    };
    assertValidMilestone(milestone, input.profile);
    return {
      milestone,
      changes: [{ type: "created" }],
      events: [event],
      revision,
    };
  }

  public evaluateAcceptance(): AcceptanceEvaluation {
    ensureOpen(this.session);
    return evaluateAcceptance(
      this.session.draft,
      this.session.profile,
      this.effectiveGraph(),
      this.session.artifacts,
    );
  }

  public evaluateCompletion(): CompletionEvaluation {
    ensureOpen(this.session);
    return evaluateCompletion(this.session.draft, this.session.profile);
  }

  public accept(actor?: ActorRef): AcceptanceId {
    return runMutation(this.session, () => this.acceptInternal(actor));
  }

  public complete(actor?: ActorRef, reason?: string): CompletionId {
    return runMutation(this.session, () => this.completeInternal(actor, reason));
  }

  public reopen(request: ReopenRequest): void {
    runMutation(this.session, () => {
      authorize(this.session, "milestone.reopen", request.actor, { type: "milestone" });
      applyReopen(this.session, request);
    });
  }

  public transact<T>(label: string, operation: () => T): T {
    return runTransaction(this.session, label, operation);
  }

  private acceptInternal(actor?: ActorRef): AcceptanceId {
    ensureOpen(this.session);
    invariant(
      this.session.draft.currentAcceptanceId === undefined,
      "LIFECYCLE_CONFLICT",
      "Milestone already has a current acceptance",
    );
    authorize(this.session, "milestone.accept", actor, { type: "milestone" });
    const evaluation = this.evaluateAcceptance();
    invariant(
      evaluation.accepted,
      "EVALUATION_FAILED",
      "Milestone acceptance gates are not satisfied",
      { reasons: evaluation.reasons },
    );
    const acceptance = {
      id: this.session.ids.acceptance(),
      milestoneId: this.session.draft.id,
      milestoneRevisionId: this.session.draft.currentRevisionId,
      acceptedAt: this.session.clock.now(),
      ...(actor === undefined ? {} : { actor }),
      snapshot: evaluation.snapshot,
    };
    this.session.draft.acceptanceRecords.push(acceptance);
    this.session.draft.currentAcceptanceId = acceptance.id;
    this.session.changes.push({ type: "accepted", acceptanceId: acceptance.id });
    emit(this.session, "milestone.accepted", { acceptance }, actor);
    if (
      this.session.profile.completion.enabled
      && evaluation.snapshot.revisionId === this.session.draft.currentRevisionId
      && this.currentRevision().snapshot.evaluationPolicy.closeImmediatelyOnAcceptance
    ) {
      this.completeInternal(actor, "Profile closes immediately on acceptance");
    }
    return acceptance.id;
  }

  private completeInternal(actor?: ActorRef, reason?: string): CompletionId {
    ensureOpen(this.session);
    invariant(
      this.session.draft.currentCompletionId === undefined,
      "LIFECYCLE_CONFLICT",
      "Milestone already has a current completion",
    );
    authorize(this.session, "milestone.complete", actor, { type: "milestone" });
    const evaluation = evaluateCompletion(this.session.draft, this.session.profile);
    invariant(
      evaluation.completable,
      "EVALUATION_FAILED",
      "Milestone completion gates are not satisfied",
      { reasons: evaluation.reasons },
    );
    const acceptanceId = this.session.draft.currentAcceptanceId!;
    const completion = {
      id: this.session.ids.completion(),
      milestoneId: this.session.draft.id,
      milestoneRevisionId: this.session.draft.currentRevisionId,
      acceptanceId,
      completedAt: this.session.clock.now(),
      ...(actor === undefined ? {} : { actor }),
      ...(reason === undefined ? {} : { reason }),
    };
    this.session.draft.completionRecords.push(completion);
    this.session.draft.currentCompletionId = completion.id;
    this.session.changes.push({ type: "completed", completionId: completion.id });
    emit(this.session, "milestone.completed", { completion }, actor);
    return completion.id;
  }

  public commit(): MilestoneEditResult {
    ensureOpen(this.session);
    invariant(
      this.session.historyState.transactionDepth === 0,
      "INVALID_STATE_TRANSITION",
      "Cannot commit inside an active editor transaction",
    );
    invariant(
      this.session.original.sequence === this.session.expectedSequence,
      "CONCURRENCY_CONFLICT",
      "Original milestone sequence changed during edit",
    );
    if (this.session.revision !== undefined) {
      const finalRevision = {
        ...this.session.revision,
        snapshot: createRevisionSnapshot(this.session),
      };
      const index = this.session.draft.revisions.findIndex(
        (item) => item.id === finalRevision.id,
      );
      this.session.draft.revisions[index] = finalRevision;
      this.session.revision = finalRevision;
    }
    assertValidMilestone(this.session.draft, this.session.profile);
    const effectiveGraph = this.effectiveGraph();
    if (effectiveGraph !== undefined) assertValidGraph(effectiveGraph);
    this.session.closed = true;
    const milestone = clone(this.session.draft) as Milestone;
    const affected = effectiveGraph === undefined || this.session.events.length === 0
      ? []
      : downstreamImpact(effectiveGraph, milestone.id);
    return {
      milestone,
      changes: clone(this.session.changes),
      events: clone(this.session.events),
      ...(this.session.revision === undefined
        ? {}
        : { revision: clone(this.session.revision) }),
      ...(this.session.invalidations.length === 0
        ? {}
        : { invalidations: clone(this.session.invalidations) }),
      ...(affected.length === 0 ? {} : { affectedMilestoneIds: affected }),
    };
  }

  public rollback(): void {
    ensureOpen(this.session);
    invariant(
      this.session.historyState.transactionDepth === 0,
      "INVALID_STATE_TRANSITION",
      "Cannot roll back the editor inside an active transaction",
    );
    this.session.closed = true;
  }

  private currentRevision(): MilestoneRevision {
    const revision = this.session.draft.revisions.find(
      (item) => item.id === this.session.draft.currentRevisionId,
    );
    invariant(revision !== undefined, "NOT_FOUND", "Current revision was not found");
    return revision;
  }

  private effectiveGraph(): MilestoneGraphSnapshot | undefined {
    if (!this.session.profile.dependencies.enabled) return this.session.graph;
    if (this.session.graph === undefined) return undefined;
    const milestones = new Map(this.session.graph.milestones);
    milestones.set(this.session.draft.id, graphNodeFromMilestone(this.session.draft));
    const dependencies = [
      ...this.session.graph.dependencies.filter(
        (item) => item.milestoneId !== this.session.draft.id,
      ),
      ...this.session.draft.dependencies,
    ];
    return { milestones, dependencies };
  }
}
