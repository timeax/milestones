import type {
  ApprovalRecordId,
  Task,
  TaskApprovalRecord,
  TaskChallengeEvidence,
  TaskProfile,
  TaskRevision,
} from "../../model/domain.js";
import type { ValidationIssue } from "../../model/errors.js";
import {
  addIssue,
  nonEmpty,
  validateApprovalStages,
  validateCriteria,
  validateDeliverables,
  validateUniqueIds,
} from "./common.js";
import { assertValidSourceLink } from "../sources.js";

export function validateTaskProfile(profile: TaskProfile): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!nonEmpty(profile.ref.id)) addIssue(issues, "empty_id", "profile.ref.id", "Profile ID must be non-empty");
  if (!Number.isSafeInteger(profile.ref.version) || profile.ref.version < 1) {
    addIssue(issues, "invalid_version", "profile.ref.version", "Profile version must be a positive integer");
  }
  if (profile.reviews.required && !profile.reviews.enabled) {
    addIssue(issues, "invalid_profile", "profile.reviews", "Required reviews must be enabled");
  }
  if (profile.approvals.required && !profile.approvals.enabled) {
    addIssue(issues, "invalid_profile", "profile.approvals", "Required approvals must be enabled");
  }
  if (profile.completion.closeImmediatelyOnAcceptance && !profile.completion.enabled) {
    addIssue(issues, "invalid_profile", "profile.completion", "Immediate completion requires completion to be enabled");
  }
  return issues;
}

