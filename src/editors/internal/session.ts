import type {
  Breakdown,
  BreakdownChange,
  BreakdownClock,
  BreakdownEvent,
  BreakdownEventId,
  BreakdownIdGenerator,
  EvaluationInvalidation,
  Milestone,
  MilestoneArtifactContext,
  MilestoneChange,
  MilestoneClock,
  MilestoneEvent,
  MilestoneGraphSnapshot,
  MilestoneIdGenerator,
  MilestoneProfile,
  MilestoneRevision,
  Task,
  TaskArtifactContext,
  TaskChange,
  TaskClock,
  TaskEvent,
  TaskEventId,
  TaskIdGenerator,
  TaskProfile,
  TaskRevision,
} from "../../model/domain.js";
import type {
  BreakdownAuthorizationContext,
  MilestoneAuthorizationContext,
  MilestoneEditorOptions,
  TaskAuthorizationContext,
} from "../editor-contracts.js";
import type { TaskGraphSnapshot } from "../../services/task-graph.js";
import type { DraftBreakdown, DraftMilestone, DraftTask } from "./draft.js";

export type EditorOptions = MilestoneEditorOptions;

export interface EditorHistorySnapshot {
  readonly draft: DraftMilestone;
  readonly profile: MilestoneProfile;
  readonly changes: readonly MilestoneChange[];
  readonly events: readonly MilestoneEvent[];
  readonly invalidations: readonly EvaluationInvalidation[];
  readonly revision?: MilestoneRevision;
}

export interface EditorHistoryState<TSnapshot = EditorHistorySnapshot> {
  snapshots: TSnapshot[];
  index: number;
  readonly limit: number;
  transactionDepth: number;
  transactionMutationCount: number;
}

export interface EditorSession {
  readonly original: Milestone;
  draft: DraftMilestone;
  profile: MilestoneProfile;
  readonly graph?: MilestoneGraphSnapshot;
  readonly artifacts?: MilestoneArtifactContext;
  readonly clock: MilestoneClock;
  readonly ids: MilestoneIdGenerator;
  readonly expectedSequence: number;
  readonly correlationId?: string;
  readonly causationId?: import("../../model/domain.js").MilestoneEventId;
  readonly authorization?: MilestoneAuthorizationContext;
  changes: MilestoneChange[];
  events: MilestoneEvent[];
  invalidations: EvaluationInvalidation[];
  revision?: MilestoneRevision;
  readonly historyState: EditorHistoryState<EditorHistorySnapshot>;
  closed: boolean;
}

export interface TaskEditorHistorySnapshot {
  readonly draft: DraftTask;
  readonly profile: TaskProfile;
  readonly changes: readonly TaskChange[];
  readonly events: readonly TaskEvent[];
  readonly invalidations: readonly EvaluationInvalidation[];
  readonly revision?: TaskRevision;
}

export interface TaskEditorSession {
  readonly original: Task;
  draft: DraftTask;
  profile: TaskProfile;
  readonly graph?: TaskGraphSnapshot;
  readonly artifacts?: TaskArtifactContext;
  readonly clock: TaskClock;
  readonly ids: TaskIdGenerator;
  readonly expectedSequence: number;
  readonly correlationId?: string;
  readonly causationId?: TaskEventId;
  readonly authorization?: TaskAuthorizationContext;
  changes: TaskChange[];
  events: TaskEvent[];
  invalidations: EvaluationInvalidation[];
  revision?: TaskRevision;
  readonly historyState: EditorHistoryState<TaskEditorHistorySnapshot>;
  closed: boolean;
}

export interface BreakdownEditorHistorySnapshot {
  readonly draft: DraftBreakdown;
  readonly changes: readonly BreakdownChange[];
  readonly events: readonly BreakdownEvent[];
}

export interface BreakdownEditorSession {
  readonly original: Breakdown;
  draft: DraftBreakdown;
  readonly clock: BreakdownClock;
  readonly ids: BreakdownIdGenerator;
  readonly expectedSequence: number;
  readonly correlationId?: string;
  readonly causationId?: BreakdownEventId;
  readonly authorization?: BreakdownAuthorizationContext;
  changes: BreakdownChange[];
  events: BreakdownEvent[];
  readonly historyState: EditorHistoryState<BreakdownEditorHistorySnapshot>;
  closed: boolean;
}
