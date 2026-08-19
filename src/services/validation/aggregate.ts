import type { ApprovalRecord, ApprovalRecordId, ChallengeEvidence, Milestone, MilestoneAcceptance, MilestoneProfile, MilestoneRevision } from "../../model/domain.js";
import type { ValidationIssue } from "../../model/errors.js";
import { addIssue, duplicates, nonEmpty, validateApprovalStages, validateCriteria, validateDeliverables, validateUniqueIds } from "./common.js";
import { validateRevisions } from "./revisions.js";
import { dependencyIdentityKey } from "../dependency-identity.js";
import { assertValidSourceLink } from "../sources.js";

function validateAcceptanceSnapshot(issues: ValidationIssue[], acceptance: MilestoneAcceptance, revision: MilestoneRevision, milestone: Milestone): void {
  const path = `acceptanceRecords.${acceptance.id}.snapshot`;
  if (acceptance.snapshot.revisionId !== acceptance.milestoneRevisionId) addIssue(issues, "acceptance_snapshot_revision_mismatch", `${path}.revisionId`, "Acceptance snapshot revision must match its record");
  const checks: readonly [string, readonly { readonly id: string }[], ReadonlySet<string>][] = [
    ["criteria", acceptance.snapshot.criteria, new Set(revision.snapshot.criteria.map((value) => value.id))],
    ["deliverables", acceptance.snapshot.deliverables, new Set(revision.snapshot.deliverables.map((value) => value.id))],
    ["dependencies", acceptance.snapshot.dependencies, new Set(revision.snapshot.dependencies.map((value) => value.id))],
    ["challenges", acceptance.snapshot.challenges, new Set(milestone.challenges.map((value) => value.id))],
    ["reviews", acceptance.snapshot.reviews, new Set(milestone.reviews.map((value) => value.id))],
    ["approvals", acceptance.snapshot.approvals.map((value) => ({ id: value.stageId })), new Set(revision.snapshot.approvalPolicy?.stages.map((value) => value.id) ?? [])],
  ];
  for (const [name, values, validIds] of checks) {
    if (duplicates(values.map((value) => value.id)).length > 0) addIssue(issues, "duplicate_snapshot_id", `${path}.${name}`, `Acceptance ${name} IDs must be unique`);
    for (const value of values) if (!validIds.has(value.id)) addIssue(issues, "missing_acceptance_snapshot_target", `${path}.${name}`, `Acceptance snapshot references missing ${name} target ${value.id}`);
  }
  for (const value of acceptance.snapshot.criteria) if (value.satisfied !== (value.state === "verified" || value.state === "waived")) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.criteria.${value.id}`, "Criterion satisfaction does not match state");
  for (const value of acceptance.snapshot.deliverables) if (value.satisfied !== (value.state === "satisfied" || value.state === "waived")) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.deliverables.${value.id}`, "Deliverable satisfaction does not match state");
}

