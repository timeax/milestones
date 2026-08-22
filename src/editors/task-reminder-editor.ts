import type {
  ActorRef,
  CreateTaskReminderInput,
  TaskReminder,
  TaskReminderId,
  UpdateTaskReminderInput,
  TaskReminderTrigger,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { emitTask } from "./internal/events.js";
import { authorizeTask, clone, ensureOpen } from "./internal/helpers.js";
import type { TaskEditorSession } from "./internal/session.js";

export interface TaskReminderEditor {
  add(input: CreateTaskReminderInput, actor?: ActorRef): TaskReminderId;
  update(id: TaskReminderId, patch: UpdateTaskReminderInput, actor?: ActorRef): void;
  remove(id: TaskReminderId, actor?: ActorRef): void;
  clear(actor?: ActorRef): void;
  has(id: TaskReminderId): boolean;
  get(id: TaskReminderId): TaskReminder | undefined;
  list(): readonly TaskReminder[];
}

export function createTaskReminderEditor(session: TaskEditorSession): TaskReminderEditor {
  function validateTrigger(trigger: TaskReminderTrigger): void {
    if (!trigger || !["at", "before_due", "after_start"].includes(trigger.type)) {
      invariant(false, "INVALID_ARGUMENT", "Invalid reminder trigger type");
    }
    if (trigger.type === "at") {
      invariant(Number.isFinite(Date.parse(trigger.at)), "INVALID_ARGUMENT", "Reminder trigger timestamp must be valid");
    } else {
      invariant(/^P(?!$)/u.test(trigger.duration), "INVALID_ARGUMENT", "Reminder trigger duration must be an ISO 8601 duration");
    }
  }

  return {
    add(input: CreateTaskReminderInput, actor?: ActorRef): TaskReminderId {
      ensureOpen(session);
      authorizeTask(session, "task.reminder.add", actor, { type: "task" });
      validateTrigger(input.trigger);
      const reminderId = session.ids.reminder();
      const reminder: TaskReminder = {
        id: reminderId,
        trigger: clone(input.trigger),
        createdAt: session.clock.now(),
        ...(input.metadata === undefined ? {} : { metadata: clone(input.metadata) }),
      };
      session.draft.reminders.push(reminder);
      session.changes.push({ type: "reminder_added", reminderId });
      emitTask(session, "task.reminder_added", { reminder: clone(reminder) }, actor);
      return reminderId;
    },

    update(id: TaskReminderId, patch: UpdateTaskReminderInput, actor?: ActorRef): void {
      ensureOpen(session);
      authorizeTask(session, "task.reminder.update", actor, { type: "reminder", reminderId: id });
      const index = session.draft.reminders.findIndex((item) => item.id === id);
      invariant(index !== -1, "NOT_FOUND", `Reminder ${id} was not found`, { reminderId: id });
      const current = session.draft.reminders[index]!;
      if (patch.trigger !== undefined) {
        validateTrigger(patch.trigger);
      }
      const updated: TaskReminder = {
        ...current,
        ...(patch.trigger === undefined ? {} : { trigger: clone(patch.trigger) }),
        ...(patch.metadata === undefined ? {} : { metadata: clone(patch.metadata) }),
      };
      session.draft.reminders[index] = updated;
      session.changes.push({ type: "reminder_updated", reminderId: id });
      emitTask(session, "task.reminder_updated", { reminder: clone(updated) }, actor);
    },

    remove(id: TaskReminderId, actor?: ActorRef): void {
      ensureOpen(session);
      authorizeTask(session, "task.reminder.remove", actor, { type: "reminder", reminderId: id });
      const index = session.draft.reminders.findIndex((item) => item.id === id);
      invariant(index !== -1, "NOT_FOUND", `Reminder ${id} was not found`, { reminderId: id });
      session.draft.reminders.splice(index, 1);
      session.changes.push({ type: "reminder_removed", reminderId: id });
      emitTask(session, "task.reminder_removed", { reminderId: id }, actor);
    },

    clear(actor?: ActorRef): void {
      ensureOpen(session);
      for (const reminder of [...session.draft.reminders]) {
        this.remove(reminder.id, actor);
      }
    },

    has(id: TaskReminderId): boolean {
      return session.draft.reminders.some((item) => item.id === id);
    },

    get(id: TaskReminderId): TaskReminder | undefined {
      const found = session.draft.reminders.find((item) => item.id === id);
      return found === undefined ? undefined : clone(found);
    },

    list(): readonly TaskReminder[] {
      return clone(session.draft.reminders);
    },
  };
}
