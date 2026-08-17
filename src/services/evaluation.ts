import type { ArtifactRequirement, ArtifactRequirementId, ArtifactVerification } from "@elqora/artifacts";
import type {
  AcceptanceEvaluation,
  ApprovalAcceptanceSnapshot,
  ApprovalRecord,
  ApprovalStage,
  ArtifactEvaluationResult,
  ArtifactEvaluationSnapshot,
  CompletionEvaluation,
  DerivedMilestoneState,
  EvaluationReason,
  Milestone,
  MilestoneArtifactContext,
  MilestoneArtifactLink,
  MilestoneEvaluationPolicySnapshot,
  MilestoneGraphSnapshot,
  MilestoneProfile,
  ProgressResult,
} from "../model/domain.js";
import { evaluateMilestoneDependencies } from "./graph.js";
import { resolveChallengeEvidenceSources } from "./challenge-evidence.js";

export function defaultEvaluationPolicy(profile: MilestoneProfile): MilestoneEvaluationPolicySnapshot {
  return {
    requiredCriteriaMustBeVerified: true,
    requiredDeliverablesMustBeSatisfied: true,
    waivedCriteriaSatisfyRequired: true,
    waivedDeliverablesSatisfyRequired: true,
    blockingChallengesPreventAcceptance: true,
    requiredReviewResult: "accepted",
    requireReviewWhenProfileRequires: profile.reviews.required,
    requireApprovalsWhenProfileRequires: profile.approvals.required,
    completionRequiresCurrentAcceptance: true,
    closeImmediatelyOnAcceptance: profile.completion.closeImmediatelyOnAcceptance,
  };
}

export function calculateProgress(milestone: Milestone, policy: MilestoneEvaluationPolicySnapshot = currentPolicy(milestone)): ProgressResult {
  let completedWeight = 0;
  let totalWeight = 0;
  for (const criterion of milestone.criteria) {
    const weight = criterion.weight ?? 1;
    totalWeight += weight;
    if (criterion.state === "verified" || (criterion.state === "waived" && policy.waivedCriteriaSatisfyRequired)) completedWeight += weight;
  }
  for (const deliverable of milestone.deliverables) {
    totalWeight += 1;
    if (deliverable.state === "satisfied" || (deliverable.state === "waived" && policy.waivedDeliverablesSatisfyRequired)) completedWeight += 1;
  }
  return { completedWeight, totalWeight, percentage: totalWeight === 0 ? 100 : (completedWeight / totalWeight) * 100 };
}

export function deriveMilestoneState(milestone: Milestone): DerivedMilestoneState {
  if (milestone.currentCompletionId !== undefined) return "completed";
  if (milestone.currentAcceptanceId !== undefined) return "accepted";
  return "open";
}

export function effectiveApprovalActors(records: readonly ApprovalRecord[], stageId: string, revisionId: string): readonly string[] {
  const relevant = records.filter((record) => record.stageId === stageId && record.milestoneRevisionId === revisionId);
  const revoked = new Set(relevant.filter((record) => record.type === "revoked").map((record) => record.revokesApprovalId));
  const actors = new Set<string>();
  for (const record of relevant) if (record.type === "granted" && !revoked.has(record.id)) actors.add(actorKey(record.actor));
  return [...actors].sort();
}

export function evaluateApprovalStage(milestone: Milestone, stage: ApprovalStage): ApprovalAcceptanceSnapshot {
  const actorIds = effectiveApprovalActors(milestone.approvalRecords, stage.id, milestone.currentRevisionId);
  const waived = milestone.approvalRecords.some((record) => record.type === "waived" && record.stageId === stage.id && record.milestoneRevisionId === milestone.currentRevisionId);
  return {
    stageId: stage.id,
    milestoneRevisionId: milestone.currentRevisionId,
    effectiveApprovalCount: actorIds.length,
    requiredApprovalCount: stage.requiredApprovalCount,
    satisfied: !stage.required || waived || actorIds.length >= stage.requiredApprovalCount,
    waived,
    actorIds,
  };
}

function actorKey(actor: { readonly id: string; readonly type?: string }): string { return `${actor.type ?? ""}:${actor.id}`; }

