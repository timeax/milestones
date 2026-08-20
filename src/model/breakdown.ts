import type {
  ActorRef,
  JsonValue,
  Milestone,
  MilestoneWire,
} from "./domain.js";
import type {
  BreakdownEventId,
  BreakdownId,
  MilestoneId,
} from "./ids.js";

export interface BreakdownClock {
  now(): string;
}

export interface BreakdownIdGenerator {
  breakdown(): BreakdownId;
  event(): BreakdownEventId;
}

export interface BreakdownDefinition {
  readonly title: string;
  readonly description?: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface Breakdown {
  readonly id: BreakdownId;
  readonly parentMilestoneId: MilestoneId;
  readonly owner?: ActorRef;
  readonly definition: BreakdownDefinition;
  readonly milestones: readonly Milestone[];
  readonly sequence: number;
  readonly createdAt: string;
  readonly updatedAt?: string;
}

export type BreakdownChange =
  | { readonly type: "created" }
  | { readonly type: "definition_changed" }
  | { readonly type: "milestone_added"; readonly milestoneId: MilestoneId }
  | { readonly type: "milestone_removed"; readonly milestoneId: MilestoneId }
  | { readonly type: "milestone_replaced"; readonly milestoneId: MilestoneId; readonly previousMilestoneId?: MilestoneId }
  | { readonly type: "milestone_moved"; readonly milestoneId: MilestoneId; readonly index: number }
  | { readonly type: "milestones_reordered" };

interface BreakdownEventBase<T extends string, P> {
  readonly id: BreakdownEventId;
  readonly type: T;
  readonly breakdownId: BreakdownId;
  readonly sequence: number;
  readonly actor?: ActorRef;
  readonly occurredAt: string;
  readonly causationId?: BreakdownEventId;
  readonly correlationId?: string;
  readonly payload: P;
}

export type BreakdownCreatedEvent = BreakdownEventBase<"breakdown.created", { readonly parentMilestoneId: MilestoneId; readonly owner?: ActorRef }>;
export type BreakdownDefinitionChangedEvent = BreakdownEventBase<"breakdown.definition_changed", { readonly definition: BreakdownDefinition }>;
export type BreakdownMilestoneAddedEvent = BreakdownEventBase<"breakdown.milestone_added", { readonly milestoneId: MilestoneId }>;
export type BreakdownMilestoneRemovedEvent = BreakdownEventBase<"breakdown.milestone_removed", { readonly milestoneId: MilestoneId }>;
export type BreakdownMilestoneReplacedEvent = BreakdownEventBase<"breakdown.milestone_replaced", { readonly milestoneId: MilestoneId; readonly previousMilestoneId?: MilestoneId }>;
export type BreakdownMilestoneMovedEvent = BreakdownEventBase<"breakdown.milestone_moved", { readonly milestoneId: MilestoneId; readonly index: number }>;
export type BreakdownMilestonesReorderedEvent = BreakdownEventBase<"breakdown.milestones_reordered", { readonly milestoneIds: readonly MilestoneId[] }>;

export type BreakdownEvent =
  | BreakdownCreatedEvent
  | BreakdownDefinitionChangedEvent
  | BreakdownMilestoneAddedEvent
  | BreakdownMilestoneRemovedEvent
  | BreakdownMilestoneReplacedEvent
  | BreakdownMilestoneMovedEvent
  | BreakdownMilestonesReorderedEvent;

export interface BreakdownEditResult {
  readonly breakdown: Breakdown;
  readonly changes: readonly BreakdownChange[];
  readonly events: readonly BreakdownEvent[];
}

export interface BreakdownWire {
  readonly schemaVersion: "1.0";
  readonly id: BreakdownId;
  readonly parentMilestoneId: MilestoneId;
  readonly owner?: ActorRef;
  readonly definition: BreakdownDefinition;
  readonly milestones: readonly MilestoneWire[];
  readonly sequence: number;
  readonly createdAt: string;
  readonly updatedAt?: string;
}

export interface CreateBreakdownInput {
  readonly id?: BreakdownId;
  readonly parentMilestoneId: MilestoneId;
  readonly owner?: ActorRef;
  readonly definition: BreakdownDefinition;
  readonly milestones?: readonly Milestone[];
  readonly actor?: ActorRef;
}