export function validateMilestoneAggregate(milestone: Milestone, profile?: MilestoneProfile): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!nonEmpty(milestone.id)) addIssue(issues, "empty_id", "id", "Milestone ID must be non-empty");
  if (!Number.isSafeInteger(milestone.sequence) || milestone.sequence < 1) addIssue(issues, "invalid_sequence", "sequence", "Sequence must be a positive integer");
  if (!nonEmpty(milestone.profile.id) || !Number.isSafeInteger(milestone.profile.version) || milestone.profile.version < 1) addIssue(issues, "invalid_profile_ref", "profile", "Milestone profile reference must contain a non-empty ID and positive version");

  const revisions = validateRevisions(issues, milestone);
  const currentRevision = revisions.get(milestone.currentRevisionId);
  if (currentRevision === undefined) addIssue(issues, "missing_current_revision", "currentRevisionId", "Current revision does not exist");
  else {
    if (milestone.revisions.at(-1)?.id !== currentRevision.id) addIssue(issues, "stale_current_revision", "currentRevisionId", "Current revision must be latest");
    if (currentRevision.snapshot.profile.id !== milestone.profile.id || currentRevision.snapshot.profile.version !== milestone.profile.version) addIssue(issues, "profile_snapshot_mismatch", "profile", "Current profile must match current revision snapshot");
  }

  validateCriteria(issues, milestone.criteria, "criteria");
  validateDeliverables(issues, milestone.deliverables, "deliverables");
  validateSources(issues, milestone);
  validateUniqueIds(issues, milestone.dependencies, "dependencies");
  const dependencyKeys = new Set<string>();
  for (const dependency of milestone.dependencies) {
    if (!["accepted", "completed", "criterion", "deliverable"].includes(dependency.gate.type)) addIssue(issues, "invalid_dependency_gate", `dependencies.${dependency.id}.gate.type`, "Dependency gate type is invalid");
    if (dependency.milestoneId !== milestone.id) addIssue(issues, "dependency_milestone_mismatch", `dependencies.${dependency.id}.milestoneId`, "Dependency must belong to this milestone");
    if (dependency.dependsOnMilestoneId === milestone.id) addIssue(issues, "self_dependency", `dependencies.${dependency.id}`, "A milestone cannot depend on itself");
    const key = dependencyIdentityKey(dependency.dependsOnMilestoneId, dependency.gate);
    if (dependencyKeys.has(key)) addIssue(issues, "duplicate_dependency", `dependencies.${dependency.id}`, "Duplicate dependency gate");
    dependencyKeys.add(key);
  }

  validateUniqueIds(issues, milestone.reviews, "reviews");
  for (const review of milestone.reviews) {
    if (!["requested", "in_progress", "completed", "cancelled"].includes(review.state)) addIssue(issues, "invalid_state", `reviews.${review.id}.state`, "Review state is invalid");
    if (review.result !== undefined && !["accepted", "changes_requested", "rejected"].includes(review.result)) addIssue(issues, "invalid_review_result", `reviews.${review.id}.result`, "Review result is invalid");
    if (review.milestoneId !== milestone.id) addIssue(issues, "review_milestone_mismatch", `reviews.${review.id}.milestoneId`, "Review belongs to another milestone");
    if (!revisions.has(review.milestoneRevisionId)) addIssue(issues, "missing_review_revision", `reviews.${review.id}.milestoneRevisionId`, "Review revision does not exist");
    if (review.state === "completed") {
      if (review.result === undefined || review.completedAt === undefined) addIssue(issues, "incomplete_completed_review", `reviews.${review.id}`, "Completed review requires result and completion time");
    } else if (review.result !== undefined || review.completedAt !== undefined || review.completedBy !== undefined) addIssue(issues, "unexpected_review_result", `reviews.${review.id}`, "Only a completed review may carry completion data");
  }

  validateUniqueIds(issues, milestone.challenges, "challenges");
  const evidenceIds = new Set<string>();
  for (const challenge of milestone.challenges) {
    const target = challenge.target;
    if (!["open", "under_review", "resolved", "rejected", "withdrawn", "reopened"].includes(challenge.state)) addIssue(issues, "invalid_state", `challenges.${challenge.id}.state`, "Challenge state is invalid");
    if (challenge.milestoneId !== milestone.id) addIssue(issues, "challenge_milestone_mismatch", `challenges.${challenge.id}.milestoneId`, "Challenge belongs to another milestone");
    if (!revisions.has(challenge.milestoneRevisionId)) addIssue(issues, "missing_challenge_revision", `challenges.${challenge.id}.milestoneRevisionId`, "Challenge revision does not exist");
    if ((challenge.state === "resolved") !== (challenge.resolution !== undefined)) addIssue(issues, "challenge_resolution_mismatch", `challenges.${challenge.id}.resolution`, "Resolution payload must exist exactly when resolved");
    if (target.type === "criterion" && !milestone.criteria.some((value) => value.id === target.criterionId)) addIssue(issues, "missing_challenge_target", `challenges.${challenge.id}.target`, "Challenge criterion target does not exist");
    if (target.type === "deliverable_requirement" && !milestone.deliverables.some((value) => value.id === target.deliverableRequirementId)) addIssue(issues, "missing_challenge_target", `challenges.${challenge.id}.target`, "Challenge deliverable target does not exist");
    if (target.type === "review" && !milestone.reviews.some((value) => value.id === target.reviewId)) addIssue(issues, "missing_challenge_target", `challenges.${challenge.id}.target`, "Challenge review target does not exist");
    if (target.type === "evidence" && !nonEmpty(target.ref)) addIssue(issues, "missing_challenge_target", `challenges.${challenge.id}.target.ref`, "Challenge evidence reference must be non-empty");
    validateChallengeEvidence(issues, milestone, challenge.id, challenge.milestoneRevisionId, challenge.evidence, evidenceIds);
  }

  const stages = milestone.approvalPolicy?.stages ?? [];
  validateApprovalStages(issues, stages, new Set(milestone.criteria.map((value) => value.id)), new Set(milestone.deliverables.map((value) => value.id)), "approvalPolicy.stages");
  validateUniqueIds(issues, milestone.approvalRecords, "approvalRecords");
  const approvals = new Map<ApprovalRecordId, ApprovalRecord>(milestone.approvalRecords.map((record) => [record.id, record]));
  for (const [index, record] of milestone.approvalRecords.entries()) {
    if (!["granted", "rejected", "revoked", "waived"].includes(record.type)) addIssue(issues, "invalid_approval_record", `approvalRecords.${record.id}.type`, "Approval record type is invalid");
    if (record.milestoneId !== milestone.id) addIssue(issues, "approval_milestone_mismatch", `approvalRecords.${record.id}.milestoneId`, "Approval belongs to another milestone");
    if (!revisions.has(record.milestoneRevisionId)) addIssue(issues, "missing_approval_revision", `approvalRecords.${record.id}.milestoneRevisionId`, "Approval revision does not exist");
    const approvalRevision = revisions.get(record.milestoneRevisionId);
    if (!approvalRevision?.snapshot.approvalPolicy?.stages.some((stage) => stage.id === record.stageId)) addIssue(issues, "missing_approval_stage", `approvalRecords.${record.id}.stageId`, "Approval stage does not exist in its revision snapshot");
    if (record.type === "revoked") {
      const target = approvals.get(record.revokesApprovalId);
      if (target?.type !== "granted") addIssue(issues, "invalid_revocation", `approvalRecords.${record.id}`, "Revocation must target a grant");
      else {
        if (milestone.approvalRecords.indexOf(target) >= index) addIssue(issues, "invalid_revocation_order", `approvalRecords.${record.id}`, "Grant must precede revocation");
        if (target.milestoneId !== record.milestoneId || target.stageId !== record.stageId || target.milestoneRevisionId !== record.milestoneRevisionId) addIssue(issues, "revocation_target_mismatch", `approvalRecords.${record.id}`, "Revocation target must share milestone, stage, and revision");
      }
    }
  }

  validateUniqueIds(issues, milestone.acceptanceRecords, "acceptanceRecords");
  for (const acceptance of milestone.acceptanceRecords) {
    if (acceptance.milestoneId !== milestone.id) addIssue(issues, "acceptance_milestone_mismatch", `acceptanceRecords.${acceptance.id}.milestoneId`, "Acceptance belongs to another milestone");
    const revision = revisions.get(acceptance.milestoneRevisionId);
    if (revision === undefined) addIssue(issues, "missing_acceptance_revision", `acceptanceRecords.${acceptance.id}.milestoneRevisionId`, "Acceptance revision does not exist");
    else validateAcceptanceSnapshot(issues, acceptance, revision, milestone);
  }
  const currentAcceptance = milestone.currentAcceptanceId === undefined ? undefined : milestone.acceptanceRecords.find((record) => record.id === milestone.currentAcceptanceId);
  if (milestone.currentAcceptanceId !== undefined && currentAcceptance === undefined) addIssue(issues, "missing_current_acceptance", "currentAcceptanceId", "Current acceptance does not exist");
  if (currentAcceptance !== undefined && currentAcceptance.milestoneRevisionId !== milestone.currentRevisionId) addIssue(issues, "stale_current_acceptance", "currentAcceptanceId", "Current acceptance must target current revision");

  validateUniqueIds(issues, milestone.completionRecords, "completionRecords");
  for (const completion of milestone.completionRecords) {
    if (completion.milestoneId !== milestone.id) addIssue(issues, "completion_milestone_mismatch", `completionRecords.${completion.id}.milestoneId`, "Completion belongs to another milestone");
    const acceptance = milestone.acceptanceRecords.find((record) => record.id === completion.acceptanceId);
    if (acceptance === undefined) addIssue(issues, "missing_completion_acceptance", `completionRecords.${completion.id}.acceptanceId`, "Completion acceptance does not exist");
    else if (completion.milestoneRevisionId !== acceptance.milestoneRevisionId) addIssue(issues, "completion_revision_mismatch", `completionRecords.${completion.id}.milestoneRevisionId`, "Completion revision must match acceptance revision");
  }
  const currentCompletion = milestone.currentCompletionId === undefined ? undefined : milestone.completionRecords.find((record) => record.id === milestone.currentCompletionId);
  if (milestone.currentCompletionId !== undefined && currentCompletion === undefined) addIssue(issues, "missing_current_completion", "currentCompletionId", "Current completion does not exist");
  if (currentCompletion !== undefined && (currentAcceptance === undefined || currentCompletion.acceptanceId !== currentAcceptance.id || currentCompletion.milestoneRevisionId !== milestone.currentRevisionId)) addIssue(issues, "completion_acceptance_mismatch", "currentCompletionId", "Current completion must reference current acceptance for current revision");

  if (profile !== undefined) validateProfileState(issues, milestone, profile, stages.length);
  return issues;
}

