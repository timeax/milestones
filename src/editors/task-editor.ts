import type {
  ActorRef,
  CreateTaskInput,
  DerivedTaskState,
  ProgressResult,
  Task,
  TaskAcceptance,
  TaskAcceptanceEvaluation,
  TaskAcceptanceId,
  TaskCompletion,
  TaskCompletionEvaluation,
  TaskCompletionId,
  TaskEditResult,
  TaskProfile,
  TaskReopenRequest,
  TaskRevision,
  TaskRevisionId,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import {
  calculateTaskProgress,
  defaultTaskEvaluationPolicy,
  deriveTaskState,
  evaluateTaskAcceptance,
  evaluateTaskCompletion,
} from "../services/task-evaluation.js";
import { assertValidTask, assertValidTaskProfile } from "../services/validation.js";
import type { TaskEditorOptions } from "./editor-contracts.js";
import {
  createHistoryState,
  historyAwareCommands,
  initializeHistory,
  TaskEditorHistoryController,
  runMutation,
  runTransaction,
  type TaskEditorHistory,
} from "./editor-history.js";
import { createApprovalEditor, type ApprovalEditor } from "./approval-editor.js";
import { createChallengeEditor, type ChallengeEditor } from "./challenge-editor.js";
import { createCriteriaEditor, type CriteriaEditor } from "./criteria-editor.js";
import { createDefinitionEditor, type DefinitionEditor } from "./definition-editor.js";
import { createDeliverableEditor, type DeliverableEditor } from "./deliverable-editor.js";
import { createEvidenceEditor, type EvidenceEditor } from "./evidence-editor.js";
import { createReviewEditor, type ReviewEditor } from "./review-editor.js";
import { createRevisionEditor, type RevisionEditor } from "./revision-editor.js";
import { createSourceEditor, type SourceEditor } from "./source-editor.js";
import { createTaskTimingEditor, type TaskTimingEditor } from "./task-timing-editor.js";
import { createTaskReminderEditor, type TaskReminderEditor } from "./task-reminder-editor.js";
import { createTaskDependencyEditor, type TaskDependencyEditor } from "./task-dependency-editor.js";
import type { DraftTask } from "./internal/draft.js";
import { emitTask } from "./internal/events.js";
import { authorizeTask, clone, ensureOpen } from "./internal/helpers.js";
import { applyTaskReopen, createTaskRevisionSnapshot } from "./internal/revision.js";
import type { TaskEditorSession } from "./internal/session.js";

export class TaskEditor {
  private readonly session: TaskEditorSession;
  public readonly definition: DefinitionEditor;
  public readonly timing: TaskTimingEditor;
  public readonly reminders: TaskReminderEditor;
  public readonly sources: SourceEditor;
  public readonly criteria: CriteriaEditor;
  public readonly deliverables: DeliverableEditor;
  public readonly dependencies: TaskDependencyEditor;
  public readonly challenges: ChallengeEditor;
  public readonly evidence: EvidenceEditor;
  public readonly reviews: ReviewEditor;
  public readonly approvals: ApprovalEditor;
  public readonly revisions: RevisionEditor;
  public readonly history: TaskEditorHistory;

  private constructor(session: TaskEditorSession) {
    this.session = session;
    this.definition = historyAwareCommands(session, createDefinitionEditor(session));
    this.timing = historyAwareCommands(session, createTaskTimingEditor(session));
    this.reminders = historyAwareCommands(session, createTaskReminderEditor(session));
    this.sources = historyAwareCommands(session, createSourceEditor(session));
    this.criteria = historyAwareCommands(session, createCriteriaEditor(session));
    this.deliverables = historyAwareCommands(session, createDeliverableEditor(session));
    this.dependencies = historyAwareCommands(session, createTaskDependencyEditor(session));
    this.challenges = historyAwareCommands(session, createChallengeEditor(session));
    this.evidence = historyAwareCommands(session, createEvidenceEditor(session));
    this.reviews = historyAwareCommands(session, createReviewEditor(session));
    this.approvals = historyAwareCommands(session, createApprovalEditor(session));
    this.revisions = historyAwareCommands(session, createRevisionEditor(session));
    this.history = new TaskEditorHistoryController(session);
  }

  public static create(input: CreateTaskInput, options: TaskEditorOptions): TaskEditor {
    assertValidTaskProfile(input.profile);
    const taskId = input.id ?? options.ids.task();
    const revisionId = options.ids.revision();
    const now = options.clock.now();
    const criteria =
      input.criteria?.map((c) => ({
        ...clone(c),
        id: options.ids.criterion(),
        required: c.required ?? true,
        sourceLinks: [] as import("../model/domain.js").TaskSourceLink[],
      })) ?? [];
    const deliverables =
      input.deliverables?.map((d) => ({
        ...clone(d),
        id: options.ids.deliverableRequirement(),
        required: d.required ?? true,
        sourceLinks: [] as import("../model/domain.js").TaskSourceLink[],
      })) ?? [];
    const dependencies =
      input.dependencies?.map((dep) => ({ ...clone(dep), id: options.ids.dependency(), taskId })) ?? [];
    const approvalPolicy =
      input.approvalPolicy === undefined
        ? undefined
        : {
            stages: input.approvalPolicy.stages.map((stage) => ({
              ...clone(stage),
              id: options.ids.approvalStage(),
            })),
          };
    const revision: TaskRevision = {
      id: revisionId,
      taskId,
      number: 1,
      reason: input.revisionReason ?? "Initial task revision",
      createdAt: now,
      sourceLinks: [],
      snapshot: {
        profile: clone(input.profile.ref),
        evaluationPolicy: input.evaluationPolicy ?? defaultTaskEvaluationPolicy(input.profile),
        definition: clone(input.definition),
        criteria: criteria.map(({ state: _state, ...c }) => c),
        deliverables: deliverables.map(({ state: _state, ...d }) => d),
        dependencies: clone(dependencies),
        sources: [],
        ...(approvalPolicy === undefined ? {} : { approvalPolicy: clone(approvalPolicy) }),
        ...(input.timing === undefined ? {} : { timing: clone(input.timing) }),
      },
    };

    const task: Task = {
      id: taskId,
      profile: clone(input.profile.ref),
      scope: clone(input.scope),
      definition: clone(input.definition),
      sequence: 1,
      currentRevisionId: revisionId,
      revisions: [revision],
      criteria: revision.snapshot.criteria.map((c) => ({ ...clone(c), state: "not_started" as const, sourceLinks: [] })),
      deliverables: revision.snapshot.deliverables.map((d) => ({ ...clone(d), state: "missing" as const, sourceLinks: [] })),
      dependencies: clone(revision.snapshot.dependencies),
      challenges: [],
      reviews: [],
      ...(approvalPolicy === undefined ? {} : { approvalPolicy: clone(approvalPolicy) }),
      approvalRecords: [],
      acceptanceRecords: [],
      completionRecords: [],
      ...(revision.snapshot.timing === undefined ? {} : { timing: clone(revision.snapshot.timing) }),
      reminders: input.reminders?.map((r) => ({ ...clone(r), id: options.ids.reminder(), createdAt: now })) ?? [],
      sourceLinks: [],
      createdAt: now,
      updatedAt: now,
    };

    const editor = TaskEditor.open(task, input.profile, { ...options, expectedSequence: 1 });
    editor.session.changes.push({ type: "created" });
    editor.session.events.push({
      id: options.ids.event(),
      type: "task.created",
      taskId,
      sequence: 1,
      revisionId,
      ...(input.actor === undefined ? {} : { actor: clone(input.actor) }),
      occurredAt: now,
      ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
      ...(options.causationId === undefined ? {} : { causationId: options.causationId }),
      payload: { profile: clone(input.profile.ref), scope: clone(input.scope) },
    });
    initializeHistory(editor.session);
    return editor;
  }

  public static open(task: Task, profile: TaskProfile, options: TaskEditorOptions): TaskEditor {
    assertValidTaskProfile(profile);
    assertValidTask(task, profile);
    invariant(
      options.expectedSequence === undefined || options.expectedSequence === task.sequence,
      "CONCURRENCY_CONFLICT",
      `Expected task sequence ${options.expectedSequence}, found ${task.sequence}`,
      { expectedSequence: options.expectedSequence, actualSequence: task.sequence },
    );

    const draft: DraftTask = clone({
      ...task,
      revisions: [...task.revisions],
      criteria: [...task.criteria],
      deliverables: [...task.deliverables],
      dependencies: [...task.dependencies],
      challenges: task.challenges.map((c) => ({ ...clone(c), evidence: [...c.evidence] })),
      reviews: [...task.reviews],
      approvalRecords: [...task.approvalRecords],
      acceptanceRecords: [...task.acceptanceRecords],
      completionRecords: [...task.completionRecords],
      reminders: [...task.reminders],
    });

    const session: TaskEditorSession = {
      aggregateType: "task",
      original: clone(task),
      draft,
      profile: clone(profile),
      ...(options.graph === undefined ? {} : { graph: options.graph }),
      ...(options.artifacts === undefined ? {} : { artifacts: options.artifacts }),
      clock: options.clock,
      ids: options.ids,
      expectedSequence: task.sequence,
      ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
      ...(options.causationId === undefined ? {} : { causationId: options.causationId }),
      ...(options.authorization === undefined ? {} : { authorization: options.authorization }),
      changes: [],
      events: [],
      invalidations: [],
      historyState: createHistoryState(options.historyLimit),
      closed: false,
    };

    initializeHistory(session);
    return new TaskEditor(session);
  }

  public get task(): Task {
    return clone(this.session.draft) as Task;
  }

  public get state(): DerivedTaskState {
    return deriveTaskState(this.session.draft);
  }

  public get progress(): ProgressResult {
    return calculateTaskProgress(this.session.draft);
  }

  public get isDirty(): boolean {
    return this.session.changes.length > 0;
  }

  public get currentRevisionId(): TaskRevisionId {
    return this.session.draft.currentRevisionId;
  }

  public evaluateAcceptance(): TaskAcceptanceEvaluation {
    ensureOpen(this.session);
    return evaluateTaskAcceptance(
      this.session.draft,
      this.session.profile,
      this.session.graph,
      this.session.artifacts,
    );
  }

  public evaluateCompletion(): TaskCompletionEvaluation {
    ensureOpen(this.session);
    return evaluateTaskCompletion(
      this.session.draft,
      this.session.profile,
      this.session.graph,
      this.session.artifacts,
    );
  }

  public accept(actor?: ActorRef): TaskAcceptanceId {
    return runMutation(this.session, () => this.acceptInternal(actor));
  }

  public complete(actor?: ActorRef, reason?: string): TaskCompletionId {
    return runMutation(this.session, () => this.completeInternal(actor, reason));
  }

  public reopen(request: TaskReopenRequest): void {
    runMutation(this.session, () => {
      authorizeTask(this.session, "task.reopen", request.actor, { type: "task" });
      applyTaskReopen(this.session, request);
    });
  }

  public transact<T>(label: string, operation: (editor: TaskEditor) => T): T {
    return runTransaction(this.session, label, () => operation(this));
  }

  public commit(): TaskEditResult {
    ensureOpen(this.session);
    invariant(
      this.session.historyState.transactionDepth === 0,
      "INVALID_STATE_TRANSITION",
      "Cannot commit inside an active editor transaction",
    );
    invariant(
      this.session.original.sequence === this.session.expectedSequence,
      "CONCURRENCY_CONFLICT",
      "Original task sequence changed during edit",
    );
    if (this.session.revision !== undefined) {
      const finalRevision: TaskRevision = {
        ...this.session.revision,
        snapshot: createTaskRevisionSnapshot(this.session),
      };
      const index = this.session.draft.revisions.findIndex((item) => item.id === finalRevision.id);
      this.session.draft.revisions[index] = finalRevision;
      this.session.revision = finalRevision;
    }
    assertValidTask(this.session.draft, this.session.profile);
    this.session.closed = true;
    return {
      task: clone(this.session.draft) as Task,
      events: clone(this.session.events),
      changes: clone(this.session.changes),
      invalidations: clone(this.session.invalidations),
      ...(this.session.revision === undefined ? {} : { revision: clone(this.session.revision) }),
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

  private acceptInternal(actor?: ActorRef): TaskAcceptanceId {
    ensureOpen(this.session);
    invariant(
      this.session.draft.currentAcceptanceId === undefined,
      "LIFECYCLE_CONFLICT",
      "Task already has a current acceptance",
    );
    authorizeTask(this.session, "task.accept", actor, { type: "task" });
    const evaluation = this.evaluateAcceptance();
    invariant(
      evaluation.accepted,
      "EVALUATION_FAILED",
      "Task acceptance preconditions are not met",
      { reasons: evaluation.reasons },
    );
    const id = this.session.ids.acceptance();
    const acceptance: TaskAcceptance = {
      id,
      taskId: this.session.draft.id,
      taskRevisionId: this.session.draft.currentRevisionId,
      ...(actor === undefined ? {} : { actor }),
      acceptedAt: this.session.clock.now(),
      snapshot: evaluation.snapshot,
    };
    this.session.draft.acceptanceRecords.push(acceptance);
    this.session.draft.currentAcceptanceId = id;
    this.session.changes.push({ type: "accepted", acceptanceId: id });
    emitTask(this.session, "task.accepted", { acceptance: clone(acceptance) }, actor);

    const policy = this.currentRevision().snapshot.evaluationPolicy;
    if (this.session.profile.completion.enabled && policy.closeImmediatelyOnAcceptance) {
      this.completeInternal(actor, "Profile closes immediately on acceptance");
    }
    return id;
  }

  private completeInternal(actor?: ActorRef, reason?: string): TaskCompletionId {
    ensureOpen(this.session);
    invariant(
      this.session.draft.currentCompletionId === undefined,
      "LIFECYCLE_CONFLICT",
      "Task already has a current completion",
    );
    authorizeTask(this.session, "task.complete", actor, { type: "task" });
    const evaluation = this.evaluateCompletion();
    invariant(
      evaluation.completable,
      "EVALUATION_FAILED",
      "Task completion preconditions are not met",
      { reasons: evaluation.reasons },
    );
    const id = this.session.ids.completion();
    const completion: TaskCompletion = {
      id,
      taskId: this.session.draft.id,
      taskRevisionId: this.session.draft.currentRevisionId,
      ...(this.session.draft.currentAcceptanceId === undefined ? {} : { acceptanceId: this.session.draft.currentAcceptanceId }),
      ...(this.session.draft.currentAcceptanceId !== undefined || evaluation.evaluationSnapshot === undefined
        ? {}
        : { evaluationSnapshot: clone(evaluation.evaluationSnapshot) }),
      ...(actor === undefined ? {} : { actor }),
      ...(reason === undefined ? {} : { reason }),
      completedAt: this.session.clock.now(),
    };
    this.session.draft.completionRecords.push(completion);
    this.session.draft.currentCompletionId = id;
    this.session.changes.push({ type: "completed", completionId: id });
    emitTask(this.session, "task.completed", { completion: clone(completion) }, actor);
    return id;
  }

  private currentRevision(): TaskRevision {
    const revision = this.session.draft.revisions.find(
      (item) => item.id === this.session.draft.currentRevisionId,
    );
    invariant(revision !== undefined, "NOT_FOUND", "Current Task revision was not found");
    return revision;
  }
}
