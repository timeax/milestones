import type {
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
} from "../../model/domain.js";
import type { MilestoneEditorOptions } from "../editor-contracts.js";
import type { MilestoneAuthorizationContext } from "../editor-contracts.js";
import type { DraftMilestone } from "./draft.js";

export type EditorOptions = MilestoneEditorOptions;

export interface EditorHistorySnapshot {
  readonly draft: DraftMilestone;
  readonly profile: MilestoneProfile;
  readonly changes: readonly MilestoneChange[];
  readonly events: readonly MilestoneEvent[];
  readonly invalidations: readonly EvaluationInvalidation[];
  readonly revision?: MilestoneRevision;
}

export interface EditorHistoryState {
  snapshots: EditorHistorySnapshot[];
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
  readonly historyState: EditorHistoryState;
  closed: boolean;
}
