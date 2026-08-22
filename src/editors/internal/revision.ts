import type {
  ActorRef,
  MilestoneEvaluationPolicySnapshot,
  MilestoneRevision,
  MilestoneRevisionSnapshot,
  ReopenRequest,
  TaskEvaluationPolicySnapshot,
  TaskReopenRequest,
  TaskRevision,
  TaskRevisionSnapshot,
} from "../../model/domain.js";
import { invariant } from "../../model/errors.js";
import { defaultEvaluationPolicy } from "../../services/evaluation.js";
import { defaultTaskEvaluationPolicy } from "../../services/task-evaluation.js";
import {
  resolveSources,
  resolveTaskSources,
  sourceLinksForRevision,
  sourceLinksForTaskRevision,
} from "../../services/sources.js";
import { emit, emitTask } from "./events.js";
import { authorize, authorizeTask, clone, ensureOpen, feature, requiredText } from "./helpers.js";
import type { EditorSession, TaskEditorSession } from "./session.js";

export function createRevisionSnapshot(session: EditorSession): MilestoneRevisionSnapshot {
  return {
    profile: clone(session.profile.ref),
    evaluationPolicy: session.revision?.snapshot.evaluationPolicy ?? defaultEvaluationPolicy(session.profile),
    definition: clone(session.draft.definition),
    criteria: session.draft.criteria.map(({ state: _state, ...definition }) => clone(definition)),
    deliverables: session.draft.deliverables.map(({ state: _state, ...definition }) => clone(definition)),
    dependencies: clone(session.draft.dependencies),
    sources: resolveSources(sourceLinksForRevision(session.draft, session.draft.currentRevisionId), session.artifacts),
    ...(session.draft.approvalPolicy === undefined
      ? {}
      : { approvalPolicy: clone(session.draft.approvalPolicy) }),
  };
}

export function beginMaterialRevision(
  session: EditorSession,
  reason = "Material milestone change",
  actor?: ActorRef,
  evaluationPolicy: MilestoneEvaluationPolicySnapshot = defaultEvaluationPolicy(session.profile),
): MilestoneRevision["id"] {
  ensureOpen(session);
  feature(session.profile.revisions.enabled, "revisions");
  authorize(session, "milestone.revise", actor, { type: "milestone" });
  if (session.revision !== undefined) return session.revision.id;
  const previousRevisionId = session.draft.currentRevisionId;
  const revision: MilestoneRevision = {
    id: session.ids.revision(),
    milestoneId: session.draft.id,
    number: session.draft.revisions.length + 1,
    previousRevisionId,
    reason,
    ...(actor === undefined ? {} : { actor }),
    createdAt: session.clock.now(),
    sourceLinks: [],
    snapshot: { ...createRevisionSnapshot(session), evaluationPolicy },
  };
  session.draft.revisions.push(revision);
  session.draft.currentRevisionId = revision.id;
  if (session.draft.currentCompletionId !== undefined) {
    session.invalidations.push({
      type: "completion",
      ref: session.draft.currentCompletionId,
      reason: `Material revision ${revision.id}`,
    });
  }
  if (session.draft.currentAcceptanceId !== undefined) {
    session.invalidations.push({
      type: "acceptance",
      ref: session.draft.currentAcceptanceId,
      reason: `Material revision ${revision.id}`,
    });
  }
  delete session.draft.currentCompletionId;
  delete session.draft.currentAcceptanceId;
  session.revision = revision;
  session.changes.push({ type: "revised", revisionId: revision.id });
  emit(session, "milestone.revised", { revisionId: revision.id, previousRevisionId, reason }, actor);
  return revision.id;
}

export function applyReopen(session: EditorSession, request: ReopenRequest): void {
  ensureOpen(session);
  requiredText(request.reason, "Reopen reason");
  const acceptanceInvalidatingCauses = new Set([
    "revision",
    "challenge",
    "approval_revocation",
    "dependency_invalidation",
    "artifact_invalidation",
  ]);
  invariant(
    request.cause === undefined
      || !acceptanceInvalidatingCauses.has(request.cause.type)
      || request.effect === "invalidate_acceptance_and_completion",
    "INVALID_ARGUMENT",
    `Reopening cause ${request.cause?.type ?? "unknown"} must invalidate acceptance and completion`,
    { cause: request.cause, effect: request.effect },
  );
  const hadCompletion = session.draft.currentCompletionId !== undefined;
  const hadAcceptance = session.draft.currentAcceptanceId !== undefined;
  invariant(
    hadCompletion || (request.effect === "invalidate_acceptance_and_completion" && hadAcceptance),
    "LIFECYCLE_CONFLICT",
    "Requested reopening has no current lifecycle state to invalidate",
  );
  if (hadCompletion) {
    session.invalidations.push({
      type: "completion",
      ref: session.draft.currentCompletionId!,
      reason: request.reason,
    });
    delete session.draft.currentCompletionId;
  }
  if (request.effect === "invalidate_acceptance_and_completion" && hadAcceptance) {
    session.invalidations.push({
      type: "acceptance",
      ref: session.draft.currentAcceptanceId!,
      reason: request.reason,
    });
    delete session.draft.currentAcceptanceId;
  }
  session.changes.push({ type: "reopened", effect: request.effect });
  emit(
    session,
    "milestone.reopened",
    {
      effect: request.effect,
      reason: request.reason,
      ...(request.cause === undefined ? {} : { cause: request.cause }),
    },
    request.actor,
  );
}

