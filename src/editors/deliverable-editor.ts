import type {
  ActorRef,
  DeliverableRequirement,
  DeliverableRequirementId,
  DeliverableRequirementState,
  TaskDeliverableRequirement,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { assertDeliverableTransition } from "../services/transitions/deliverables.js";
import { emit, emitTask } from "./internal/events.js";
import {
  authorize,
  authorizeTask,
  clone,
  ensureOpen,
  equalDomainValue,
  feature,
  requiredText,
} from "./internal/helpers.js";
import { beginMaterialRevision, beginMaterialTaskRevision } from "./internal/revision.js";
import type { EditorSession, TaskEditorSession } from "./internal/session.js";

function isTaskSession(session: EditorSession | TaskEditorSession): session is TaskEditorSession {
  return "scope" in session.draft;
}

interface DeliverableEditOptions {
  readonly reason?: string;
  readonly actor?: ActorRef;
}

interface DeliverableDefinitionEditOptions extends DeliverableEditOptions {
  readonly satisfactionEffect?: "preserve" | "invalidate";
}

export class DeliverableEditor {
  private readonly session: EditorSession | TaskEditorSession;

  public constructor(session: never) {
    this.session = session as EditorSession | TaskEditorSession;
  }

  public add(
    input: Omit<DeliverableRequirement | TaskDeliverableRequirement, "id">,
    options: DeliverableEditOptions = {},
  ): DeliverableRequirementId {
    ensureOpen(this.session);
    feature(this.session.profile.deliverables.enabled, "deliverables");
    requiredText(input.title, "Deliverable title");
    const id = this.session.ids.deliverableRequirement();
    const deliverable = { id, ...clone(input) } as DeliverableRequirement;
    const isTask = isTaskSession(this.session);
    if (isTask) {
      beginMaterialTaskRevision(this.session, options.reason, options.actor);
      this.session.draft.deliverables.push(deliverable as unknown as TaskDeliverableRequirement);
      this.session.changes.push({
        type: "deliverable_changed",
        deliverableRequirementId: deliverable.id,
      });
      emitTask(
        this.session as TaskEditorSession,
        "task.deliverable_added",
        { deliverable: deliverable as unknown as TaskDeliverableRequirement },
        options.actor,
      );
    } else {
      beginMaterialRevision(this.session, options.reason, options.actor);
      this.session.draft.deliverables.push(deliverable);
      this.session.changes.push({
        type: "deliverable_changed",
        deliverableRequirementId: deliverable.id,
      });
      emit(this.session as EditorSession, "deliverable.added", { deliverable }, options.actor);
    }
    return deliverable.id;
  }

  public update(
    id: DeliverableRequirementId,
    patch: Partial<Omit<DeliverableRequirement | TaskDeliverableRequirement, "id" | "state">>,
    options: DeliverableDefinitionEditOptions = {},
  ): void {
    ensureOpen(this.session);
    const item = this.get(id);
    const updated = { ...item, ...clone(patch), id, state: item.state };
    requiredText(updated.title, "Deliverable title");
    if (equalDomainValue(item, updated)) return;
    const isTask = isTaskSession(this.session);
    if (isTask) {
      beginMaterialTaskRevision(this.session, options.reason, options.actor);
    } else {
      beginMaterialRevision(this.session, options.reason, options.actor);
    }
    const state =
      options.satisfactionEffect === "invalidate" &&
      (updated.state === "satisfied" || updated.state === "waived")
        ? "missing"
        : updated.state;
    if (state !== updated.state) {
      this.session.invalidations.push({
        type: "deliverable_satisfaction",
        ref: id,
        reason: options.reason ?? "Deliverable definition changed",
      });
    }
    this.put(id, { ...updated, state } as any);
    this.session.changes.push({ type: "deliverable_changed", deliverableRequirementId: id });
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.deliverable_changed", { deliverableRequirementId: id, state }, options.actor);
    } else {
      emit(this.session as EditorSession, "deliverable.changed", { deliverableRequirementId: id, state }, options.actor);
    }
  }

  public replace(
    id: DeliverableRequirementId,
    replacement: Omit<DeliverableRequirement | TaskDeliverableRequirement, "id">,
    options: DeliverableEditOptions = {},
  ): DeliverableRequirementId {
    ensureOpen(this.session);
    const index = this.index(id);
    const isTask = isTaskSession(this.session);
    if (isTask) {
      beginMaterialTaskRevision(
        this.session,
        options.reason ?? "Deliverable semantically replaced",
        options.actor,
      );
    } else {
      beginMaterialRevision(
        this.session,
        options.reason ?? "Deliverable semantically replaced",
        options.actor,
      );
    }
    const item = {
      id: this.session.ids.deliverableRequirement(),
      ...clone(replacement),
    } as DeliverableRequirement;
    this.session.draft.deliverables[index] = item as any;
    this.session.changes.push({ type: "deliverable_changed", deliverableRequirementId: item.id });
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.deliverable_removed", { deliverableRequirementId: id }, options.actor);
      emitTask(this.session as TaskEditorSession, "task.deliverable_added", { deliverable: item as any }, options.actor);
    } else {
      emit(this.session as EditorSession, "deliverable.removed", { deliverableRequirementId: id }, options.actor);
      emit(this.session as EditorSession, "deliverable.added", { deliverable: item }, options.actor);
    }
    return item.id;
  }

  public remove(id: DeliverableRequirementId, options: DeliverableEditOptions = {}): void {
    ensureOpen(this.session);
    this.index(id);
    const isTask = isTaskSession(this.session);
    if (isTask) {
      beginMaterialTaskRevision(this.session, options.reason, options.actor);
    } else {
      beginMaterialRevision(this.session, options.reason, options.actor);
    }
    this.session.draft.deliverables = (this.session.draft.deliverables as any[]).filter(
      (item) => item.id !== id,
    );
    this.session.changes.push({ type: "deliverable_changed", deliverableRequirementId: id });
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.deliverable_removed", { deliverableRequirementId: id }, options.actor);
    } else {
      emit(this.session as EditorSession, "deliverable.removed", { deliverableRequirementId: id }, options.actor);
    }
  }

  public submit(id: DeliverableRequirementId, actor?: ActorRef): void { this.transition(id, "submitted", actor); }
  public satisfy(id: DeliverableRequirementId, actor?: ActorRef): void { this.transition(id, "satisfied", actor); }
  public reject(id: DeliverableRequirementId, actor?: ActorRef): void { this.transition(id, "rejected", actor); }
  public waive(id: DeliverableRequirementId, actor?: ActorRef): void { this.transition(id, "waived", actor); }
  public reset(id: DeliverableRequirementId, actor?: ActorRef): void { this.transition(id, "missing", actor); }

  private transition(
    id: DeliverableRequirementId,
    state: DeliverableRequirementState,
    actor?: ActorRef,
  ): void {
    ensureOpen(this.session);
    feature(this.session.profile.deliverables.enabled, "deliverables");
    const item = this.get(id);
    assertDeliverableTransition(item.state, state);
    const isTask = isTaskSession(this.session);
    if (state === "satisfied" || state === "waived") {
      if (isTask) {
        authorizeTask(
          this.session as TaskEditorSession,
          state === "satisfied" ? "deliverable.satisfy" : "deliverable.waive",
          actor,
          { type: "deliverable_requirement", deliverableRequirementId: id },
        );
      } else {
        authorize(
          this.session as EditorSession,
          state === "satisfied" ? "deliverable.satisfy" : "deliverable.waive",
          actor,
          { type: "deliverable_requirement", deliverableRequirementId: id },
        );
      }
    }
    this.put(id, { ...item, state });
    this.session.changes.push({ type: "deliverable_changed", deliverableRequirementId: id });
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.deliverable_changed", { deliverableRequirementId: id, state }, actor);
    } else {
      emit(this.session as EditorSession, "deliverable.changed", { deliverableRequirementId: id, state }, actor);
    }
  }

  private put(id: DeliverableRequirementId, item: DeliverableRequirement | TaskDeliverableRequirement): void {
    (this.session.draft.deliverables as any[])[this.index(id)] = clone(item);
  }

  private get(id: DeliverableRequirementId): DeliverableRequirement | TaskDeliverableRequirement {
    const value = (this.session.draft.deliverables as any[]).find((item) => item.id === id);
    invariant(value !== undefined, "NOT_FOUND", `Deliverable ${id} was not found`);
    return value;
  }

  private index(id: DeliverableRequirementId): number {
    const index = (this.session.draft.deliverables as any[]).findIndex((item) => item.id === id);
    invariant(index >= 0, "NOT_FOUND", `Deliverable ${id} was not found`);
    return index;
  }
}

export type TaskDeliverableEditor = DeliverableEditor;

export function createDeliverableEditor(session: EditorSession | TaskEditorSession): DeliverableEditor {
  return new DeliverableEditor(session as never);
}