function validateSources(issues: ValidationIssue[], milestone: Milestone): void {
  const seen = new Set<string>();
  const entries: readonly (readonly [string, readonly import("../../model/domain.js").MilestoneSourceLink[] | undefined, string, string])[] = [
    ["sourceLinks", milestone.sourceLinks, "milestone", milestone.id],
    ...milestone.revisions.map((item) => [`revisions.${item.id}.sourceLinks`, item.sourceLinks, "milestone_revision", item.id] as const),
    ...milestone.criteria.map((item) => [`criteria.${item.id}.sourceLinks`, item.sourceLinks, "criterion", item.id] as const),
    ...milestone.deliverables.map((item) => [`deliverables.${item.id}.sourceLinks`, item.sourceLinks, "deliverable_requirement", item.id] as const),
    ...milestone.challenges.map((item) => [`challenges.${item.id}.sourceLinks`, item.sourceLinks, "challenge", item.id] as const),
    ...milestone.reviews.map((item) => [`reviews.${item.id}.sourceLinks`, item.sourceLinks, "review", item.id] as const),
  ];
  for (const [path, links, type, id] of entries) for (const link of links ?? []) {
    try { assertValidSourceLink(link); } catch (error) { addIssue(issues, "invalid_source_link", `${path}.${link.id}`, error instanceof Error ? error.message : "Invalid Source link"); }
    if (link.subject.type !== type || link.subject.id !== id) addIssue(issues, "source_ownership_mismatch", `${path}.${link.id}`, "Source link subject does not match its owner");
    if (seen.has(link.id)) addIssue(issues, "duplicate_source_link", path, `Duplicate Source link ${link.id}`); seen.add(link.id);
  }
}