export function createTaskRevisionSnapshot(session: TaskEditorSession): TaskRevisionSnapshot {
  return {
    profile: clone(session.profile.ref),
    evaluationPolicy: session.revision?.snapshot.evaluationPolicy ?? defaultTaskEvaluationPolicy(session.profile),
    definition: clone(session.draft.definition),
    criteria: session.draft.criteria.map(({ state: _state, ...definition }) => clone(definition)),
    deliverables: session.draft.deliverables.map(({ state: _state, ...definition }) => clone(definition)),
    dependencies: clone(session.draft.dependencies),
    sources: resolveTaskSources(
      sourceLinksForTaskRevision(session.draft, session.draft.currentRevisionId),
      session.artifacts,
    ),
    ...(session.draft.approvalPolicy === undefined
      ? {}
      : { approvalPolicy: clone(session.draft.approvalPolicy) }),
    ...(session.draft.timing === undefined
      ? {}
      : { timing: clone(session.draft.timing) }),
  };
}

export function beginMaterialTaskRevision(
  session: TaskEditorSession,
  reason = "Material task change",
  actor?: ActorRef,
  evaluationPolicy?: TaskEvaluationPolicySnapshot,
): TaskRevision["id"] {
  ensureOpen(session);
  feature(session.profile.revisions.enabled, "revisions");
  authorizeTask(session, "task.revise", actor, { type: "task" });
  if (session.revision !== undefined) return session.revision.id;
  const previousRevisionId = session.draft.currentRevisionId;
  const previousRevision = session.draft.revisions.find((item) => item.id === previousRevisionId);
  invariant(previousRevision !== undefined, "NOT_FOUND", `Current Task revision ${previousRevisionId} was not found`);
  const effectiveEvaluationPolicy = evaluationPolicy ?? previousRevision.snapshot.evaluationPolicy;
  const revision: TaskRevision = {
    id: session.ids.revision(),
    taskId: session.draft.id,
    number: session.draft.revisions.length + 1,
    previousRevisionId,
    reason,
    ...(actor === undefined ? {} : { actor }),
    createdAt: session.clock.now(),
    sourceLinks: [],
    snapshot: { ...createTaskRevisionSnapshot(session), evaluationPolicy: clone(effectiveEvaluationPolicy) },
  };
  session.draft.revisions.push(revision);
  session.draft.currentRevisionId = revision.id;
  if (session.draft.currentCompletionId !== undefined) {
    session.invalidations.push({
      type: "completion",
      ref: session.draft.currentCompletionId,
      reason: `Material revision ${revision.id}`,
    });
  }
  if (session.draft.currentAcceptanceId !== undefined) {
    session.invalidations.push({
      type: "acceptance",
      ref: session.draft.currentAcceptanceId,
      reason: `Material revision ${revision.id}`,
    });
  }
  delete session.draft.currentCompletionId;
  delete session.draft.currentAcceptanceId;
  session.revision = revision;
  session.changes.push({ type: "revised", revisionId: revision.id });
  emitTask(session, "task.revised", { revisionId: revision.id, previousRevisionId, reason }, actor);
  return revision.id;
}

export function applyTaskReopen(session: TaskEditorSession, request: TaskReopenRequest): void {
  ensureOpen(session);
  requiredText(request.reason, "Reopen reason");
  const acceptanceInvalidatingCauses = new Set([
    "revision",
    "challenge",
    "approval_revocation",
    "dependency_invalidation",
    "artifact_invalidation",
  ]);
  invariant(
    request.cause === undefined
      || !acceptanceInvalidatingCauses.has(request.cause.type)
      || request.effect === "invalidate_acceptance_and_completion",
    "INVALID_ARGUMENT",
    `Reopening cause ${request.cause?.type ?? "unknown"} must invalidate acceptance and completion`,
    { cause: request.cause, effect: request.effect },
  );
  const hadCompletion = session.draft.currentCompletionId !== undefined;
  const hadAcceptance = session.draft.currentAcceptanceId !== undefined;
  invariant(
    hadCompletion || (request.effect === "invalidate_acceptance_and_completion" && hadAcceptance),
    "LIFECYCLE_CONFLICT",
    "Requested reopening has no current lifecycle state to invalidate",
  );
  if (hadCompletion) {
    session.invalidations.push({
      type: "completion",
      ref: session.draft.currentCompletionId!,
      reason: request.reason,
    });
    delete session.draft.currentCompletionId;
  }
  if (request.effect === "invalidate_acceptance_and_completion" && hadAcceptance) {
    session.invalidations.push({
      type: "acceptance",
      ref: session.draft.currentAcceptanceId!,
      reason: request.reason,
    });
    delete session.draft.currentAcceptanceId;
  }
  session.changes.push({ type: "reopened", effect: request.effect });
  emitTask(
    session,
    "task.reopened",
    {
      effect: request.effect,
      reason: request.reason,
      ...(request.cause === undefined ? {} : { cause: request.cause }),
    },
    request.actor,
  );
}