interface ArtifactSubject {
  readonly type: "criterion" | "deliverable_requirement";
  readonly id: string;
  readonly requirementIds: readonly ArtifactRequirementId[];
}

export function evaluateArtifacts(subject: ArtifactSubject, context?: MilestoneArtifactContext): ArtifactEvaluationResult {
  const snapshots: ArtifactEvaluationSnapshot[] = [];
  const reasons: EvaluationReason[] = [];
  if (subject.requirementIds.length === 0) return { satisfied: true, snapshots, reasons };
  if (context === undefined) {
    for (const requirementId of subject.requirementIds) reasons.push({ code: "artifact_requirement_missing", subjectId: requirementId, message: `Artifact context is required for ${requirementId}` });
    return { satisfied: false, snapshots, reasons };
  }
  const links = context.links.filter((link) => link.subject.type === subject.type && link.subject.id === subject.id);
  for (const requirementId of subject.requirementIds) {
    const requirement = context.requirements.get(requirementId);
    if (requirement === undefined) {
      reasons.push({ code: "artifact_requirement_missing", subjectId: requirementId, message: `Artifact requirement ${requirementId} is absent from context` });
      continue;
    }
    const matching = links.filter((link) => linkMatchesRequirement(link, requirement, subject.requirementIds.length, context)).sort((a, b) => a.id.localeCompare(b.id));
    const candidates = [...new Map(matching.map((link) => [`${link.artifactId}|${link.artifactVersionId ?? ""}`, link])).values()];
    evaluateArtifactRequirement(requirement, candidates, context, snapshots, reasons);
  }
  return { satisfied: reasons.length === 0, snapshots, reasons };
}

function linkMatchesRequirement(link: MilestoneArtifactLink, requirement: ArtifactRequirement, requirementCount: number, context: MilestoneArtifactContext): boolean {
  const taggedRequirement = link.metadata?.["artifactRequirementId"];
  if (typeof taggedRequirement === "string") return taggedRequirement === requirement.id;
  if (requirementCount === 1) return artifactMatchesRequirement(link.artifactId, requirement, context);
  return artifactMatchesRequirement(link.artifactId, requirement, context);
}

function artifactMatchesRequirement(artifactId: string, requirement: ArtifactRequirement, context: MilestoneArtifactContext): boolean {
  const artifact = context.artifacts.get(artifactId);
  if (artifact === undefined) return false;
  if (requirement.allowedKinds !== undefined && !requirement.allowedKinds.includes(artifact.kind)) return false;
  if (requirement.allowedValueTypes !== undefined && !requirement.allowedValueTypes.includes(artifact.valueType)) return false;
  return true;
}

function evaluateArtifactRequirement(requirement: ArtifactRequirement, links: readonly MilestoneArtifactLink[], context: MilestoneArtifactContext, snapshots: ArtifactEvaluationSnapshot[], reasons: EvaluationReason[]): void {
  const minimum = requirement.minimumCount ?? (requirement.required ? 1 : 0);
  const maximum = requirement.maximumCount;
  if (links.length < minimum || (maximum !== undefined && links.length > maximum)) {
    reasons.push({ code: "artifact_submission_missing", subjectId: requirement.id, message: `Artifact requirement ${requirement.id} expected ${minimum}${maximum === undefined ? "+" : `..${maximum}`} matching artifact(s), found ${links.length}` });
  }
  for (const link of [...links].sort((a, b) => a.id.localeCompare(b.id))) {
    const artifact = context.artifacts.get(link.artifactId);
    if (artifact === undefined) {
      reasons.push({ code: "artifact_submission_missing", subjectId: requirement.id, message: `Linked artifact ${link.artifactId} is absent` });
      continue;
    }
    const intendedVersionId = link.artifactVersionId ?? artifact.currentVersionId;
    if (intendedVersionId !== undefined && context.versions.get(intendedVersionId)?.artifactId !== artifact.id) {
      reasons.push({ code: "artifact_version_missing", subjectId: requirement.id, message: `Artifact version ${intendedVersionId} is absent or belongs to another artifact` });
      continue;
    }
    const submissions = [...context.submissions.values()].filter((submission) => submission.artifactId === artifact.id && (intendedVersionId === undefined || submission.artifactVersionId === intendedVersionId));
    const submission = latest(submissions, (item) => item.submittedAt, (item) => item.id);
    if (submission === undefined) {
      reasons.push({ code: "artifact_submission_missing", subjectId: requirement.id, message: `No submission exists for artifact ${artifact.id}` });
      continue;
    }
    const versionHint = intendedVersionId ?? submission.artifactVersionId;
    const verifications = [...context.verifications.values()].filter((verification) => verification.artifactId === artifact.id && (verification.submissionId === undefined || verification.submissionId === submission.id) && (versionHint === undefined || verification.artifactVersionId === versionHint));
    const verification = latest(verifications, (item) => item.verifiedAt ?? item.createdAt, (item) => item.id);
    if (verification === undefined) {
      reasons.push({ code: "artifact_verification_missing", subjectId: requirement.id, message: `No version-consistent verification exists for artifact ${artifact.id}` });
      continue;
    }
    const versionId = versionHint ?? verification.artifactVersionId;
    if (versionId === undefined && [...context.versions.values()].some((version) => version.artifactId === artifact.id)) {
      reasons.push({ code: "artifact_version_missing", subjectId: requirement.id, message: `Versionable artifact ${artifact.id} was evaluated without an exact version reference` });
      continue;
    }
    const outcome = verificationOutcome(verification);
    snapshots.push({
      artifactRequirementId: requirement.id,
      artifactId: artifact.id,
      ...(versionId === undefined ? {} : { artifactVersionId: versionId }),
      submissionId: submission.id,
      verificationId: verification.id,
      outcome,
    });
    if (outcome === "failed") reasons.push({ code: "artifact_verification_failed", subjectId: requirement.id, message: `Verification ${verification.id} has status ${verification.status}` });
  }
}

