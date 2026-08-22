import type {
  ApprovalRecordId,
  Task,
  TaskApprovalRecord,
  TaskChallengeEvidence,
  TaskExecutionEvaluationSnapshot,
  TaskProfile,
  TaskRevision,
} from "../../model/domain.js";
import type { ValidationIssue } from "../../model/errors.js";
import {
  addIssue,
  duplicates,
  nonEmpty,
  validateApprovalStages,
  validateCriteria,
  validateDeliverables,
  validateUniqueIds,
} from "./common.js";
import { assertValidSourceLink } from "../sources.js";
import { taskDurationMilliseconds, taskTimestampMilliseconds } from "../task-time.js";

function sameDependencyDefinition(
  snapshot: TaskExecutionEvaluationSnapshot["dependencies"][number],
  definition: TaskRevision["snapshot"]["dependencies"][number],
): boolean {
  if (snapshot.blocking !== definition.blocking || snapshot.dependsOn.type !== definition.dependsOn.type || snapshot.dependsOn.id !== definition.dependsOn.id || snapshot.gate.type !== definition.gate.type) return false;
  if (snapshot.gate.type === "criterion" && definition.gate.type === "criterion") return snapshot.gate.criterionId === definition.gate.criterionId;
  if (snapshot.gate.type === "deliverable" && definition.gate.type === "deliverable") return snapshot.gate.deliverableRequirementId === definition.gate.deliverableRequirementId;
  return snapshot.gate.type === "accepted" || snapshot.gate.type === "completed";
}

function sameChallengeTarget(
  left: TaskExecutionEvaluationSnapshot["challenges"][number]["target"],
  right: Task["challenges"][number]["target"],
): boolean {
  if (left.type !== right.type) return false;
  if (left.type === "criterion" && right.type === "criterion") return left.criterionId === right.criterionId;
  if (left.type === "deliverable_requirement" && right.type === "deliverable_requirement") return left.deliverableRequirementId === right.deliverableRequirementId;
  if (left.type === "review" && right.type === "review") return left.reviewId === right.reviewId;
  if (left.type === "artifact" && right.type === "artifact") return left.artifactId === right.artifactId && left.artifactVersionId === right.artifactVersionId;
  if (left.type === "evidence" && right.type === "evidence") return left.ref === right.ref;
  return left.type === "task" && right.type === "task";
}