export function validateTaskAggregate(task: Task, profile?: TaskProfile): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!nonEmpty(task.id)) addIssue(issues, "empty_id", "id", "Task ID must be non-empty");
  if (!Number.isSafeInteger(task.sequence) || task.sequence < 1) {
    addIssue(issues, "invalid_sequence", "sequence", "Sequence must be a positive integer");
  }
  if (!nonEmpty(task.profile.id) || !Number.isSafeInteger(task.profile.version) || task.profile.version < 1) {
    addIssue(issues, "invalid_profile_ref", "profile", "Task profile reference must contain a non-empty ID and positive version");
  }

  // Scope validation
  if (!task.scope || !["project", "milestone", "breakdown", "task"].includes(task.scope.type)) {
    addIssue(issues, "invalid_scope", "scope", "Task scope is invalid");
  } else {
    if (task.scope.type === "project" && !nonEmpty(task.scope.projectId)) {
      addIssue(issues, "empty_scope_project_id", "scope.projectId", "Project ID must be non-empty");
    } else if (task.scope.type === "milestone" && !nonEmpty(task.scope.milestoneId)) {
      addIssue(issues, "empty_scope_milestone_id", "scope.milestoneId", "Milestone ID must be non-empty");
    } else if (task.scope.type === "breakdown" && !nonEmpty(task.scope.breakdownId)) {
      addIssue(issues, "empty_scope_breakdown_id", "scope.breakdownId", "Breakdown ID must be non-empty");
    } else if (task.scope.type === "task") {
      if (!nonEmpty(task.scope.taskId)) {
        addIssue(issues, "empty_scope_task_id", "scope.taskId", "Parent Task ID must be non-empty");
      }
      if (task.scope.taskId === task.id) {
        addIssue(issues, "self_scoped_task", "scope.taskId", "A task cannot be scoped directly to itself");
      }
    }
  }

  // Timing validation
  if (task.timing !== undefined) {
    if (task.timing.startsAt !== undefined && !nonEmpty(task.timing.startsAt)) {
      addIssue(issues, "invalid_timing", "timing.startsAt", "Timing startsAt must be non-empty when present");
    }
    if (task.timing.dueAt !== undefined && !nonEmpty(task.timing.dueAt)) {
      addIssue(issues, "invalid_timing", "timing.dueAt", "Timing dueAt must be non-empty when present");
    }
    if (task.timing.startsAt !== undefined && task.timing.dueAt !== undefined) {
      if (task.timing.dueAt < task.timing.startsAt) {
        addIssue(issues, "invalid_timing_range", "timing", "Timing dueAt must be greater than or equal to startsAt");
      }
    }
  }

  // Reminders validation
  validateUniqueIds(issues, task.reminders, "reminders");
  for (const reminder of task.reminders) {
    if (!reminder.trigger || !["at", "before_due", "after_start"].includes(reminder.trigger.type)) {
      addIssue(issues, "invalid_reminder_trigger", `reminders.${reminder.id}.trigger`, "Reminder trigger is invalid");
    } else {
      if (reminder.trigger.type === "at") {
        if (!Number.isFinite(Date.parse(reminder.trigger.at))) {
          addIssue(issues, "invalid_reminder_trigger", `reminders.${reminder.id}.trigger.at`, "Reminder timestamp must be valid");
        }
      } else if (reminder.trigger.type === "before_due" || reminder.trigger.type === "after_start") {
        if (!/^P(?!$)/u.test(reminder.trigger.duration)) {
          addIssue(issues, "invalid_reminder_trigger", `reminders.${reminder.id}.trigger.duration`, "Reminder duration must be an ISO 8601 duration");
        }
      }
    }
  }

  // Revisions validation
  const revisions = validateTaskRevisions(issues, task);
  const currentRevision = revisions.get(task.currentRevisionId);
  if (currentRevision === undefined) {
    addIssue(issues, "missing_current_revision", "currentRevisionId", "Current revision does not exist");
  } else {
    if (task.revisions.at(-1)?.id !== currentRevision.id) {
      addIssue(issues, "stale_current_revision", "currentRevisionId", "Current revision must be latest");
    }
    if (
      currentRevision.snapshot.profile.id !== task.profile.id ||
      currentRevision.snapshot.profile.version !== task.profile.version
    ) {
      addIssue(issues, "profile_snapshot_mismatch", "profile", "Current profile must match current revision snapshot");
    }
  }

  validateCriteria(issues, task.criteria, "criteria");
  validateDeliverables(issues, task.deliverables, "deliverables");
  validateTaskSources(issues, task);

  // Dependencies validation
  validateUniqueIds(issues, task.dependencies, "dependencies");
  const dependencyKeys = new Set<string>();
  for (const dependency of task.dependencies) {
    if (!["accepted", "completed", "criterion", "deliverable"].includes(dependency.gate.type)) {
      addIssue(issues, "invalid_dependency_gate", `dependencies.${dependency.id}.gate.type`, "Dependency gate type is invalid");
    }
    if (dependency.taskId !== task.id) {
      addIssue(issues, "dependency_task_mismatch", `dependencies.${dependency.id}.taskId`, "Dependency must belong to this task");
    }
    if (dependency.dependsOn.type === "task" && dependency.dependsOn.id === task.id) {
      addIssue(issues, "self_dependency", `dependencies.${dependency.id}`, "A task cannot depend on itself");
    }
    const targetKey = `${dependency.dependsOn.type}:${dependency.dependsOn.id}`;
    const gateKey = dependency.gate.type === "criterion" ? dependency.gate.criterionId : dependency.gate.type === "deliverable" ? dependency.gate.deliverableRequirementId : dependency.gate.type;
    const key = `${targetKey}:${dependency.gate.type}:${gateKey}`;
    if (dependencyKeys.has(key)) {
      addIssue(issues, "duplicate_dependency", `dependencies.${dependency.id}`, "Duplicate dependency gate");
    }
    dependencyKeys.add(key);
  }

  // Reviews validation
  validateUniqueIds(issues, task.reviews, "reviews");
  for (const review of task.reviews) {
    if (!["requested", "in_progress", "completed", "cancelled"].includes(review.state)) {
      addIssue(issues, "invalid_state", `reviews.${review.id}.state`, "Review state is invalid");
    }
    if (review.result !== undefined && !["accepted", "changes_requested", "rejected"].includes(review.result)) {
      addIssue(issues, "invalid_review_result", `reviews.${review.id}.result`, "Review result is invalid");
    }
    if (review.taskId !== task.id) {
      addIssue(issues, "review_task_mismatch", `reviews.${review.id}.taskId`, "Review belongs to another task");
    }
    if (!revisions.has(review.taskRevisionId)) {
      addIssue(issues, "missing_review_revision", `reviews.${review.id}.taskRevisionId`, "Review revision does not exist");
    }
    if (review.state === "completed") {
      if (review.result === undefined || review.completedAt === undefined) {
        addIssue(issues, "incomplete_completed_review", `reviews.${review.id}`, "Completed review requires result and completion time");
      }
    } else if (review.result !== undefined || review.completedAt !== undefined || review.completedBy !== undefined) {
      addIssue(issues, "unexpected_review_result", `reviews.${review.id}`, "Only a completed review may carry completion data");
    }
  }

  // Challenges validation
  validateUniqueIds(issues, task.challenges, "challenges");
  const evidenceIds = new Set<string>();
  for (const challenge of task.challenges) {
    const target = challenge.target;
    if (!["open", "under_review", "resolved", "rejected", "withdrawn", "reopened"].includes(challenge.state)) {
      addIssue(issues, "invalid_state", `challenges.${challenge.id}.state`, "Challenge state is invalid");
    }
    if (challenge.taskId !== task.id) {
      addIssue(issues, "challenge_task_mismatch", `challenges.${challenge.id}.taskId`, "Challenge belongs to another task");
    }
    if (!revisions.has(challenge.taskRevisionId)) {
      addIssue(issues, "missing_challenge_revision", `challenges.${challenge.id}.taskRevisionId`, "Challenge revision does not exist");
    }
    if ((challenge.state === "resolved") !== (challenge.resolution !== undefined)) {
      addIssue(issues, "challenge_resolution_mismatch", `challenges.${challenge.id}.resolution`, "Resolution payload must exist exactly when resolved");
    }
    if (target.type === "criterion" && !task.criteria.some((value) => value.id === target.criterionId)) {
      addIssue(issues, "missing_challenge_target", `challenges.${challenge.id}.target`, "Challenge criterion target does not exist");
    }
    if (target.type === "deliverable_requirement" && !task.deliverables.some((value) => value.id === target.deliverableRequirementId)) {
      addIssue(issues, "missing_challenge_target", `challenges.${challenge.id}.target`, "Challenge deliverable target does not exist");
    }
    if (target.type === "review" && !task.reviews.some((value) => value.id === target.reviewId)) {
      addIssue(issues, "missing_challenge_target", `challenges.${challenge.id}.target`, "Challenge review target does not exist");
    }
    if (target.type === "evidence" && !nonEmpty(target.ref)) {
      addIssue(issues, "missing_challenge_target", `challenges.${challenge.id}.target.ref`, "Challenge evidence reference must be non-empty");
    }
    validateTaskChallengeEvidence(issues, task, challenge.id, challenge.taskRevisionId, challenge.evidence, evidenceIds);
  }

  // Approvals validation
  const stages = task.approvalPolicy?.stages ?? [];
  validateApprovalStages(
    issues,
    stages,
    new Set(task.criteria.map((value) => value.id)),
    new Set(task.deliverables.map((value) => value.id)),
    "approvalPolicy.stages",
  );
  validateUniqueIds(issues, task.approvalRecords, "approvalRecords");
  const approvals = new Map<ApprovalRecordId, TaskApprovalRecord>(task.approvalRecords.map((record) => [record.id, record]));
  for (const [index, record] of task.approvalRecords.entries()) {
    if (!["granted", "rejected", "revoked", "waived"].includes(record.type)) {
      addIssue(issues, "invalid_approval_record", `approvalRecords.${record.id}.type`, "Approval record type is invalid");
    }
    const recordTaskId = record.taskId;
    const recordRevisionId = record.taskRevisionId;
    if (recordTaskId !== task.id) {
      addIssue(issues, "approval_task_mismatch", `approvalRecords.${record.id}.taskId`, "Approval belongs to another task");
    }
    if (recordRevisionId === undefined || !revisions.has(recordRevisionId)) {
      addIssue(issues, "missing_approval_revision", `approvalRecords.${record.id}.taskRevisionId`, "Approval revision does not exist");
    }
    const approvalRevision = recordRevisionId === undefined ? undefined : revisions.get(recordRevisionId);
    if (!approvalRevision?.snapshot.approvalPolicy?.stages.some((stage) => stage.id === record.stageId)) {
      addIssue(issues, "missing_approval_stage", `approvalRecords.${record.id}.stageId`, "Approval stage does not exist in its revision snapshot");
    }
    if (record.type === "revoked") {
      const target = approvals.get(record.revokesApprovalId);
      if (target?.type !== "granted") {
        addIssue(issues, "invalid_revocation", `approvalRecords.${record.id}`, "Revocation must target a grant");
      } else {
        if (task.approvalRecords.indexOf(target) >= index) {
          addIssue(issues, "invalid_revocation_order", `approvalRecords.${record.id}`, "Grant must precede revocation");
        }
      }
    }
  }

  // Acceptance records validation
  validateUniqueIds(issues, task.acceptanceRecords, "acceptanceRecords");
  for (const acceptance of task.acceptanceRecords) {
    if (acceptance.taskId !== task.id) {
      addIssue(issues, "acceptance_task_mismatch", `acceptanceRecords.${acceptance.id}.taskId`, "Acceptance belongs to another task");
    }
    const revision = revisions.get(acceptance.taskRevisionId);
    if (revision === undefined) {
      addIssue(issues, "missing_acceptance_revision", `acceptanceRecords.${acceptance.id}.taskRevisionId`, "Acceptance revision does not exist");
    }
  }
  const currentAcceptance =
    task.currentAcceptanceId === undefined
      ? undefined
      : task.acceptanceRecords.find((record) => record.id === task.currentAcceptanceId);
  if (task.currentAcceptanceId !== undefined && currentAcceptance === undefined) {
    addIssue(issues, "missing_current_acceptance", "currentAcceptanceId", "Current acceptance does not exist");
  }
  if (currentAcceptance !== undefined && currentAcceptance.taskRevisionId !== task.currentRevisionId) {
    addIssue(issues, "stale_current_acceptance", "currentAcceptanceId", "Current acceptance must target current revision");
  }

  // Completion records validation
  validateUniqueIds(issues, task.completionRecords, "completionRecords");
  for (const completion of task.completionRecords) {
    if (completion.taskId !== task.id) {
      addIssue(issues, "completion_task_mismatch", `completionRecords.${completion.id}.taskId`, "Completion belongs to another task");
    }
    if (completion.acceptanceId !== undefined) {
      const acceptance = task.acceptanceRecords.find((record) => record.id === completion.acceptanceId);
      if (acceptance === undefined) {
        addIssue(issues, "missing_completion_acceptance", `completionRecords.${completion.id}.acceptanceId`, "Completion acceptance does not exist");
      } else if (completion.taskRevisionId !== acceptance.taskRevisionId) {
        addIssue(issues, "completion_revision_mismatch", `completionRecords.${completion.id}.taskRevisionId`, "Completion revision must match acceptance revision");
      }
    }
  }
  const currentCompletion =
    task.currentCompletionId === undefined
      ? undefined
      : task.completionRecords.find((record) => record.id === task.currentCompletionId);
  if (task.currentCompletionId !== undefined && currentCompletion === undefined) {
    addIssue(issues, "missing_current_completion", "currentCompletionId", "Current completion does not exist");
  }

  if (profile !== undefined) {
    validateTaskProfileState(issues, task, profile, stages.length);
  }

  return issues;
}

