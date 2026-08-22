import type {
  ApprovalStage,
  Criterion,
  DeliverableRequirement,
  TaskCriterion,
  TaskDeliverableRequirement,
} from "../../model/domain.js";
import type { ValidationIssue } from "../../model/errors.js";

export const nonEmpty = (value: string): boolean => value.trim().length > 0;
export const duplicates = (values: readonly string[]): readonly string[] =>
  [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];

export function addIssue(issues: ValidationIssue[], code: string, path: string, message: string): void {
  issues.push({ code, path, message });
}

export function validateUniqueIds(issues: ValidationIssue[], values: readonly { readonly id: string }[], path: string): void {
  for (const [index, value] of values.entries()) if (!nonEmpty(value.id)) addIssue(issues, "empty_id", `${path}.${index}.id`, "ID must be non-empty");
  for (const duplicate of duplicates(values.map((value) => value.id))) addIssue(issues, "duplicate_id", path, `Duplicate ID ${duplicate}`);
}

function validateArtifactIds(issues: ValidationIssue[], ids: readonly string[] | undefined, path: string): void {
  if (ids === undefined) return;
  if (ids.some((id) => !nonEmpty(id))) addIssue(issues, "empty_artifact_requirement", path, "Artifact requirement IDs must be non-empty");
  if (duplicates(ids).length > 0) addIssue(issues, "duplicate_artifact_requirement", path, "Artifact requirement IDs must be unique");
}

type ValidatableCriterion = Pick<
  Criterion | TaskCriterion,
  "id" | "state" | "title" | "weight" | "artifactRequirementIds"
>;

type ValidatableDeliverable = Pick<
  DeliverableRequirement | TaskDeliverableRequirement,
  "id" | "state" | "title" | "artifactRequirementIds"
>;

export function validateCriteria(issues: ValidationIssue[], criteria: readonly ValidatableCriterion[], path: string): void {
  validateUniqueIds(issues, criteria, path);
  for (const criterion of criteria) {
    if (!["not_started", "in_progress", "submitted", "verified", "failed", "waived"].includes(criterion.state)) addIssue(issues, "invalid_state", `${path}.${criterion.id}.state`, "Criterion state is invalid");
    if (!nonEmpty(criterion.title)) addIssue(issues, "empty_title", `${path}.${criterion.id}.title`, "Criterion title must be non-empty");
    if (criterion.weight !== undefined && (!Number.isFinite(criterion.weight) || criterion.weight < 0)) addIssue(issues, "invalid_weight", `${path}.${criterion.id}.weight`, "Criterion weight must be finite and non-negative");
    validateArtifactIds(issues, criterion.artifactRequirementIds, `${path}.${criterion.id}.artifactRequirementIds`);
  }
}

export function validateDeliverables(issues: ValidationIssue[], deliverables: readonly ValidatableDeliverable[], path: string): void {
  validateUniqueIds(issues, deliverables, path);
  for (const deliverable of deliverables) {
    if (!["missing", "submitted", "satisfied", "rejected", "waived"].includes(deliverable.state)) addIssue(issues, "invalid_state", `${path}.${deliverable.id}.state`, "Deliverable state is invalid");
    if (!nonEmpty(deliverable.title)) addIssue(issues, "empty_title", `${path}.${deliverable.id}.title`, "Deliverable title must be non-empty");
    validateArtifactIds(issues, deliverable.artifactRequirementIds, `${path}.${deliverable.id}.artifactRequirementIds`);
  }
}

export function validateApprovalStages(
  issues: ValidationIssue[],
  stages: readonly ApprovalStage[],
  criterionIds: ReadonlySet<string>,
  deliverableIds: ReadonlySet<string>,
  path: string,
): void {
  validateUniqueIds(issues, stages, path);
  for (const stage of stages) {
    if (!nonEmpty(stage.label)) addIssue(issues, "empty_label", `${path}.${stage.id}.label`, "Approval stage label must be non-empty");
    if (!Number.isSafeInteger(stage.requiredApprovalCount) || stage.requiredApprovalCount < 0 || (stage.required && stage.requiredApprovalCount < 1)) addIssue(issues, "invalid_approval_count", `${path}.${stage.id}.requiredApprovalCount`, "Required approval count is invalid");
    if (stage.authorityRef !== undefined && !nonEmpty(stage.authorityRef)) addIssue(issues, "empty_authority_ref", `${path}.${stage.id}.authorityRef`, "Authority reference must be non-empty when supplied");
    if (stage.scope === "criteria" && (stage.criterionIds === undefined || stage.criterionIds.length === 0)) addIssue(issues, "empty_scope", `${path}.${stage.id}.criterionIds`, "Criteria-scoped stage must identify criteria");
    if (stage.scope === "deliverables" && (stage.deliverableRequirementIds === undefined || stage.deliverableRequirementIds.length === 0)) addIssue(issues, "empty_scope", `${path}.${stage.id}.deliverableRequirementIds`, "Deliverable-scoped stage must identify deliverables");
    if (duplicates(stage.criterionIds ?? []).length > 0 || duplicates(stage.deliverableRequirementIds ?? []).length > 0) addIssue(issues, "duplicate_scope_target", `${path}.${stage.id}`, "Approval scope target IDs must be unique");
    for (const id of stage.criterionIds ?? []) if (!criterionIds.has(id)) addIssue(issues, "missing_scope_target", `${path}.${stage.id}.criterionIds`, `Approval stage references missing criterion ${id}`);
    for (const id of stage.deliverableRequirementIds ?? []) if (!deliverableIds.has(id)) addIssue(issues, "missing_scope_target", `${path}.${stage.id}.deliverableRequirementIds`, `Approval stage references missing deliverable ${id}`);
  }
}