function validateTaskExecutionSnapshot(
  issues: ValidationIssue[],
  snapshot: TaskExecutionEvaluationSnapshot,
  revision: TaskRevision,
  task: Task,
  evaluatedAt: string,
  evaluatedSequence: number,
  path: string,
): void {
  if (snapshot.revisionId !== revision.id) {
    addIssue(issues, "acceptance_snapshot_revision_mismatch", `${path}.revisionId`, "Task evaluation snapshot revision must match its record");
  }
  const checks: readonly [string, readonly string[], ReadonlySet<string>, boolean][] = [
    ["criteria", snapshot.criteria.map((value) => value.id), new Set(revision.snapshot.criteria.map((value) => value.id)), true],
    ["deliverables", snapshot.deliverables.map((value) => value.id), new Set(revision.snapshot.deliverables.map((value) => value.id)), true],
    ["dependencies", snapshot.dependencies.map((value) => value.id), new Set(revision.snapshot.dependencies.map((value) => value.id)), true],
    ["challenges", snapshot.challenges.map((value) => value.id), new Set(task.challenges.filter((value) => value.taskRevisionId === revision.id && value.createdSequence < evaluatedSequence).map((value) => value.id)), true],
    ["reviews", snapshot.reviews.map((value) => value.id), new Set(task.reviews.filter((value) => value.taskRevisionId === revision.id && value.createdSequence < evaluatedSequence).map((value) => value.id)), true],
    ["approvals", snapshot.approvals.map((value) => value.stageId), new Set(revision.snapshot.approvalPolicy?.stages.map((value) => value.id) ?? []), true],
  ];
  for (const [name, ids, validIds, exact] of checks) {
    if (duplicates(ids).length > 0) addIssue(issues, "duplicate_snapshot_id", `${path}.${name}`, `Task evaluation ${name} IDs must be unique`);
    for (const id of ids) if (!validIds.has(id)) addIssue(issues, "missing_acceptance_snapshot_target", `${path}.${name}`, `Task evaluation snapshot references missing ${name} target ${id}`);
    if (exact) {
      const actualIds = new Set(ids);
      for (const id of validIds) if (!actualIds.has(id)) addIssue(issues, "incomplete_acceptance_snapshot", `${path}.${name}`, `Task evaluation snapshot is missing ${name} target ${id}`);
    }
  }
  const policy = revision.snapshot.evaluationPolicy;
  for (const value of snapshot.criteria) {
    if (!["not_started", "in_progress", "submitted", "verified", "failed", "waived"].includes(value.state)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.criteria.${value.id}.state`, "Criterion snapshot state is invalid");
    const stateSatisfied = value.state === "verified" || (value.state === "waived" && policy.waivedCriteriaSatisfyRequired);
    const definition = revision.snapshot.criteria.find((item) => item.id === value.id);
    const hasArtifactRequirements = (definition?.artifactRequirementIds?.length ?? 0) > 0;
    if ((!hasArtifactRequirements && value.satisfied !== stateSatisfied) || (value.satisfied && !stateSatisfied)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.criteria.${value.id}`, "Criterion satisfaction does not match its state, revision policy, and Artifact requirements");
  }
  for (const value of snapshot.deliverables) {
    if (!["missing", "submitted", "satisfied", "rejected", "waived"].includes(value.state)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.deliverables.${value.id}.state`, "Deliverable snapshot state is invalid");
    const stateSatisfied = value.state === "satisfied" || (value.state === "waived" && policy.waivedDeliverablesSatisfyRequired);
    const definition = revision.snapshot.deliverables.find((item) => item.id === value.id);
    const hasArtifactRequirements = (definition?.artifactRequirementIds?.length ?? 0) > 0;
    if ((!hasArtifactRequirements && value.satisfied !== stateSatisfied) || (value.satisfied && !stateSatisfied)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.deliverables.${value.id}`, "Deliverable satisfaction does not match its state, revision policy, and Artifact requirements");
  }
  for (const value of snapshot.dependencies) {
    const definition = revision.snapshot.dependencies.find((item) => item.id === value.id);
    if (definition !== undefined && !sameDependencyDefinition(value, definition)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.dependencies.${value.id}`, "Dependency snapshot does not match its revision definition");
  }
  for (const value of snapshot.reviews) {
    if (value.taskRevisionId !== revision.id) addIssue(issues, "acceptance_snapshot_revision_mismatch", `${path}.reviews.${value.id}.taskRevisionId`, "Review snapshot must target the evaluated Task revision");
    const review = task.reviews.find((item) => item.id === value.id && item.taskRevisionId === revision.id);
    if (review !== undefined && definitelyAfter(review.createdAt, evaluatedAt)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.reviews.${value.id}`, "Review did not exist when the Task evaluation was recorded");
    const completed = value.state === "completed";
    if (!["requested", "in_progress", "completed", "cancelled"].includes(value.state) || completed !== (value.result !== undefined)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.reviews.${value.id}`, "Review snapshot state and result are incoherent");
    if (value.satisfied !== (completed && value.result === policy.requiredReviewResult)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.reviews.${value.id}.satisfied`, "Review satisfaction does not match its historical state and revision policy");
    if (duplicates(value.artifactVersionIds).length > 0) addIssue(issues, "duplicate_snapshot_id", `${path}.reviews.${value.id}.artifactVersionIds`, "Review Artifact version snapshot IDs must be unique");
  }
  for (const value of snapshot.challenges) {
    const challenge = task.challenges.find((item) => item.id === value.id && item.taskRevisionId === revision.id);
    if (challenge !== undefined && (value.severity !== challenge.severity || !sameChallengeTarget(value.target, challenge.target))) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.challenges.${value.id}`, "Challenge snapshot does not match its Task challenge record");
    if (challenge !== undefined && definitelyAfter(challenge.createdAt, evaluatedAt)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.challenges.${value.id}`, "Challenge did not exist when the Task evaluation was recorded");
    if (!["open", "under_review", "resolved", "rejected", "withdrawn", "reopened"].includes(value.state)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.challenges.${value.id}.state`, "Challenge snapshot state is invalid");
    if ((value.state === "resolved") !== (value.resolution !== undefined)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.challenges.${value.id}.resolution`, "Challenge resolution must match its historical state");
    if (value.resolution !== undefined && definitelyAfter(value.resolution.resolvedAt, evaluatedAt)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.challenges.${value.id}.resolution.resolvedAt`, "Challenge was resolved after the Task evaluation was recorded");
    const expectedBlocking = policy.blockingChallengesPreventAcceptance && value.severity === "blocking" && (value.state === "open" || value.state === "under_review" || value.state === "reopened");
    if (value.blocking !== expectedBlocking) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.challenges.${value.id}.blocking`, "Challenge blocking state does not match its historical state and revision policy");
    if (duplicates(value.evidence.map((item) => item.id)).length > 0) addIssue(issues, "duplicate_snapshot_id", `${path}.challenges.${value.id}.evidence`, "Challenge evidence snapshot IDs must be unique");
    const expectedEvidenceIds = new Set(challenge?.evidence.filter((item) => item.createdSequence < evaluatedSequence).map((item) => item.id) ?? []);
    const actualEvidenceIds = new Set(value.evidence.map((item) => item.id));
    for (const id of expectedEvidenceIds) if (!actualEvidenceIds.has(id)) addIssue(issues, "incomplete_acceptance_snapshot", `${path}.challenges.${value.id}.evidence`, `Task evaluation snapshot is missing Challenge evidence ${id}`);
    for (const evidence of value.evidence) {
      const record = challenge?.evidence.find((item) => item.id === evidence.id);
      if (record === undefined || !expectedEvidenceIds.has(evidence.id)) addIssue(issues, "missing_acceptance_snapshot_target", `${path}.challenges.${value.id}.evidence`, `Task evaluation snapshot references Challenge evidence ${evidence.id} that did not exist at evaluation sequence`);
      else {
        if (record.kind !== evidence.kind || record.title !== evidence.title || record.description !== evidence.description || record.supersedesEvidenceId !== evidence.supersedesEvidenceId) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.challenges.${value.id}.evidence.${evidence.id}`, "Challenge evidence snapshot does not match its immutable definition");
        if (definitelyAfter(record.createdAt, evaluatedAt)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.challenges.${value.id}.evidence.${evidence.id}`, "Challenge evidence did not exist when the Task evaluation was recorded");
      }
      if (!["active", "superseded", "withdrawn"].includes(evidence.state) || !["pending", "resolved", "invalid"].includes(evidence.sourceStatus)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.challenges.${value.id}.evidence.${evidence.id}`, "Challenge evidence snapshot state is invalid");
    }
  }
  for (const value of snapshot.approvals) {
    if (value.taskRevisionId !== revision.id) addIssue(issues, "acceptance_snapshot_revision_mismatch", `${path}.approvals.${value.stageId}.taskRevisionId`, "Approval snapshot must target the evaluated Task revision");
    const stage = revision.snapshot.approvalPolicy?.stages.find((item) => item.id === value.stageId);
    if (stage !== undefined && value.requiredApprovalCount !== stage.requiredApprovalCount) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.approvals.${value.stageId}`, "Approval snapshot count does not match its revision stage");
    if (duplicates(value.actorIds).length > 0 || value.effectiveApprovalCount !== value.actorIds.length) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.approvals.${value.stageId}.actorIds`, "Approval snapshot count must equal its distinct actor IDs");
    if (stage !== undefined && value.satisfied !== (!stage.required || value.waived || value.effectiveApprovalCount >= stage.requiredApprovalCount)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.approvals.${value.stageId}.satisfied`, "Approval satisfaction does not match its stage and effective count");
  }
  const validRequirementIds = new Set([
    ...revision.snapshot.criteria.flatMap((value) => value.artifactRequirementIds ?? []),
    ...revision.snapshot.deliverables.flatMap((value) => value.artifactRequirementIds ?? []),
  ]);
  for (const value of snapshot.artifacts) {
    if (!validRequirementIds.has(value.artifactRequirementId)) addIssue(issues, "missing_acceptance_snapshot_target", `${path}.artifacts`, `Artifact snapshot references missing requirement ${value.artifactRequirementId}`);
    if (!["satisfied", "failed", "waived"].includes(value.outcome)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.artifacts.${value.artifactRequirementId}.outcome`, "Artifact snapshot outcome is invalid");
  }
  const sourceIds = (snapshot.sources ?? []).map((value) => value.linkId);
  if (duplicates(sourceIds).length > 0) addIssue(issues, "duplicate_snapshot_id", `${path}.sources`, "Source snapshot link IDs must be unique");
  for (const value of snapshot.sources ?? []) {
    if (!nonEmpty(value.linkId) || !nonEmpty(value.artifactId) || !["reference", "context", "specification", "decision"].includes(value.role)) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.sources.${value.linkId}`, "Source snapshot is invalid");
    if ((value.role === "specification" || value.role === "decision") && value.artifactVersionId === undefined) addIssue(issues, "incoherent_acceptance_snapshot", `${path}.sources.${value.linkId}.artifactVersionId`, "Definition-bearing Source snapshot must be version-pinned");
  }
}