function validateTaskRevisions(issues: ValidationIssue[], task: Task): Map<import("../../model/domain.js").TaskRevisionId, TaskRevision> {
  const map = new Map<import("../../model/domain.js").TaskRevisionId, TaskRevision>();
  validateUniqueIds(issues, task.revisions, "revisions");
  for (const [index, revision] of task.revisions.entries()) {
    if (revision.taskId !== task.id) {
      addIssue(issues, "revision_task_mismatch", `revisions.${revision.id}.taskId`, "Revision belongs to another task");
    }
    if (revision.number !== index + 1) {
      addIssue(issues, "invalid_revision_number", `revisions.${revision.id}.number`, `Revision numbers must be sequential from 1 (expected ${index + 1})`);
    }
    if (index === 0 && revision.previousRevisionId !== undefined) {
      addIssue(issues, "invalid_previous_revision", `revisions.${revision.id}.previousRevisionId`, "Initial revision cannot have a previous revision");
    }
    if (index > 0 && revision.previousRevisionId !== task.revisions[index - 1]?.id) {
      addIssue(issues, "invalid_previous_revision", `revisions.${revision.id}.previousRevisionId`, "Previous revision must reference immediate predecessor");
    }
    map.set(revision.id, revision);
  }
  return map;
}

function validateTaskSources(issues: ValidationIssue[], task: Task): void {
  const seen = new Set<string>();
  const entries: readonly (readonly [string, readonly import("../../model/domain.js").TaskSourceLink[] | undefined, string, string])[] = [
    ["sourceLinks", task.sourceLinks, "task", task.id],
    ...task.revisions.map((item) => [`revisions.${item.id}.sourceLinks`, item.sourceLinks, "task_revision", item.id] as const),
    ...task.criteria.map((item) => [`criteria.${item.id}.sourceLinks`, item.sourceLinks, "criterion", item.id] as const),
    ...task.deliverables.map((item) => [`deliverables.${item.id}.sourceLinks`, item.sourceLinks, "deliverable_requirement", item.id] as const),
    ...task.challenges.map((item) => [`challenges.${item.id}.sourceLinks`, item.sourceLinks, "challenge", item.id] as const),
    ...task.reviews.map((item) => [`reviews.${item.id}.sourceLinks`, item.sourceLinks, "review", item.id] as const),
  ];
  for (const [path, links, type, id] of entries) {
    for (const link of links ?? []) {
      try {
        assertValidSourceLink(link);
      } catch (error) {
        addIssue(issues, "invalid_source_link", `${path}.${link.id}`, error instanceof Error ? error.message : "Invalid Source link");
      }
      if (link.subject.type !== type || link.subject.id !== id) {
        addIssue(issues, "source_ownership_mismatch", `${path}.${link.id}`, "Source link subject does not match its owner");
      }
      if (seen.has(link.id)) {
        addIssue(issues, "duplicate_source_link", path, `Duplicate Source link ${link.id}`);
      }
      seen.add(link.id);
    }
  }
}