function verificationOutcome(verification: ArtifactVerification): "satisfied" | "failed" | "waived" {
  if (verification.status === "verified") return "satisfied";
  if (verification.status === "waived") return "waived";
  return "failed";
}

function latest<T>(values: readonly T[], timestamp: (value: T) => string, id: (value: T) => string): T | undefined {
  return [...values].sort((a, b) => timestamp(a).localeCompare(timestamp(b)) || id(a).localeCompare(id(b))).at(-1);
}

export function evaluateAcceptance(milestone: Milestone, profile: MilestoneProfile, graph?: MilestoneGraphSnapshot, artifacts?: MilestoneArtifactContext): AcceptanceEvaluation {
  const policy = currentPolicy(milestone);
  const reasons: EvaluationReason[] = [];
  const artifactSnapshots: ArtifactEvaluationSnapshot[] = [];
  const criteria = milestone.criteria.map((criterion) => {
    const stateSatisfied = criterion.state === "verified" || (criterion.state === "waived" && policy.waivedCriteriaSatisfyRequired);
    const artifactResult = evaluateArtifacts({ type: "criterion", id: criterion.id, requirementIds: criterion.artifactRequirementIds ?? [] }, artifacts);
    artifactSnapshots.push(...artifactResult.snapshots); if (criterion.required && policy.requiredCriteriaMustBeVerified) reasons.push(...artifactResult.reasons);
    const satisfied = stateSatisfied && artifactResult.satisfied;
    if (criterion.required && policy.requiredCriteriaMustBeVerified && !satisfied) reasons.push({ code: "missing_criterion", subjectId: criterion.id, message: `Required criterion ${criterion.id} is not satisfied` });
    return { id: criterion.id, state: criterion.state, satisfied };
  });
  const deliverables = milestone.deliverables.map((deliverable) => {
    const stateSatisfied = deliverable.state === "satisfied" || (deliverable.state === "waived" && policy.waivedDeliverablesSatisfyRequired);
    const artifactResult = evaluateArtifacts({ type: "deliverable_requirement", id: deliverable.id, requirementIds: deliverable.artifactRequirementIds ?? [] }, artifacts);
    artifactSnapshots.push(...artifactResult.snapshots); if (deliverable.required && policy.requiredDeliverablesMustBeSatisfied) reasons.push(...artifactResult.reasons);
    const satisfied = stateSatisfied && artifactResult.satisfied;
    if (deliverable.required && policy.requiredDeliverablesMustBeSatisfied && !satisfied) reasons.push({ code: "missing_deliverable", subjectId: deliverable.id, message: `Required deliverable ${deliverable.id} is not satisfied` });
    return { id: deliverable.id, state: deliverable.state, satisfied };
  });
  const dependencyResult = evaluateMilestoneDependencies(milestone, graph);
  reasons.push(...dependencyResult.reasons);
  const challenges = milestone.challenges.filter((challenge) => challenge.milestoneRevisionId === milestone.currentRevisionId).map((challenge) => {
    const blocking = policy.blockingChallengesPreventAcceptance && challenge.severity === "blocking" && (challenge.state === "open" || challenge.state === "under_review" || challenge.state === "reopened");
    if (blocking) reasons.push({ code: "blocking_challenge", subjectId: challenge.id, message: `Blocking challenge ${challenge.id} is unresolved` });
    const evidence = challenge.evidence.map((item) => {
      const resolution = resolveChallengeEvidenceSources(item, artifacts);
      return {
        id: item.id,
        kind: item.kind,
        title: item.title,
        description: item.description,
        state: item.state,
        ...(item.supersedesEvidenceId === undefined ? {} : { supersedesEvidenceId: item.supersedesEvidenceId }),
        sourceStatus: resolution.status,
        sources: structuredClone(resolution.sources),
      };
    });
    return { id: challenge.id, target: structuredClone(challenge.target), severity: challenge.severity, state: challenge.state, ...(challenge.resolution === undefined ? {} : { resolution: structuredClone(challenge.resolution) }), blocking, evidence };
  });
  const reviews = milestone.reviews.filter((review) => review.milestoneRevisionId === milestone.currentRevisionId).map((review) => ({ id: review.id, milestoneRevisionId: review.milestoneRevisionId, state: review.state, ...(review.result === undefined ? {} : { result: review.result }), artifactVersionIds: [...(review.artifactVersionIds ?? [])], satisfied: review.state === "completed" && review.result === policy.requiredReviewResult }));
  if (profile.reviews.enabled && policy.requireReviewWhenProfileRequires && !reviews.some((review) => review.satisfied)) reasons.push({ code: "incomplete_review", subjectId: milestone.id, message: "A completed accepted review is required for the current revision" });
  const approvals = (milestone.approvalPolicy?.stages ?? []).map((stage) => evaluateApprovalStage(milestone, stage));
  if (profile.approvals.enabled && policy.requireApprovalsWhenProfileRequires) for (const stage of approvals) if (!stage.satisfied) reasons.push({ code: "pending_approval", subjectId: stage.stageId, message: `Approval stage ${stage.stageId} is pending` });
  return {
    accepted: reasons.length === 0,
    reasons: dedupeReasons(reasons),
    snapshot: { revisionId: milestone.currentRevisionId, criteria, deliverables, dependencies: dependencyResult.snapshots, challenges, reviews, approvals, artifacts: artifactSnapshots },
  };
}

