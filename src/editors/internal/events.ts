import type {
  ActorRef,
  BreakdownEvent,
  MilestoneEvent,
  TaskEvent,
} from "../../model/domain.js";
import type { BreakdownEditorSession, EditorSession, TaskEditorSession } from "./session.js";

type EventType = MilestoneEvent["type"];
type EventFor<T extends EventType> = Extract<MilestoneEvent, { readonly type: T }>;

export function emit<T extends EventType>(
  session: EditorSession,
  type: T,
  payload: EventFor<T>["payload"],
  actor?: ActorRef,
): void {
  session.draft.sequence += 1;
  // TypeScript cannot correlate a generic discriminant with its extracted payload while constructing the union.
  const event = {
    id: session.ids.event(),
    type,
    milestoneId: session.draft.id,
    sequence: session.draft.sequence,
    revisionId: session.draft.currentRevisionId,
    ...(actor === undefined ? {} : { actor: structuredClone(actor) }),
    occurredAt: session.clock.now(),
    ...(session.correlationId === undefined ? {} : { correlationId: session.correlationId }),
    ...(session.causationId === undefined ? {} : { causationId: session.causationId }),
    payload: structuredClone(payload),
  } as unknown as EventFor<T>;
  session.events.push(event);
  session.draft.updatedAt = event.occurredAt;
}

type TaskEventType = TaskEvent["type"];
type TaskEventFor<T extends TaskEventType> = Extract<TaskEvent, { readonly type: T }>;

export function emitTask<T extends TaskEventType>(
  session: TaskEditorSession,
  type: T,
  payload: TaskEventFor<T>["payload"],
  actor?: ActorRef,
): void {
  session.draft.sequence += 1;
  // TypeScript cannot correlate a generic discriminant with its extracted payload while constructing the union.
  const event = {
    id: session.ids.event(),
    type,
    taskId: session.draft.id,
    sequence: session.draft.sequence,
    revisionId: session.draft.currentRevisionId,
    ...(actor === undefined ? {} : { actor: structuredClone(actor) }),
    occurredAt: session.clock.now(),
    ...(session.correlationId === undefined ? {} : { correlationId: session.correlationId }),
    ...(session.causationId === undefined ? {} : { causationId: session.causationId }),
    payload: structuredClone(payload),
  } as unknown as TaskEventFor<T>;
  session.events.push(event);
  session.draft.updatedAt = event.occurredAt;
}

type BreakdownEventType = BreakdownEvent["type"];
type BreakdownEventFor<T extends BreakdownEventType> = Extract<BreakdownEvent, { readonly type: T }>;

export function emitBreakdown<T extends BreakdownEventType>(
  session: BreakdownEditorSession,
  type: T,
  payload: BreakdownEventFor<T>["payload"],
  actor?: ActorRef,
): void {
  session.draft.sequence += 1;
  // TypeScript cannot correlate a generic discriminant with its extracted payload while constructing the union.
  const event = {
    id: session.ids.event(),
    type,
    breakdownId: session.draft.id,
    sequence: session.draft.sequence,
    ...(actor === undefined ? {} : { actor: structuredClone(actor) }),
    occurredAt: session.clock.now(),
    ...(session.correlationId === undefined ? {} : { correlationId: session.correlationId }),
    ...(session.causationId === undefined ? {} : { causationId: session.causationId }),
    payload: structuredClone(payload),
  } as unknown as BreakdownEventFor<T>;
  session.events.push(event);
  session.draft.updatedAt = event.occurredAt;
}