function validateTaskChallengeEvidence(
  issues: ValidationIssue[],
  task: Task,
  challengeId: string,
  revisionId: string,
  evidence: readonly TaskChallengeEvidence[],
  globalIds: Set<string>,
): void {
  const byId = new Map(evidence.map((value) => [value.id, value]));
  for (const [index, value] of evidence.entries()) {
    const path = `challenges.${challengeId}.evidence.${value.id}`;
    if (!nonEmpty(value.id) || globalIds.has(value.id)) {
      addIssue(issues, "duplicate_challenge_evidence_id", path, "Challenge evidence IDs must be globally unique");
    }
    globalIds.add(value.id);
    if (value.taskId !== task.id || value.challengeId !== challengeId || value.taskRevisionId !== revisionId) {
      addIssue(issues, "challenge_evidence_ownership_mismatch", path, "Evidence must belong to its containing challenge, task, and revision");
    }
    if (!nonEmpty(value.title)) addIssue(issues, "invalid_challenge_evidence", `${path}.title`, "Evidence title must be non-empty");
    if (!nonEmpty(value.description)) addIssue(issues, "invalid_challenge_evidence", `${path}.description`, "Evidence description must be non-empty");
    if (!nonEmpty(value.createdAt) || !["supporting", "response"].includes(value.kind) || !["active", "superseded", "withdrawn"].includes(value.state)) {
      addIssue(issues, "invalid_challenge_evidence", path, "Evidence kind, state, and creation time must be valid");
    }
    if (value.state === "withdrawn") {
      if (value.withdrawnAt === undefined || value.withdrawalReason === undefined || !nonEmpty(value.withdrawnAt) || !nonEmpty(value.withdrawalReason)) {
        addIssue(issues, "invalid_challenge_evidence_withdrawal", path, "Withdrawn evidence requires time and reason");
      }
    } else if (value.withdrawnAt !== undefined || value.withdrawalReason !== undefined || value.withdrawnBy !== undefined) {
      addIssue(issues, "invalid_challenge_evidence_withdrawal", path, "Only withdrawn evidence may carry withdrawal fields");
    }
    if (value.supersedesEvidenceId !== undefined) {
      const predecessor = byId.get(value.supersedesEvidenceId);
      if (predecessor === undefined || predecessor.id === value.id || evidence.indexOf(predecessor) >= index) {
        addIssue(issues, "invalid_challenge_evidence_supersession", path, "Evidence must supersede an earlier evidence record in the same challenge");
      } else if (predecessor.state !== "superseded") {
        addIssue(issues, "invalid_challenge_evidence_supersession", path, "Superseded predecessor must have superseded state");
      }
    }
  }
}