export function evaluateCompletion(milestone: Milestone, profile: MilestoneProfile): CompletionEvaluation {
  const reasons: EvaluationReason[] = [];
  if (!profile.completion.enabled) reasons.push({ code: "profile_feature_disabled", subjectId: milestone.id, message: "Completion is disabled by the profile" });
  const currentAcceptance = milestone.currentAcceptanceId === undefined ? undefined : milestone.acceptanceRecords.find((record) => record.id === milestone.currentAcceptanceId);
  if (currentAcceptance === undefined || currentAcceptance.milestoneRevisionId !== milestone.currentRevisionId) reasons.push({ code: "missing_acceptance", subjectId: milestone.id, message: "A current acceptance for the current revision is required" });
  return { completable: reasons.length === 0, reasons };
}

function dedupeReasons(reasons: readonly EvaluationReason[]): readonly EvaluationReason[] {
  const map = new Map<string, EvaluationReason>();
  for (const reason of reasons) map.set(`${reason.code}|${reason.subjectId}|${reason.message}`, reason);
  return [...map.values()];
}

export function currentPolicy(milestone: Milestone): MilestoneEvaluationPolicySnapshot {
  const revision = milestone.revisions.find((item) => item.id === milestone.currentRevisionId);
  if (revision === undefined) throw new Error(`Current revision ${milestone.currentRevisionId} is missing`);
  return revision.snapshot.evaluationPolicy;
}