function definitelyAfter(value: string, boundary: string): boolean {
  const valueTime = taskTimestampMilliseconds(value);
  const boundaryTime = taskTimestampMilliseconds(boundary);
  return valueTime !== undefined && boundaryTime !== undefined && valueTime > boundaryTime;
}

function equalDomainValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => equalDomainValue(value, right[index]));
  }
  if (left !== null && right !== null && typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Readonly<Record<string, unknown>>;
    const rightRecord = right as Readonly<Record<string, unknown>>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return equalDomainValue(leftKeys, rightKeys) && leftKeys.every((key) => equalDomainValue(leftRecord[key], rightRecord[key]));
  }
  return false;
}

function definitionWithoutMutableState(value: Record<string, unknown>): Record<string, unknown> {
  const { state: _state, sourceLinks: _sourceLinks, ...definition } = value;
  const requirementIds = definition["artifactRequirementIds"];
  return Array.isArray(requirementIds)
    ? { ...definition, artifactRequirementIds: requirementIds.filter((id): id is string => typeof id === "string").sort() }
    : definition;
}

function isIdCollection(value: unknown): value is readonly { readonly id: string }[] {
  return Array.isArray(value) && value.every(
    (item: unknown) => typeof item === "object" && item !== null && "id" in item && typeof item.id === "string",
  );
}