function validateTaskProfileState(issues: ValidationIssue[], task: Task, profile: TaskProfile, stageCount: number): void {
  if (profile.ref.id !== task.profile.id || profile.ref.version !== task.profile.version) {
    addIssue(issues, "profile_mismatch", "profile", "Editor profile does not match task profile");
  }
  if (!profile.criteria.enabled && task.criteria.length > 0) addIssue(issues, "disabled_feature_has_state", "criteria", "Criteria are disabled by profile");
  if (!profile.deliverables.enabled && task.deliverables.length > 0) addIssue(issues, "disabled_feature_has_state", "deliverables", "Deliverables are disabled by profile");
  if (!profile.dependencies.enabled && task.dependencies.length > 0) addIssue(issues, "disabled_feature_has_state", "dependencies", "Dependencies are disabled by profile");
  if (!profile.challenges.enabled && task.challenges.length > 0) addIssue(issues, "disabled_feature_has_state", "challenges", "Challenges are disabled by profile");
  if (!profile.reviews.enabled && task.reviews.length > 0) addIssue(issues, "disabled_feature_has_state", "reviews", "Reviews are disabled by profile");
  if (!profile.approvals.enabled && (stageCount > 0 || task.approvalRecords.length > 0)) addIssue(issues, "disabled_feature_has_state", "approvalPolicy", "Approvals are disabled by profile");
}
