import type { Milestone, MilestoneRevision, MilestoneRevisionSnapshot } from "../../model/domain.js";
import type { ValidationIssue } from "../../model/errors.js";
import { addIssue, duplicates, nonEmpty, validateApprovalStages, validateCriteria, validateDeliverables, validateUniqueIds } from "./common.js";

export function validateRevisionSnapshot(snapshot: MilestoneRevisionSnapshot): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!nonEmpty(snapshot.profile.id)) addIssue(issues, "empty_id", "profile.id", "Snapshot profile ID must be non-empty");
  if (!Number.isSafeInteger(snapshot.profile.version) || snapshot.profile.version < 1) addIssue(issues, "invalid_version", "profile.version", "Snapshot profile version must be positive");
  if (!nonEmpty(snapshot.definition.title)) addIssue(issues, "empty_title", "definition.title", "Milestone title must be non-empty");
  validateCriteria(issues, snapshot.criteria.map((value) => ({ ...value, state: "not_started" })), "criteria");
  validateDeliverables(issues, snapshot.deliverables.map((value) => ({ ...value, state: "missing" })), "deliverables");
  validateUniqueIds(issues, snapshot.dependencies, "dependencies");
  for (const dependency of snapshot.dependencies) if (dependency.milestoneId === dependency.dependsOnMilestoneId) addIssue(issues, "self_dependency", `dependencies.${dependency.id}`, "A milestone cannot depend on itself");
  validateApprovalStages(issues, snapshot.approvalPolicy?.stages ?? [], new Set(snapshot.criteria.map((value) => value.id)), new Set(snapshot.deliverables.map((value) => value.id)), "approvalPolicy.stages");
  return issues;
}

export function validateRevisions(issues: ValidationIssue[], milestone: Milestone): ReadonlyMap<string, MilestoneRevision> {
  validateUniqueIds(issues, milestone.revisions, "revisions");
  const revisions = new Map(milestone.revisions.map((revision) => [revision.id, revision]));
  for (const duplicate of duplicates(milestone.revisions.map((revision) => String(revision.number)))) addIssue(issues, "duplicate_revision_number", "revisions", `Duplicate revision number ${duplicate}`);
  for (const [index, revision] of milestone.revisions.entries()) {
    if (revision.milestoneId !== milestone.id) addIssue(issues, "revision_milestone_mismatch", `revisions.${revision.id}.milestoneId`, "Revision belongs to another milestone");
    if (!Number.isSafeInteger(revision.number) || revision.number !== index + 1) addIssue(issues, "invalid_revision_number", `revisions.${revision.id}.number`, "Revision numbers must be contiguous and monotonic from one");
    const expectedPrevious = index === 0 ? undefined : milestone.revisions[index - 1]!.id;
    if (revision.previousRevisionId !== expectedPrevious) addIssue(issues, "broken_revision_chain", `revisions.${revision.id}.previousRevisionId`, "Revision chain is not contiguous");
    if (revision.previousRevisionId !== undefined && !revisions.has(revision.previousRevisionId)) addIssue(issues, "missing_previous_revision", `revisions.${revision.id}.previousRevisionId`, "Previous revision does not exist");
    for (const item of validateRevisionSnapshot(revision.snapshot)) addIssue(issues, item.code, `revisions.${revision.id}.snapshot.${item.path}`, item.message);
  }
  return revisions;
}
