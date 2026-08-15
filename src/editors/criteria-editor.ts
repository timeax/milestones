import type { ActorRef, Criterion, CriterionId, CriterionState } from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { assertCriterionTransition } from "../services/transitions/criteria.js";
import { emit } from "./internal/events.js";
import { authorize, clone, ensureOpen, equalDomainValue, feature, requiredText } from "./internal/helpers.js";
import { beginMaterialRevision } from "./internal/revision.js";
import type { EditorSession } from "./internal/session.js";

interface CriterionEditOptions {
  readonly reason?: string;
  readonly actor?: ActorRef;
}

interface CriterionDefinitionEditOptions extends CriterionEditOptions {
  readonly verificationEffect?: "preserve" | "invalidate";
}

export class CriteriaEditor {
  private readonly session: EditorSession;

  public constructor(session: never) {
    this.session = session as EditorSession;
  }

  public add(input: Omit<Criterion, "id">, options: CriterionEditOptions = {}): CriterionId {
    ensureOpen(this.session);
    feature(this.session.profile.criteria.enabled, "criteria");
    requiredText(input.title, "Criterion title");
    invariant(
      input.weight === undefined || (Number.isFinite(input.weight) && input.weight >= 0),
      "INVALID_ARGUMENT",
      "Criterion weight must be finite and non-negative",
    );
    beginMaterialRevision(this.session, options.reason, options.actor);
    const criterion: Criterion = { id: this.session.ids.criterion(), ...clone(input) };
    this.session.draft.criteria.push(criterion);
    this.session.changes.push({ type: "criterion_changed", criterionId: criterion.id });
    emit(this.session, "criterion.added", { criterion }, options.actor);
    return criterion.id;
  }

  public update(
    id: CriterionId,
    patch: Partial<Omit<Criterion, "id" | "state">>,
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
    beginMaterialRevision(this.session, options.reason, options.actor);
    const state = options.verificationEffect === "invalidate"
      && (updated.state === "verified" || updated.state === "waived")
      ? "not_started"
      : updated.state;
    if (state !== updated.state) {
      this.session.invalidations.push({
        type: "criterion_verification",
        ref: id,
        reason: options.reason ?? "Criterion definition changed",
      });
    }
    this.put(id, { ...updated, state });
    this.session.changes.push({ type: "criterion_changed", criterionId: id });
    emit(this.session, "criterion.changed", { criterionId: id, state }, options.actor);
  }

  public replace(
    id: CriterionId,
    replacement: Omit<Criterion, "id">,
    options: CriterionEditOptions = {},
  ): CriterionId {
    ensureOpen(this.session);
    const index = this.index(id);
    beginMaterialRevision(
      this.session,
      options.reason ?? "Criterion semantically replaced",
      options.actor,
    );
    const criterion: Criterion = { id: this.session.ids.criterion(), ...clone(replacement) };
    this.session.draft.criteria[index] = criterion;
    this.session.changes.push({ type: "criterion_changed", criterionId: criterion.id });
    emit(this.session, "criterion.removed", { criterionId: id }, options.actor);
    emit(this.session, "criterion.added", { criterion }, options.actor);
    return criterion.id;
  }

  public remove(id: CriterionId, options: CriterionEditOptions = {}): void {
    ensureOpen(this.session);
    this.index(id);
    beginMaterialRevision(this.session, options.reason, options.actor);
    this.session.draft.criteria = this.session.draft.criteria.filter((item) => item.id !== id);
    this.session.changes.push({ type: "criterion_changed", criterionId: id });
    emit(this.session, "criterion.removed", { criterionId: id }, options.actor);
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
    if (state === "verified" || state === "waived") {
      authorize(
        this.session,
        state === "verified" ? "criterion.verify" : "criterion.waive",
        actor,
        { type: "criterion", criterionId: id },
      );
    }
    this.put(id, { ...criterion, state });
    this.session.changes.push({ type: "criterion_changed", criterionId: id });
    emit(this.session, "criterion.changed", { criterionId: id, state }, actor);
  }

  private get(id: CriterionId): Criterion {
    const value = this.session.draft.criteria.find((item) => item.id === id);
    invariant(value !== undefined, "NOT_FOUND", `Criterion ${id} was not found`);
    return value;
  }

  private put(id: CriterionId, criterion: Criterion): void {
    this.session.draft.criteria[this.index(id)] = clone(criterion);
  }

  private index(id: CriterionId): number {
    const index = this.session.draft.criteria.findIndex((item) => item.id === id);
    invariant(index >= 0, "NOT_FOUND", `Criterion ${id} was not found`);
    return index;
  }
}

export function createCriteriaEditor(session: EditorSession): CriteriaEditor {
  return new CriteriaEditor(session as never);
}
