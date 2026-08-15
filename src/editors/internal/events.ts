import type { ActorRef, MilestoneEvent } from "../../model/domain.js";
import type { EditorSession } from "./session.js";

type EventType = MilestoneEvent["type"];
type EventFor<T extends EventType> = Extract<MilestoneEvent, { readonly type: T }>;

export function emit<T extends EventType>(
  session: EditorSession,
  type: T,
  payload: EventFor<T>["payload"],
  actor?: ActorRef,
): void {
  session.draft.sequence += 1;
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
