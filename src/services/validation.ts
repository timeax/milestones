import type { ApprovalRecordId, Milestone, MilestoneProfile, MilestoneRevisionSnapshot } from "../model/domain.js";
import type { ValidationIssue } from "../model/errors.js";
import { MilestoneValidationError } from "../model/errors.js";

const nonEmpty = (value: string): boolean => value.trim().length > 0;
const duplicates = (values: readonly string[]): readonly string[] => [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

export function validateProfile(profile: MilestoneProfile): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!nonEmpty(profile.ref.id)) issues.push({ code: "empty_id", path: "profile.ref.id", message: "Profile ID must be non-empty" });
  if (!Number.isSafeInteger(profile.ref.version) || profile.ref.version < 1) issues.push({ code: "invalid_version", path: "profile.ref.version", message: "Profile version must be a positive integer" });
  if (profile.reviews.required && !profile.reviews.enabled) issues.push({ code: "invalid_profile", path: "profile.reviews", message: "Required reviews must be enabled" });
  if (profile.approvals.required && !profile.approvals.enabled) issues.push({ code: "invalid_profile", path: "profile.approvals", message: "Required approvals must be enabled" });
  if (profile.completion.closeImmediatelyOnAcceptance && !profile.completion.enabled) issues.push({ code: "invalid_profile", path: "profile.completion", message: "Immediate completion requires completion to be enabled" });
  return issues;
}

export function validateRevisionSnapshot(snapshot: MilestoneRevisionSnapshot): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!nonEmpty(snapshot.definition.title)) issues.push({ code: "empty_title", path: "definition.title", message: "Milestone title must be non-empty" });
  for (const duplicate of duplicates(snapshot.criteria.map((item) => item.id))) issues.push({ code: "duplicate_id", path: "criteria", message: `Duplicate criterion ID ${duplicate}` });
  for (const duplicate of duplicates(snapshot.deliverables.map((item) => item.id))) issues.push({ code: "duplicate_id", path: "deliverables", message: `Duplicate deliverable ID ${duplicate}` });
  for (const duplicate of duplicates(snapshot.dependencies.map((item) => item.id))) issues.push({ code: "duplicate_id", path: "dependencies", message: `Duplicate dependency ID ${duplicate}` });
  for (const criterion of snapshot.criteria) {
    if (!nonEmpty(criterion.title)) issues.push({ code: "empty_title", path: `criteria.${criterion.id}.title`, message: "Criterion title must be non-empty" });
    if (criterion.weight !== undefined && (!Number.isFinite(criterion.weight) || criterion.weight < 0)) issues.push({ code: "invalid_weight", path: `criteria.${criterion.id}.weight`, message: "Criterion weight must be finite and non-negative" });
    if (criterion.artifactRequirementIds !== undefined && duplicates(criterion.artifactRequirementIds).length > 0) issues.push({ code: "duplicate_artifact_requirement", path: `criteria.${criterion.id}.artifactRequirementIds`, message: "Artifact requirement IDs must be unique" });
  }
  for (const deliverable of snapshot.deliverables) {
    if (!nonEmpty(deliverable.title)) issues.push({ code: "empty_title", path: `deliverables.${deliverable.id}.title`, message: "Deliverable title must be non-empty" });
    if (deliverable.artifactRequirementIds !== undefined && duplicates(deliverable.artifactRequirementIds).length > 0) issues.push({ code: "duplicate_artifact_requirement", path: `deliverables.${deliverable.id}.artifactRequirementIds`, message: "Artifact requirement IDs must be unique" });
  }
  for (const stage of snapshot.approvalPolicy?.stages ?? []) {
    if (!nonEmpty(stage.label)) issues.push({ code: "empty_label", path: `approvalPolicy.stages.${stage.id}.label`, message: "Approval stage label must be non-empty" });
    if (!Number.isSafeInteger(stage.requiredApprovalCount) || stage.requiredApprovalCount < 0) issues.push({ code: "invalid_approval_count", path: `approvalPolicy.stages.${stage.id}.requiredApprovalCount`, message: "Required approval count must be a non-negative integer" });
    if (stage.required && stage.requiredApprovalCount < 1) issues.push({ code: "invalid_approval_count", path: `approvalPolicy.stages.${stage.id}.requiredApprovalCount`, message: "Required stage must require at least one approval" });
    if (stage.scope === "criteria" && (stage.criterionIds === undefined || stage.criterionIds.length === 0)) issues.push({ code: "empty_scope", path: `approvalPolicy.stages.${stage.id}.criterionIds`, message: "Criteria-scoped stage must identify criteria" });
    if (stage.scope === "deliverables" && (stage.deliverableRequirementIds === undefined || stage.deliverableRequirementIds.length === 0)) issues.push({ code: "empty_scope", path: `approvalPolicy.stages.${stage.id}.deliverableRequirementIds`, message: "Deliverable-scoped stage must identify deliverables" });
    for (const criterionId of stage.criterionIds ?? []) if (!snapshot.criteria.some((criterion) => criterion.id === criterionId)) issues.push({ code: "missing_scope_target", path: `approvalPolicy.stages.${stage.id}.criterionIds`, message: `Approval stage references missing criterion ${criterionId}` });
    for (const deliverableId of stage.deliverableRequirementIds ?? []) if (!snapshot.deliverables.some((deliverable) => deliverable.id === deliverableId)) issues.push({ code: "missing_scope_target", path: `approvalPolicy.stages.${stage.id}.deliverableRequirementIds`, message: `Approval stage references missing deliverable ${deliverableId}` });
  }
  return issues;
}

