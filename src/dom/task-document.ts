import type {
  ProgressResult,
  Task,
  TaskAcceptanceEvaluation,
  TaskArtifactContext,
  TaskCompletionEvaluation,
  TaskId,
  TaskProfile,
  TaskProfileId,
  TaskReminder,
  TaskReminderId,
  TaskReminderTrigger,
  TaskScope,
  TaskTiming,
} from "../model/domain.js";
import {
  calculateTaskProgress,
  deriveTaskState,
  evaluateTaskAcceptance,
  evaluateTaskCompletion,
} from "../services/task-evaluation.js";
import { assertValidTask, assertValidTaskProfile } from "../services/validation.js";
import type { TaskGraphSnapshot } from "../services/task-graph.js";
import {
  createCriteriaDocument,
  createDefinitionDocument,
  createDeliverablesDocument,
  createProgressDocument,
  createSourcesDocument,
} from "./documents/index.js";
import type {
  CriteriaDocument,
  DeliverablesDocument,
  MilestoneDefinitionDocument,
  MilestoneProgressDocument,
  MilestoneSourcesDocument,
  TextDocument,
} from "./types.js";

export interface TaskDocumentContext {
  readonly task: Task;
  readonly profile: TaskProfile;
  readonly graph?: TaskGraphSnapshot;
  readonly artifacts?: TaskArtifactContext;
}

export interface TaskDocumentBuildInput {
  readonly task: Task;
  readonly profile: TaskProfile;
  readonly graph?: TaskGraphSnapshot;
  readonly artifacts?: TaskArtifactContext;
}

export interface TaskProfileDocument {
  getId(): TaskProfileId;
  getVersion(): number;
  hasCriteria(): boolean;
  hasDeliverables(): boolean;
  hasDependencies(): boolean;
  hasRevisions(): boolean;
  hasChallenges(): boolean;
  hasReviews(): boolean;
  requiresReviews(): boolean;
  hasApprovals(): boolean;
  requiresApprovals(): boolean;
  hasCompletion(): boolean;
  requiresAcceptance(): boolean;
  closeImmediatelyOnAcceptance(): boolean;
}

export interface TaskTimingDocument {
  getStartsAt(): string | undefined;
  getDueAt(): string | undefined;
  getTimeZone(): string | undefined;
  isOverdue(asOf?: string): boolean;
  toObject(): TaskTiming | undefined;
}

export interface TaskRemindersDocument {
  list(): readonly TaskReminder[];
  get(id: TaskReminderId): TaskReminder | undefined;
  has(id: TaskReminderId): boolean;
  hasReminders(): boolean;
  getByTriggerType(type: TaskReminderTrigger["type"]): readonly TaskReminder[];
  count(): number;
}

export interface TaskScopeDocument {
  readonly type: TaskScope["type"];
  getProjectId(): string | undefined;
  getMilestoneId(): import("../model/domain.js").MilestoneId | undefined;
  getBreakdownId(): import("../model/domain.js").BreakdownId | undefined;
  getParentTaskId(): TaskId | undefined;
  getTaskId(): TaskId | undefined;
}

export interface TaskOverviewDocument {
  getId(): TaskId;
  getState(): string;
  getScope(): TaskScope;
  getTitle(): string;
  getDescription(): string | undefined;
  getSequence(): number;
  getCurrentRevisionId(): string;
  getCreatedAt(): string;
  getUpdatedAt(): string;
  getProgress(): ProgressResult;
}

export interface TaskAcceptanceStatusDocument {
  isAccepted(): boolean;
  getEvaluation(): TaskAcceptanceEvaluation;
}

export interface TaskCompletionStatusDocument {
  isCompleted(): boolean;
  getEvaluation(): TaskCompletionEvaluation;
}

class TaskProfileDocumentImpl implements TaskProfileDocument {
  constructor(private readonly profile: TaskProfile) {}
  getId(): TaskProfileId { return this.profile.ref.id; }
  getVersion(): number { return this.profile.ref.version; }
  hasCriteria(): boolean { return this.profile.criteria.enabled; }
  hasDeliverables(): boolean { return this.profile.deliverables.enabled; }
  hasDependencies(): boolean { return this.profile.dependencies.enabled; }
  hasRevisions(): boolean { return this.profile.revisions.enabled; }
  hasChallenges(): boolean { return this.profile.challenges.enabled; }
  hasReviews(): boolean { return this.profile.reviews.enabled; }
  requiresReviews(): boolean { return this.profile.reviews.enabled && this.profile.reviews.required; }
  hasApprovals(): boolean { return this.profile.approvals.enabled; }
  requiresApprovals(): boolean { return this.profile.approvals.enabled && this.profile.approvals.required; }
  hasCompletion(): boolean { return this.profile.completion.enabled; }
  requiresAcceptance(): boolean { return this.profile.completion.requiresAcceptance; }
  closeImmediatelyOnAcceptance(): boolean { return this.profile.completion.closeImmediatelyOnAcceptance; }
}

class TaskTimingDocumentImpl implements TaskTimingDocument {
  constructor(private readonly timing?: TaskTiming) {}
  getStartsAt(): string | undefined { return this.timing?.startsAt; }
  getDueAt(): string | undefined { return this.timing?.dueAt; }
  getTimeZone(): string | undefined { return this.timing?.timeZone; }
  isOverdue(asOf?: string): boolean {
    if (this.timing?.dueAt === undefined) return false;
    const now = asOf ?? new Date().toISOString();
    return now > this.timing.dueAt;
  }
  toObject(): TaskTiming | undefined {
    return this.timing === undefined ? undefined : structuredClone(this.timing);
  }
}