function validateChallengeEvidence(
  issues: ValidationIssue[], milestone: Milestone, challengeId: string, revisionId: string,
  evidence: readonly ChallengeEvidence[], globalIds: Set<string>,
): void {
  const byId = new Map(evidence.map((value) => [value.id, value]));
  for (const [index, value] of evidence.entries()) {
    const path = `challenges.${challengeId}.evidence.${value.id}`;
    if (!nonEmpty(value.id) || globalIds.has(value.id)) addIssue(issues, "duplicate_challenge_evidence_id", path, "Challenge evidence IDs must be globally unique");
    globalIds.add(value.id);
    if (value.milestoneId !== milestone.id || value.challengeId !== challengeId || value.milestoneRevisionId !== revisionId) addIssue(issues, "challenge_evidence_ownership_mismatch", path, "Evidence must belong to its containing challenge, milestone, and revision");
    if (!nonEmpty(value.title)) addIssue(issues, "invalid_challenge_evidence", `${path}.title`, "Evidence title must be non-empty");
    if (!nonEmpty(value.description)) addIssue(issues, "invalid_challenge_evidence", `${path}.description`, "Evidence description must be non-empty");
    if (!nonEmpty(value.createdAt) || !["supporting", "response"].includes(value.kind) || !["active", "superseded", "withdrawn"].includes(value.state)) addIssue(issues, "invalid_challenge_evidence", path, "Evidence kind, state, and creation time must be valid");
    if (value.state === "withdrawn") {
      if (value.withdrawnAt === undefined || value.withdrawalReason === undefined || !nonEmpty(value.withdrawnAt) || !nonEmpty(value.withdrawalReason)) addIssue(issues, "invalid_challenge_evidence_withdrawal", path, "Withdrawn evidence requires time and reason");
    } else if (value.withdrawnAt !== undefined || value.withdrawalReason !== undefined || value.withdrawnBy !== undefined) addIssue(issues, "invalid_challenge_evidence_withdrawal", path, "Only withdrawn evidence may carry withdrawal fields");
    if (value.supersedesEvidenceId !== undefined) {
      const predecessor = byId.get(value.supersedesEvidenceId);
      if (predecessor === undefined || predecessor.id === value.id || evidence.indexOf(predecessor) >= index) addIssue(issues, "invalid_challenge_evidence_supersession", path, "Evidence must supersede an earlier evidence record in the same challenge");
      else if (predecessor.state !== "superseded") addIssue(issues, "invalid_challenge_evidence_supersession", path, "Superseded predecessor must have superseded state");
    }
  }
  for (const value of evidence) {
    if (value.state === "superseded" && !evidence.some((candidate) => candidate.supersedesEvidenceId === value.id)) addIssue(issues, "invalid_challenge_evidence_supersession", `challenges.${challengeId}.evidence.${value.id}`, "Superseded evidence must be referenced by a successor");
    const seen = new Set<string>(); let cursor: ChallengeEvidence | undefined = value;
    while (cursor?.supersedesEvidenceId !== undefined) {
      if (seen.has(cursor.id)) { addIssue(issues, "cyclic_challenge_evidence_supersession", `challenges.${challengeId}.evidence.${value.id}`, "Evidence supersession must not cycle"); break; }
      seen.add(cursor.id); cursor = byId.get(cursor.supersedesEvidenceId);
    }
  }
}