export function validateMilestone(milestone: Milestone, profile?: MilestoneProfile): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!nonEmpty(milestone.id)) issues.push({ code: "empty_id", path: "id", message: "Milestone ID must be non-empty" });
  if (!Number.isSafeInteger(milestone.sequence) || milestone.sequence < 1) issues.push({ code: "invalid_sequence", path: "sequence", message: "Sequence must be a positive integer" });
  const currentRevision = milestone.revisions.find((revision) => revision.id === milestone.currentRevisionId);
  if (currentRevision === undefined) issues.push({ code: "missing_current_revision", path: "currentRevisionId", message: "Current revision does not exist" });
  else {
    issues.push(...validateRevisionSnapshot(currentRevision.snapshot));
    if (currentRevision.milestoneId !== milestone.id) issues.push({ code: "revision_milestone_mismatch", path: "currentRevisionId", message: "Current revision belongs to another milestone" });
    if (currentRevision.snapshot.profile.id !== milestone.profile.id || currentRevision.snapshot.profile.version !== milestone.profile.version) issues.push({ code: "profile_snapshot_mismatch", path: "profile", message: "Current profile must match current revision snapshot" });
  }
  const revisionIds = milestone.revisions.map((item) => item.id);
  for (const duplicate of duplicates(revisionIds)) issues.push({ code: "duplicate_id", path: "revisions", message: `Duplicate revision ID ${duplicate}` });
  const numbers = milestone.revisions.map((item) => item.number);
  for (const duplicate of duplicates(numbers.map(String))) issues.push({ code: "duplicate_revision_number", path: "revisions", message: `Duplicate revision number ${duplicate}` });
  if (milestone.revisions.some((revision, index) => index > 0 && revision.previousRevisionId !== milestone.revisions[index - 1]?.id)) issues.push({ code: "broken_revision_chain", path: "revisions", message: "Revision chain is not contiguous" });
  const dependencyKeys = new Set<string>();
  for (const dependency of milestone.dependencies) {
    if (dependency.milestoneId !== milestone.id) issues.push({ code: "dependency_milestone_mismatch", path: `dependencies.${dependency.id}.milestoneId`, message: "Dependency must belong to this milestone" });
    if (dependency.dependsOnMilestoneId === milestone.id) issues.push({ code: "self_dependency", path: `dependencies.${dependency.id}`, message: "A milestone cannot depend on itself" });
    const key = `${dependency.dependsOnMilestoneId}|${JSON.stringify(dependency.gate)}`;
    if (dependencyKeys.has(key)) issues.push({ code: "duplicate_dependency", path: `dependencies.${dependency.id}`, message: "Duplicate dependency gate" });
    dependencyKeys.add(key);
  }
  const currentAcceptance = milestone.currentAcceptanceId === undefined ? undefined : milestone.acceptanceRecords.find((record) => record.id === milestone.currentAcceptanceId);
  if (milestone.currentAcceptanceId !== undefined && currentAcceptance === undefined) issues.push({ code: "missing_current_acceptance", path: "currentAcceptanceId", message: "Current acceptance record does not exist" });
  if (currentAcceptance !== undefined && currentAcceptance.milestoneRevisionId !== milestone.currentRevisionId) issues.push({ code: "stale_current_acceptance", path: "currentAcceptanceId", message: "Current acceptance must target current revision" });
  const currentCompletion = milestone.currentCompletionId === undefined ? undefined : milestone.completionRecords.find((record) => record.id === milestone.currentCompletionId);
  if (milestone.currentCompletionId !== undefined && currentCompletion === undefined) issues.push({ code: "missing_current_completion", path: "currentCompletionId", message: "Current completion record does not exist" });
  if (currentCompletion !== undefined && (currentAcceptance === undefined || currentCompletion.acceptanceId !== currentAcceptance.id || currentCompletion.milestoneRevisionId !== currentAcceptance.milestoneRevisionId)) issues.push({ code: "completion_acceptance_mismatch", path: "currentCompletionId", message: "Current completion must reference current acceptance for the same revision" });
  for (const duplicate of duplicates(milestone.approvalRecords.map((record) => record.id))) issues.push({ code: "duplicate_id", path: "approvalRecords", message: `Duplicate approval record ID ${duplicate}` });
  const approvalsById = new Map<ApprovalRecordId, typeof milestone.approvalRecords[number]>(milestone.approvalRecords.map((record) => [record.id, record]));
  for (const record of milestone.approvalRecords) if (record.type === "revoked" && approvalsById.get(record.revokesApprovalId)?.type !== "granted") issues.push({ code: "invalid_revocation", path: `approvalRecords.${record.id}`, message: "Revocation must target a granted approval" });
  if (profile !== undefined) {
    issues.push(...validateProfile(profile));
    if (profile.ref.id !== milestone.profile.id || profile.ref.version !== milestone.profile.version) issues.push({ code: "profile_mismatch", path: "profile", message: "Editor profile does not match milestone profile" });
    if (!profile.criteria.enabled && milestone.criteria.length > 0) issues.push({ code: "disabled_feature_has_state", path: "criteria", message: "Criteria are disabled by profile" });
    if (!profile.deliverables.enabled && milestone.deliverables.length > 0) issues.push({ code: "disabled_feature_has_state", path: "deliverables", message: "Deliverables are disabled by profile" });
    if (!profile.dependencies.enabled && milestone.dependencies.length > 0) issues.push({ code: "disabled_feature_has_state", path: "dependencies", message: "Dependencies are disabled by profile" });
  }
  return issues;
}

export function assertValidMilestone(milestone: Milestone, profile?: MilestoneProfile): void {
  const issues = validateMilestone(milestone, profile);
  if (issues.length > 0) throw new MilestoneValidationError(issues);
}