class TaskRemindersDocumentImpl implements TaskRemindersDocument {
  constructor(private readonly reminders: readonly TaskReminder[]) {}
  list(): readonly TaskReminder[] { return structuredClone(this.reminders); }
  get(id: TaskReminderId): TaskReminder | undefined {
    const found = this.reminders.find((item) => item.id === id);
    return found === undefined ? undefined : structuredClone(found);
  }
  has(id: TaskReminderId): boolean { return this.reminders.some((item) => item.id === id); }
  hasReminders(): boolean { return this.reminders.length > 0; }
  getByTriggerType(type: TaskReminderTrigger["type"]): readonly TaskReminder[] {
    return structuredClone(this.reminders.filter((item) => item.trigger.type === type));
  }
  count(): number { return this.reminders.length; }
}

class TaskScopeDocumentImpl implements TaskScopeDocument {
  constructor(private readonly scope: TaskScope) {}
  get type(): TaskScope["type"] { return this.scope.type; }
  getProjectId(): string | undefined { return this.scope.type === "project" ? this.scope.projectId : undefined; }
  getMilestoneId(): import("../model/domain.js").MilestoneId | undefined { return this.scope.type === "milestone" ? this.scope.milestoneId : undefined; }
  getBreakdownId(): import("../model/domain.js").BreakdownId | undefined { return this.scope.type === "breakdown" ? this.scope.breakdownId : undefined; }
  getParentTaskId(): TaskId | undefined { return this.scope.type === "task" ? this.scope.taskId : undefined; }
  getTaskId(): TaskId | undefined { return this.getParentTaskId(); }
}

export class TaskDocument {
  readonly #context: TaskDocumentContext;
  #profile?: TaskProfileDocument;
  #definition?: MilestoneDefinitionDocument;
  #timing?: TaskTimingDocument;
  #reminders?: TaskRemindersDocument;
  #scope?: TaskScopeDocument;
  #progress?: MilestoneProgressDocument;
  #criteria?: CriteriaDocument;
  #deliverables?: DeliverablesDocument;
  #sources?: MilestoneSourcesDocument;

  constructor(context: TaskDocumentContext) {
    this.#context = context;
  }

  getId(): TaskId { return this.#context.task.id; }
  getState(): string { return deriveTaskState(this.#context.task as any); }
  getProfile(): TaskProfileDocument { return (this.#profile ??= new TaskProfileDocumentImpl(this.#context.profile)); }
  getScope(): TaskScopeDocument { return (this.#scope ??= new TaskScopeDocumentImpl(this.#context.task.scope)); }
  getTiming(): TaskTimingDocument { return (this.#timing ??= new TaskTimingDocumentImpl(this.#context.task.timing)); }
  getReminders(): TaskRemindersDocument { return (this.#reminders ??= new TaskRemindersDocumentImpl(this.#context.task.reminders)); }
  getDefinition(): MilestoneDefinitionDocument {
    return (this.#definition ??= createDefinitionDocument(this.#context.task.definition));
  }
  getDescription(): TextDocument { return this.getDefinition().getDescription(); }
  getProgress(): MilestoneProgressDocument {
    return (this.#progress ??= createProgressDocument(calculateTaskProgress(this.#context.task as any)));
  }
  getCriteria(): CriteriaDocument {
    return (this.#criteria ??= createCriteriaDocument({ ...this.#context, milestone: this.#context.task as any } as any));
  }
  getDeliverables(): DeliverablesDocument {
    return (this.#deliverables ??= createDeliverablesDocument({ ...this.#context, milestone: this.#context.task as any } as any));
  }
  getSources(): MilestoneSourcesDocument {
    return (this.#sources ??= createSourcesDocument(this.#context.task.sourceLinks as any ?? [], this.#context.artifacts as any));
  }
  getAcceptanceStatus(): TaskAcceptanceStatusDocument {
    const evalResult = evaluateTaskAcceptance(this.#context.task, this.#context.profile, this.#context.graph, this.#context.artifacts);
    return {
      isAccepted: () => this.#context.task.currentAcceptanceId !== undefined,
      getEvaluation: () => evalResult,
    };
  }
  getCompletionStatus(): TaskCompletionStatusDocument {
    const evalResult = evaluateTaskCompletion(this.#context.task, this.#context.profile);
    return {
      isCompleted: () => this.#context.task.currentCompletionId !== undefined,
      getEvaluation: () => evalResult,
    };
  }
}

export function createTaskDocumentContext(input: TaskDocumentBuildInput): TaskDocumentContext {
  assertValidTaskProfile(input.profile);
  assertValidTask(input.task, input.profile);
  return {
    task: input.task,
    profile: input.profile,
    ...(input.graph === undefined ? {} : { graph: input.graph }),
    ...(input.artifacts === undefined ? {} : { artifacts: input.artifacts }),
  };
}

export function createTaskDocument(input: TaskDocumentBuildInput): TaskDocument {
  return new TaskDocument(createTaskDocumentContext(input));
}

export class TaskDocumentBuilder {
  readonly #task: Task;
  readonly #profile: TaskProfile;
  #graph?: TaskGraphSnapshot | undefined;
  #artifacts?: TaskArtifactContext | undefined;

  constructor(task: Task, profile: TaskProfile) {
    this.#task = task;
    this.#profile = profile;
  }

  withGraph(graph: TaskGraphSnapshot | undefined): this {
    this.#graph = graph;
    return this;
  }

  withArtifacts(artifacts: TaskArtifactContext | undefined): this {
    this.#artifacts = artifacts;
    return this;
  }

  build(): TaskDocument {
    return createTaskDocument({
      task: this.#task,
      profile: this.#profile,
      ...(this.#graph === undefined ? {} : { graph: this.#graph }),
      ...(this.#artifacts === undefined ? {} : { artifacts: this.#artifacts }),
    });
  }
}