function sameIdCollection(
  live: unknown,
  snapshot: unknown,
  project: (value: { readonly id: string }) => unknown = (value) => value,
): boolean {
  if (!isIdCollection(live) || !isIdCollection(snapshot)) return false;
  if (live.length !== snapshot.length) return false;
  const snapshotById = new Map(snapshot.map((value) => [value.id, value]));
  return live.every((value) => {
    const other = snapshotById.get(value.id);
    return other !== undefined && equalDomainValue(project(value), project(other));
  });
}

function validateCurrentTaskRevisionCoherence(
  issues: ValidationIssue[],
  task: Task,
  revision: TaskRevision,
): void {
  if (!equalDomainValue(task.definition, revision.snapshot.definition)) {
    addIssue(issues, "current_revision_mismatch", "definition", "Current Task definition must match its current revision snapshot");
  }
  if (!sameIdCollection(
    task.criteria,
    revision.snapshot.criteria,
    (value) => definitionWithoutMutableState(value as unknown as Record<string, unknown>),
  )) addIssue(issues, "current_revision_mismatch", "criteria", "Current Task Criterion definitions must match its current revision snapshot");
  if (!sameIdCollection(
    task.deliverables,
    revision.snapshot.deliverables,
    (value) => definitionWithoutMutableState(value as unknown as Record<string, unknown>),
  )) addIssue(issues, "current_revision_mismatch", "deliverables", "Current Task Deliverable definitions must match its current revision snapshot");
  if (!sameIdCollection(task.dependencies, revision.snapshot.dependencies)) {
    addIssue(issues, "current_revision_mismatch", "dependencies", "Current Task dependencies must match its current revision snapshot");
  }
  const liveStages = task.approvalPolicy?.stages;
  const snapshotStages = revision.snapshot.approvalPolicy?.stages;
  if (
    (liveStages === undefined) !== (snapshotStages === undefined) ||
    (liveStages !== undefined && snapshotStages !== undefined && !sameIdCollection(liveStages, snapshotStages))
  ) {
    addIssue(issues, "current_revision_mismatch", "approvalPolicy", "Current Task approval policy must match its current revision snapshot");
  }
  if (!equalDomainValue(task.timing, revision.snapshot.timing)) {
    addIssue(issues, "current_revision_mismatch", "timing", "Current Task timing must match its current revision snapshot");
  }
}

