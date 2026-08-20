import type { ActorRef, Criterion, CriterionId, CriterionState, TaskCriterion } from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { assertCriterionTransition } from "../services/transitions/criteria.js";
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

interface CriterionEditOptions {
  readonly reason?: string;
  readonly actor?: ActorRef;
}

interface CriterionDefinitionEditOptions extends CriterionEditOptions {
  readonly verificationEffect?: "preserve" | "invalidate";
}

export class CriteriaEditor {
  private readonly session: EditorSession | TaskEditorSession;

  public constructor(session: never) {
    this.session = session as EditorSession | TaskEditorSession;
  }

  public add(input: Omit<Criterion | TaskCriterion, "id">, options: CriterionEditOptions = {}): CriterionId {
    ensureOpen(this.session);
    feature(this.session.profile.criteria.enabled, "criteria");
    requiredText(input.title, "Criterion title");
    invariant(
      input.weight === undefined || (Number.isFinite(input.weight) && input.weight >= 0),
      "INVALID_ARGUMENT",
      "Criterion weight must be finite and non-negative",
    );
    const id = this.session.ids.criterion();
    const criterion = { id, ...clone(input) } as Criterion;
    if (isTaskSession(this.session)) {
      beginMaterialTaskRevision(this.session, options.reason, options.actor);
      this.session.draft.criteria.push(criterion as unknown as TaskCriterion);
      this.session.changes.push({ type: "criterion_changed", criterionId: criterion.id });
      emitTask(this.session, "task.criterion_added", { criterion: criterion as unknown as TaskCriterion }, options.actor);
    } else {
      beginMaterialRevision(this.session, options.reason, options.actor);
      this.session.draft.criteria.push(criterion);
      this.session.changes.push({ type: "criterion_changed", criterionId: criterion.id });
      emit(this.session, "criterion.added", { criterion }, options.actor);
    }
    return criterion.id;
  }

