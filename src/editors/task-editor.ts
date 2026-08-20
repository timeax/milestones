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
import { createSourceEditor, type MilestoneSourceEditor } from "./source-editor.js";
import { createTaskTimingEditor, type TaskTimingEditor } from "./task-timing-editor.js";
import { createTaskReminderEditor, type TaskReminderEditor } from "./task-reminder-editor.js";
import { createTaskDependencyEditor, type TaskDependencyEditor } from "./task-dependency-editor.js";
import type { DraftTask } from "./internal/draft.js";
import { emitTask } from "./internal/events.js";
import { authorizeTask, clone, ensureOpen } from "./internal/helpers.js";
import { applyTaskReopen } from "./internal/revision.js";
import type { TaskEditorSession } from "./internal/session.js";

export class TaskEditor {
  private readonly session: TaskEditorSession;
  public readonly definition: DefinitionEditor;
  public readonly timing: TaskTimingEditor;
  public readonly reminders: TaskReminderEditor;
  public readonly sources: MilestoneSourceEditor;
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
        evaluationPolicy: input.evaluationPolicy ?? {
          requiredCriteriaMustBeVerified: true,
          requiredDeliverablesMustBeSatisfied: true,
          waivedCriteriaSatisfyRequired: true,
          waivedDeliverablesSatisfyRequired: true,
          blockingChallengesPreventAcceptance: true,
          requiredReviewResult: "accepted",
          requireReviewWhenProfileRequires: true,
          requireApprovalsWhenProfileRequires: true,
          requiresAcceptance: input.profile.completion.requiresAcceptance,
          completionRequiresCurrentAcceptance: true,
          closeImmediatelyOnAcceptance: input.profile.completion.closeImmediatelyOnAcceptance,
        },
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

    return TaskEditor.open(task, input.profile, { ...options, expectedSequence: 1 });
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
    return deriveTaskState(this.session.draft as any);
  }

  public get progress(): ProgressResult {
    return calculateTaskProgress(this.session.draft as any);
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
      this.session.draft as any,
      this.session.profile,
      this.session.graph,
      this.session.artifacts,
    );
  }

  public evaluateCompletion(): TaskCompletionEvaluation {
    ensureOpen(this.session);
    return evaluateTaskCompletion(this.session.draft as any, this.session.profile);
  }

  public accept(actor?: ActorRef): TaskAcceptanceId {
    return runMutation(this.session, () => {
      ensureOpen(this.session);
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

      if (this.session.profile.completion.closeImmediatelyOnAcceptance && this.session.profile.completion.enabled) {
        this.complete(actor);
      }
      return id;
    });
  }

  public complete(actor?: ActorRef): TaskCompletionId {
    return runMutation(this.session, () => {
      ensureOpen(this.session);
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
        ...(actor === undefined ? {} : { actor }),
        completedAt: this.session.clock.now(),
      };
      this.session.draft.completionRecords.push(completion);
      this.session.draft.currentCompletionId = id;
      this.session.changes.push({ type: "completed", completionId: id });
      emitTask(this.session, "task.completed", { completion: clone(completion) }, actor);
      return id;
    });
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
    assertValidTask(this.session.draft as any, this.session.profile);
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
    this.session.closed = true;
  }
}