function validSequenceAnchor(
  issues: ValidationIssue[],
  value: number,
  taskSequence: number,
  path: string,
): boolean {
  const valid = Number.isSafeInteger(value) && value >= 2 && value <= taskSequence;
  if (!valid) addIssue(issues, "invalid_sequence", path, "Task record sequence anchor must be an integer within the aggregate sequence");
  return valid;
}

function timestamp(
  issues: ValidationIssue[],
  value: string,
  path: string,
): number | undefined {
  const parsed = taskTimestampMilliseconds(value);
  if (parsed === undefined) addIssue(issues, "invalid_timestamp", path, "Task lifecycle timestamp must be valid");
  return parsed;
}

function notBefore(
  issues: ValidationIssue[],
  value: number | undefined,
  boundary: number | undefined,
  path: string,
  message: string,
): void {
  if (value !== undefined && boundary !== undefined && value < boundary) addIssue(issues, "invalid_timestamp_order", path, message);
}

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
  const taskCreatedTime = timestamp(issues, task.createdAt, "createdAt");
  const taskUpdatedTime = task.updatedAt === undefined ? undefined : timestamp(issues, task.updatedAt, "updatedAt");
  notBefore(issues, taskUpdatedTime, taskCreatedTime, "updatedAt", "Task updatedAt must not precede createdAt");
  const sequenceAnchors = new Map<number, string>();
  const anchoredTimes: { readonly sequence: number; readonly time: number; readonly path: string }[] = [];
  const validateAnchor = (value: number, path: string): void => {
    if (!validSequenceAnchor(issues, value, task.sequence, path)) return;
    const existing = sequenceAnchors.get(value);
    if (existing !== undefined) addIssue(issues, "duplicate_sequence", path, `Task record sequence anchor is already used by ${existing}`);
    else sequenceAnchors.set(value, path);
  };

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
    const startsAt = task.timing.startsAt === undefined ? undefined : taskTimestampMilliseconds(task.timing.startsAt);
    const dueAt = task.timing.dueAt === undefined ? undefined : taskTimestampMilliseconds(task.timing.dueAt);
    if (task.timing.startsAt !== undefined && startsAt === undefined) addIssue(issues, "invalid_timing", "timing.startsAt", "Timing startsAt must be a valid timestamp");
    if (task.timing.dueAt !== undefined && dueAt === undefined) addIssue(issues, "invalid_timing", "timing.dueAt", "Timing dueAt must be a valid timestamp");
    if (task.timing.startsAt !== undefined && task.timing.dueAt !== undefined) {
      if (startsAt !== undefined && dueAt !== undefined && dueAt < startsAt) {
        addIssue(issues, "invalid_timing_range", "timing", "Timing dueAt must be greater than or equal to startsAt");
      }
    }
  }

  // Reminders validation
  validateUniqueIds(issues, task.reminders, "reminders");
  for (const reminder of task.reminders) {
    const reminderCreatedTime = timestamp(issues, reminder.createdAt, `reminders.${reminder.id}.createdAt`);
    notBefore(issues, reminderCreatedTime, taskCreatedTime, `reminders.${reminder.id}.createdAt`, "Reminder creation must not precede Task creation");
    if (!reminder.trigger || !["at", "before_due", "after_start"].includes(reminder.trigger.type)) {
      addIssue(issues, "invalid_reminder_trigger", `reminders.${reminder.id}.trigger`, "Reminder trigger is invalid");
    } else {
      if (reminder.trigger.type === "at") {
        if (taskTimestampMilliseconds(reminder.trigger.at) === undefined) {
          addIssue(issues, "invalid_reminder_trigger", `reminders.${reminder.id}.trigger.at`, "Reminder timestamp must be valid");
        }
      } else if (reminder.trigger.type === "before_due" || reminder.trigger.type === "after_start") {
        if (taskDurationMilliseconds(reminder.trigger.duration) === undefined) {
          addIssue(issues, "invalid_reminder_trigger", `reminders.${reminder.id}.trigger.duration`, "Reminder duration must be a supported ISO 8601 duration");
        }
      }
    }
  }

  // Revisions validation
  const revisions = validateTaskRevisions(issues, task);
  const revisionTimeFor = (id: string): number | undefined => {
    const value = revisions.get(id as import("../../model/domain.js").TaskRevisionId)?.createdAt;
    return value === undefined ? undefined : taskTimestampMilliseconds(value);
  };
  let previousRevisionTime: number | undefined;
  for (const revision of task.revisions) {
    const revisionTime = timestamp(issues, revision.createdAt, `revisions.${revision.id}.createdAt`);
    notBefore(issues, revisionTime, taskCreatedTime, `revisions.${revision.id}.createdAt`, "Task revision creation must not precede Task creation");
    notBefore(issues, revisionTime, previousRevisionTime, `revisions.${revision.id}.createdAt`, "Task revision timestamps must be nondecreasing");
    if (revisionTime !== undefined) previousRevisionTime = revisionTime;
    const startsAt = revision.snapshot.timing?.startsAt === undefined ? undefined : timestamp(issues, revision.snapshot.timing.startsAt, `revisions.${revision.id}.snapshot.timing.startsAt`);
    const dueAt = revision.snapshot.timing?.dueAt === undefined ? undefined : timestamp(issues, revision.snapshot.timing.dueAt, `revisions.${revision.id}.snapshot.timing.dueAt`);
    if (startsAt !== undefined && dueAt !== undefined && dueAt < startsAt) addIssue(issues, "invalid_timing_range", `revisions.${revision.id}.snapshot.timing`, "Revision timing dueAt must not precede startsAt");
  }
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
    validateCurrentTaskRevisionCoherence(issues, task, currentRevision);
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
    validateAnchor(review.createdSequence, `reviews.${review.id}.createdSequence`);
    const reviewCreatedTime = timestamp(issues, review.createdAt, `reviews.${review.id}.createdAt`);
    if (reviewCreatedTime !== undefined && Number.isSafeInteger(review.createdSequence)) anchoredTimes.push({ sequence: review.createdSequence, time: reviewCreatedTime, path: `reviews.${review.id}.createdAt` });
    notBefore(issues, reviewCreatedTime, revisionTimeFor(review.taskRevisionId), `reviews.${review.id}.createdAt`, "Review creation must not precede its Task revision");
    const reviewCompletedTime = review.completedAt === undefined ? undefined : timestamp(issues, review.completedAt, `reviews.${review.id}.completedAt`);
    notBefore(issues, reviewCompletedTime, reviewCreatedTime, `reviews.${review.id}.completedAt`, "Review completion must not precede Review creation");
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
    validateAnchor(challenge.createdSequence, `challenges.${challenge.id}.createdSequence`);
    const challengeCreatedTime = timestamp(issues, challenge.createdAt, `challenges.${challenge.id}.createdAt`);
    if (challengeCreatedTime !== undefined && Number.isSafeInteger(challenge.createdSequence)) anchoredTimes.push({ sequence: challenge.createdSequence, time: challengeCreatedTime, path: `challenges.${challenge.id}.createdAt` });
    notBefore(issues, challengeCreatedTime, revisionTimeFor(challenge.taskRevisionId), `challenges.${challenge.id}.createdAt`, "Challenge creation must not precede its Task revision");
    const resolvedTime = challenge.resolution === undefined ? undefined : timestamp(issues, challenge.resolution.resolvedAt, `challenges.${challenge.id}.resolution.resolvedAt`);
    notBefore(issues, resolvedTime, challengeCreatedTime, `challenges.${challenge.id}.resolution.resolvedAt`, "Challenge resolution must not precede Challenge creation");
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
    for (const evidence of challenge.evidence) {
      validateAnchor(evidence.createdSequence, `challenges.${challenge.id}.evidence.${evidence.id}.createdSequence`);
      if (evidence.createdSequence <= challenge.createdSequence) addIssue(issues, "invalid_sequence_order", `challenges.${challenge.id}.evidence.${evidence.id}.createdSequence`, "Challenge evidence sequence must follow Challenge creation sequence");
      const evidenceCreatedTime = timestamp(issues, evidence.createdAt, `challenges.${challenge.id}.evidence.${evidence.id}.createdAt`);
      if (evidenceCreatedTime !== undefined && Number.isSafeInteger(evidence.createdSequence)) anchoredTimes.push({ sequence: evidence.createdSequence, time: evidenceCreatedTime, path: `challenges.${challenge.id}.evidence.${evidence.id}.createdAt` });
      notBefore(issues, evidenceCreatedTime, challengeCreatedTime, `challenges.${challenge.id}.evidence.${evidence.id}.createdAt`, "Challenge evidence creation must not precede Challenge creation");
      const withdrawnTime = evidence.withdrawnAt === undefined ? undefined : timestamp(issues, evidence.withdrawnAt, `challenges.${challenge.id}.evidence.${evidence.id}.withdrawnAt`);
      notBefore(issues, withdrawnTime, evidenceCreatedTime, `challenges.${challenge.id}.evidence.${evidence.id}.withdrawnAt`, "Challenge evidence withdrawal must not precede Evidence creation");
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
    const approvalCreatedTime = timestamp(issues, record.createdAt, `approvalRecords.${record.id}.createdAt`);
    notBefore(issues, approvalCreatedTime, revisionTimeFor(record.taskRevisionId), `approvalRecords.${record.id}.createdAt`, "Approval record creation must not precede its Task revision");
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
        if (target.taskId !== record.taskId || target.stageId !== record.stageId || target.taskRevisionId !== record.taskRevisionId) {
          addIssue(issues, "revocation_target_mismatch", `approvalRecords.${record.id}`, "Revocation target must share Task, stage, and revision");
        }
      }
    }
  }

  // Acceptance records validation
  validateUniqueIds(issues, task.acceptanceRecords, "acceptanceRecords");
  for (const acceptance of task.acceptanceRecords) {
    validateAnchor(acceptance.acceptedSequence, `acceptanceRecords.${acceptance.id}.acceptedSequence`);
    const acceptedTime = timestamp(issues, acceptance.acceptedAt, `acceptanceRecords.${acceptance.id}.acceptedAt`);
    if (acceptedTime !== undefined && Number.isSafeInteger(acceptance.acceptedSequence)) anchoredTimes.push({ sequence: acceptance.acceptedSequence, time: acceptedTime, path: `acceptanceRecords.${acceptance.id}.acceptedAt` });
    notBefore(issues, acceptedTime, revisionTimeFor(acceptance.taskRevisionId), `acceptanceRecords.${acceptance.id}.acceptedAt`, "Task acceptance must not precede its Task revision");
    if (acceptance.taskId !== task.id) {
      addIssue(issues, "acceptance_task_mismatch", `acceptanceRecords.${acceptance.id}.taskId`, "Acceptance belongs to another task");
    }
    const revision = revisions.get(acceptance.taskRevisionId);
    if (revision === undefined) {
      addIssue(issues, "missing_acceptance_revision", `acceptanceRecords.${acceptance.id}.taskRevisionId`, "Acceptance revision does not exist");
    } else {
      validateTaskExecutionSnapshot(issues, acceptance.snapshot, revision, task, acceptance.acceptedAt, acceptance.acceptedSequence, `acceptanceRecords.${acceptance.id}.snapshot`);
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
    validateAnchor(completion.completedSequence, `completionRecords.${completion.id}.completedSequence`);
    const completedTime = timestamp(issues, completion.completedAt, `completionRecords.${completion.id}.completedAt`);
    if (completedTime !== undefined && Number.isSafeInteger(completion.completedSequence)) anchoredTimes.push({ sequence: completion.completedSequence, time: completedTime, path: `completionRecords.${completion.id}.completedAt` });
    notBefore(issues, completedTime, revisionTimeFor(completion.taskRevisionId), `completionRecords.${completion.id}.completedAt`, "Task completion must not precede its Task revision");
    if (completion.taskId !== task.id) {
      addIssue(issues, "completion_task_mismatch", `completionRecords.${completion.id}.taskId`, "Completion belongs to another task");
    }
    const revision = revisions.get(completion.taskRevisionId);
    if (revision === undefined) {
      addIssue(issues, "missing_completion_revision", `completionRecords.${completion.id}.taskRevisionId`, "Completion revision does not exist");
    }
    const hasAcceptance = completion.acceptanceId !== undefined;
    const hasSnapshot = completion.evaluationSnapshot !== undefined;
    if (hasAcceptance === hasSnapshot) {
      addIssue(issues, "invalid_completion_proof", `completionRecords.${completion.id}`, "Completion must contain exactly one acceptance or direct evaluation proof");
    }
    if (completion.acceptanceId !== undefined) {
      const acceptance = task.acceptanceRecords.find((record) => record.id === completion.acceptanceId);
      if (acceptance === undefined) {
        addIssue(issues, "missing_completion_acceptance", `completionRecords.${completion.id}.acceptanceId`, "Completion acceptance does not exist");
      } else if (completion.taskRevisionId !== acceptance.taskRevisionId) {
        addIssue(issues, "completion_revision_mismatch", `completionRecords.${completion.id}.taskRevisionId`, "Completion revision must match acceptance revision");
      } else {
        notBefore(
          issues,
          completedTime,
          taskTimestampMilliseconds(acceptance.acceptedAt),
          `completionRecords.${completion.id}.completedAt`,
          "Acceptance-backed completion must not precede its acceptance",
        );
        if (completion.completedSequence <= acceptance.acceptedSequence) addIssue(issues, "invalid_sequence_order", `completionRecords.${completion.id}.completedSequence`, "Acceptance-backed completion sequence must follow its acceptance sequence");
      }
    }
    if (completion.evaluationSnapshot !== undefined && revision !== undefined) {
      validateTaskExecutionSnapshot(issues, completion.evaluationSnapshot, revision, task, completion.completedAt, completion.completedSequence, `completionRecords.${completion.id}.evaluationSnapshot`);
    }
    if (revision?.snapshot.evaluationPolicy.requiresAcceptance === true && completion.acceptanceId === undefined) {
      addIssue(issues, "missing_completion_acceptance", `completionRecords.${completion.id}.acceptanceId`, "Completion policy requires an acceptance proof");
    }
  }
  const currentCompletion =
    task.currentCompletionId === undefined
      ? undefined
      : task.completionRecords.find((record) => record.id === task.currentCompletionId);
  if (task.currentCompletionId !== undefined && currentCompletion === undefined) {
    addIssue(issues, "missing_current_completion", "currentCompletionId", "Current completion does not exist");
  }
  if (currentCompletion !== undefined && currentCompletion.taskRevisionId !== task.currentRevisionId) {
    addIssue(issues, "stale_current_completion", "currentCompletionId", "Current completion must target current revision");
  }
  if (currentCompletion?.acceptanceId !== undefined && (currentAcceptance === undefined || currentCompletion.acceptanceId !== currentAcceptance.id)) {
    addIssue(issues, "completion_acceptance_mismatch", "currentCompletionId", "Acceptance-backed current completion must reference current acceptance");
  }

  const orderedAnchors = [...anchoredTimes].sort((left, right) => left.sequence - right.sequence);
  for (let index = 1; index < orderedAnchors.length; index += 1) {
    const previous = orderedAnchors[index - 1]!;
    const current = orderedAnchors[index]!;
    if (current.time < previous.time) addIssue(issues, "invalid_timestamp_order", current.path, "Task lifecycle timestamps must be nondecreasing with aggregate sequence");
  }
  if (taskUpdatedTime !== undefined) {
    const lifecycleTimes = [
      ...task.revisions.map((value) => value.createdAt),
      ...task.reminders.map((value) => value.createdAt),
      ...task.reviews.flatMap((value) => [value.createdAt, value.completedAt]),
      ...task.challenges.flatMap((value) => [
        value.createdAt,
        value.resolution?.resolvedAt,
        ...value.evidence.flatMap((evidence) => [evidence.createdAt, evidence.withdrawnAt]),
      ]),
      ...task.approvalRecords.map((value) => value.createdAt),
      ...task.acceptanceRecords.map((value) => value.acceptedAt),
      ...task.completionRecords.map((value) => value.completedAt),
    ].flatMap((value) => value === undefined ? [] : [taskTimestampMilliseconds(value)]).filter((value): value is number => value !== undefined);
    if (lifecycleTimes.some((value) => value > taskUpdatedTime)) addIssue(issues, "invalid_timestamp_order", "updatedAt", "Task updatedAt must not precede a recorded lifecycle event");
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
  const currentRevision = task.revisions.find((revision) => revision.id === task.currentRevisionId);
  const policy = currentRevision?.snapshot.evaluationPolicy;
  if (policy !== undefined && (
    policy.requireReviewWhenProfileRequires !== profile.reviews.required
    || policy.requireApprovalsWhenProfileRequires !== profile.approvals.required
    || policy.requiresAcceptance !== profile.completion.requiresAcceptance
    || policy.closeImmediatelyOnAcceptance !== profile.completion.closeImmediatelyOnAcceptance
  )) addIssue(issues, "profile_policy_mismatch", `revisions.${task.currentRevisionId}.snapshot.evaluationPolicy`, "Current Task revision ceremony policy must match its profile");
}