function validateProfileState(issues: ValidationIssue[], milestone: Milestone, profile: MilestoneProfile, stageCount: number): void {
  if (profile.ref.id !== milestone.profile.id || profile.ref.version !== milestone.profile.version) addIssue(issues, "profile_mismatch", "profile", "Editor profile does not match milestone profile");
  if (!profile.criteria.enabled && milestone.criteria.length > 0) addIssue(issues, "disabled_feature_has_state", "criteria", "Criteria are disabled by profile");
  if (!profile.deliverables.enabled && milestone.deliverables.length > 0) addIssue(issues, "disabled_feature_has_state", "deliverables", "Deliverables are disabled by profile");
  if (!profile.dependencies.enabled && milestone.dependencies.length > 0) addIssue(issues, "disabled_feature_has_state", "dependencies", "Dependencies are disabled by profile");
  if (!profile.challenges.enabled && milestone.challenges.length > 0) addIssue(issues, "disabled_feature_has_state", "challenges", "Challenges are disabled by profile");
  if (!profile.reviews.enabled && milestone.reviews.length > 0) addIssue(issues, "disabled_feature_has_state", "reviews", "Reviews are disabled by profile");
  if (!profile.approvals.enabled && (stageCount > 0 || milestone.approvalRecords.length > 0)) addIssue(issues, "disabled_feature_has_state", "approvalPolicy", "Approvals are disabled by profile");
}
