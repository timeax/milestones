import type { ActorRef, TaskTiming } from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { emitTask } from "./internal/events.js";
import { authorizeTask, ensureOpen, requiredText } from "./internal/helpers.js";
import { beginMaterialTaskRevision } from "./internal/revision.js";
import type { TaskEditorSession } from "./internal/session.js";

export interface TaskTimingEditor {
  setStart(startsAt: string, actor?: ActorRef): void;
  clearStart(actor?: ActorRef): void;
  setDue(dueAt: string, actor?: ActorRef): void;
  clearDue(actor?: ActorRef): void;
  setRange(
    input: { startsAt?: string; dueAt?: string; timeZone?: string },
    actor?: ActorRef,
  ): void;
  setTimeZone(timeZone: string | undefined, actor?: ActorRef): void;
  clear(actor?: ActorRef): void;
}

export function createTaskTimingEditor(session: TaskEditorSession): TaskTimingEditor {
  function validateTimingRange(startsAt?: string, dueAt?: string): void {
    invariant(
      startsAt === undefined || dueAt === undefined || dueAt >= startsAt,
      "INVALID_ARGUMENT",
      "Timing dueAt must be greater than or equal to startsAt",
      { startsAt, dueAt },
    );
  }

  function applyTimingChange(newTiming: TaskTiming | undefined, actor?: ActorRef): void {
    ensureOpen(session);
    authorizeTask(session, "task.timing.update", actor, { type: "task" });
    beginMaterialTaskRevision(session, "Task timing changed", actor);
    if (
      newTiming === undefined ||
      (newTiming.startsAt === undefined && newTiming.dueAt === undefined && newTiming.timeZone === undefined)
    ) {
      delete session.draft.timing;
    } else {
      session.draft.timing = newTiming;
    }
    session.changes.push({ type: "timing_changed" });
    emitTask(
      session,
      "task.timing_changed",
      { ...(session.draft.timing === undefined ? {} : { timing: session.draft.timing }) },
      actor,
    );
  }

  return {
    setStart(startsAt: string, actor?: ActorRef): void {
      requiredText(startsAt, "startsAt");
      const current = session.draft.timing ?? {};
      validateTimingRange(startsAt, current.dueAt);
      applyTimingChange({ ...current, startsAt }, actor);
    },

    clearStart(actor?: ActorRef): void {
      const current = session.draft.timing ?? {};
      const { startsAt: _startsAt, ...rest } = current;
      applyTimingChange(Object.keys(rest).length === 0 ? undefined : rest, actor);
    },

    setDue(dueAt: string, actor?: ActorRef): void {
      requiredText(dueAt, "dueAt");
      const current = session.draft.timing ?? {};
      validateTimingRange(current.startsAt, dueAt);
      applyTimingChange({ ...current, dueAt }, actor);
    },

    clearDue(actor?: ActorRef): void {
      const current = session.draft.timing ?? {};
      const { dueAt: _dueAt, ...rest } = current;
      applyTimingChange(Object.keys(rest).length === 0 ? undefined : rest, actor);
    },

    setRange(
      input: { startsAt?: string; dueAt?: string; timeZone?: string },
      actor?: ActorRef,
    ): void {
      if (input.startsAt !== undefined) requiredText(input.startsAt, "startsAt");
      if (input.dueAt !== undefined) requiredText(input.dueAt, "dueAt");
      validateTimingRange(input.startsAt, input.dueAt);
      const newTiming: TaskTiming = {
        ...(input.startsAt === undefined ? {} : { startsAt: input.startsAt }),
        ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
        ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
      };
      applyTimingChange(newTiming, actor);
    },

    setTimeZone(timeZone: string | undefined, actor?: ActorRef): void {
      const current = session.draft.timing ?? {};
      if (timeZone === undefined) {
        const { timeZone: _timeZone, ...rest } = current;
        applyTimingChange(Object.keys(rest).length === 0 ? undefined : rest, actor);
      } else {
        requiredText(timeZone, "timeZone");
        applyTimingChange({ ...current, timeZone }, actor);
      }
    },

    clear(actor?: ActorRef): void {
      applyTimingChange(undefined, actor);
    },
  };
}