  public update(
    id: CriterionId,
    patch: Partial<Omit<Criterion | TaskCriterion, "id" | "state">>,
    options: CriterionDefinitionEditOptions = {},
  ): void {
    ensureOpen(this.session);
    const criterion = this.get(id);
    const updated = { ...criterion, ...clone(patch), id, state: criterion.state };
    requiredText(updated.title, "Criterion title");
    invariant(
      updated.weight === undefined || (Number.isFinite(updated.weight) && updated.weight >= 0),
      "INVALID_ARGUMENT",
      "Criterion weight must be finite and non-negative",
    );
    if (equalDomainValue(criterion, updated)) return;
    const isTask = isTaskSession(this.session);
    if (isTask) {
      beginMaterialTaskRevision(this.session, options.reason, options.actor);
    } else {
      beginMaterialRevision(this.session, options.reason, options.actor);
    }
    const state =
      options.verificationEffect === "invalidate" &&
      (updated.state === "verified" || updated.state === "waived")
        ? "not_started"
        : updated.state;
    if (state !== updated.state) {
      this.session.invalidations.push({
        type: "criterion_verification",
        ref: id,
        reason: options.reason ?? "Criterion definition changed",
      });
    }
    this.put(id, { ...updated, state } as any);
    this.session.changes.push({ type: "criterion_changed", criterionId: id });
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.criterion_changed", { criterionId: id, state }, options.actor);
    } else {
      emit(this.session as EditorSession, "criterion.changed", { criterionId: id, state }, options.actor);
    }
  }

  public replace(
    id: CriterionId,
    replacement: Omit<Criterion | TaskCriterion, "id">,
    options: CriterionEditOptions = {},
  ): CriterionId {
    ensureOpen(this.session);
    const index = this.index(id);
    const isTask = isTaskSession(this.session);
    if (isTask) {
      beginMaterialTaskRevision(
        this.session,
        options.reason ?? "Criterion semantically replaced",
        options.actor,
      );
    } else {
      beginMaterialRevision(
        this.session,
        options.reason ?? "Criterion semantically replaced",
        options.actor,
      );
    }
    const criterion = { id: this.session.ids.criterion(), ...clone(replacement) } as Criterion;
    this.session.draft.criteria[index] = criterion as any;
    this.session.changes.push({ type: "criterion_changed", criterionId: criterion.id });
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.criterion_removed", { criterionId: id }, options.actor);
      emitTask(this.session as TaskEditorSession, "task.criterion_added", { criterion: criterion as any }, options.actor);
    } else {
      emit(this.session as EditorSession, "criterion.removed", { criterionId: id }, options.actor);
      emit(this.session as EditorSession, "criterion.added", { criterion }, options.actor);
    }
    return criterion.id;
  }

  public remove(id: CriterionId, options: CriterionEditOptions = {}): void {
    ensureOpen(this.session);
    this.index(id);
    const isTask = isTaskSession(this.session);
    if (isTask) {
      beginMaterialTaskRevision(this.session, options.reason, options.actor);
    } else {
      beginMaterialRevision(this.session, options.reason, options.actor);
    }
    this.session.draft.criteria = (this.session.draft.criteria as any[]).filter((item) => item.id !== id);
    this.session.changes.push({ type: "criterion_changed", criterionId: id });
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.criterion_removed", { criterionId: id }, options.actor);
    } else {
      emit(this.session as EditorSession, "criterion.removed", { criterionId: id }, options.actor);
    }
  }

  public start(id: CriterionId, actor?: ActorRef): void { this.transition(id, "in_progress", actor); }
  public submit(id: CriterionId, actor?: ActorRef): void { this.transition(id, "submitted", actor); }
  public verify(id: CriterionId, actor?: ActorRef): void { this.transition(id, "verified", actor); }
  public fail(id: CriterionId, actor?: ActorRef): void { this.transition(id, "failed", actor); }
  public waive(id: CriterionId, actor?: ActorRef): void { this.transition(id, "waived", actor); }
  public reset(id: CriterionId, actor?: ActorRef): void { this.transition(id, "not_started", actor); }

  private transition(id: CriterionId, state: CriterionState, actor?: ActorRef): void {
    ensureOpen(this.session);
    feature(this.session.profile.criteria.enabled, "criteria");
    const criterion = this.get(id);
    assertCriterionTransition(criterion.state, state);
    const isTask = isTaskSession(this.session);
    if (state === "verified" || state === "waived") {
      if (isTask) {
        authorizeTask(
          this.session as TaskEditorSession,
          state === "verified" ? "criterion.verify" : "criterion.waive",
          actor,
          { type: "criterion", criterionId: id },
        );
      } else {
        authorize(
          this.session as EditorSession,
          state === "verified" ? "criterion.verify" : "criterion.waive",
          actor,
          { type: "criterion", criterionId: id },
        );
      }
    }
    this.put(id, { ...criterion, state });
    this.session.changes.push({ type: "criterion_changed", criterionId: id });
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.criterion_changed", { criterionId: id, state }, actor);
    } else {
      emit(this.session as EditorSession, "criterion.changed", { criterionId: id, state }, actor);
    }
  }

  private get(id: CriterionId): Criterion | TaskCriterion {
    const value = (this.session.draft.criteria as any[]).find((item) => item.id === id);
    invariant(value !== undefined, "NOT_FOUND", `Criterion ${id} was not found`);
    return value;
  }

  private put(id: CriterionId, criterion: Criterion | TaskCriterion): void {
    (this.session.draft.criteria as any[])[this.index(id)] = clone(criterion);
  }

  private index(id: CriterionId): number {
    const index = (this.session.draft.criteria as any[]).findIndex((item) => item.id === id);
    invariant(index >= 0, "NOT_FOUND", `Criterion ${id} was not found`);
    return index;
  }
}

export type TaskCriteriaEditor = CriteriaEditor;

export function createCriteriaEditor(session: EditorSession | TaskEditorSession): CriteriaEditor {
  return new CriteriaEditor(session as never);
}
