import type {
  ActorRef,
  DeliverableRequirement,
  DeliverableRequirementId,
  DeliverableRequirementState,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { assertDeliverableTransition } from "../services/transitions/deliverables.js";
import { emit } from "./internal/events.js";
import { authorize, clone, ensureOpen, equalDomainValue, feature, requiredText } from "./internal/helpers.js";
import { beginMaterialRevision } from "./internal/revision.js";
import type { EditorSession } from "./internal/session.js";

interface DeliverableEditOptions {
  readonly reason?: string;
  readonly actor?: ActorRef;
}

interface DeliverableDefinitionEditOptions extends DeliverableEditOptions {
  readonly satisfactionEffect?: "preserve" | "invalidate";
}

export class DeliverableEditor {
  private readonly session: EditorSession;

  public constructor(session: never) {
    this.session = session as EditorSession;
  }

  public add(
    input: Omit<DeliverableRequirement, "id">,
    options: DeliverableEditOptions = {},
  ): DeliverableRequirementId {
    ensureOpen(this.session);
    feature(this.session.profile.deliverables.enabled, "deliverables");
    requiredText(input.title, "Deliverable title");
    beginMaterialRevision(this.session, options.reason, options.actor);
    const deliverable: DeliverableRequirement = {
      id: this.session.ids.deliverableRequirement(),
      ...clone(input),
    };
    this.session.draft.deliverables.push(deliverable);
    this.session.changes.push({
      type: "deliverable_changed",
      deliverableRequirementId: deliverable.id,
    });
    emit(this.session, "deliverable.added", { deliverable }, options.actor);
    return deliverable.id;
  }

  public update(
    id: DeliverableRequirementId,
    patch: Partial<Omit<DeliverableRequirement, "id" | "state">>,
    options: DeliverableDefinitionEditOptions = {},
  ): void {
    ensureOpen(this.session);
    const item = this.get(id);
    const updated = { ...item, ...clone(patch), id, state: item.state };
    requiredText(updated.title, "Deliverable title");
    if (equalDomainValue(item, updated)) return;
    beginMaterialRevision(this.session, options.reason, options.actor);
    const state = options.satisfactionEffect === "invalidate"
      && (updated.state === "satisfied" || updated.state === "waived")
      ? "missing"
      : updated.state;
    if (state !== updated.state) {
      this.session.invalidations.push({
        type: "deliverable_satisfaction",
        ref: id,
        reason: options.reason ?? "Deliverable definition changed",
      });
    }
    this.put(id, { ...updated, state });
    this.session.changes.push({ type: "deliverable_changed", deliverableRequirementId: id });
    emit(this.session, "deliverable.changed", { deliverableRequirementId: id, state }, options.actor);
  }

  public replace(
    id: DeliverableRequirementId,
    replacement: Omit<DeliverableRequirement, "id">,
    options: DeliverableEditOptions = {},
  ): DeliverableRequirementId {
    ensureOpen(this.session);
    const index = this.index(id);
    beginMaterialRevision(
      this.session,
      options.reason ?? "Deliverable semantically replaced",
      options.actor,
    );
    const item: DeliverableRequirement = {
      id: this.session.ids.deliverableRequirement(),
      ...clone(replacement),
    };
    this.session.draft.deliverables[index] = item;
    this.session.changes.push({ type: "deliverable_changed", deliverableRequirementId: item.id });
    emit(this.session, "deliverable.removed", { deliverableRequirementId: id }, options.actor);
    emit(this.session, "deliverable.added", { deliverable: item }, options.actor);
    return item.id;
  }

  public remove(id: DeliverableRequirementId, options: DeliverableEditOptions = {}): void {
    ensureOpen(this.session);
    this.index(id);
    beginMaterialRevision(this.session, options.reason, options.actor);
    this.session.draft.deliverables = this.session.draft.deliverables.filter(
      (item) => item.id !== id,
    );
    this.session.changes.push({ type: "deliverable_changed", deliverableRequirementId: id });
    emit(this.session, "deliverable.removed", { deliverableRequirementId: id }, options.actor);
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
    if (state === "satisfied" || state === "waived") {
      authorize(
        this.session,
        state === "satisfied" ? "deliverable.satisfy" : "deliverable.waive",
        actor,
        { type: "deliverable_requirement", deliverableRequirementId: id },
      );
    }
    this.put(id, { ...item, state });
    this.session.changes.push({ type: "deliverable_changed", deliverableRequirementId: id });
    emit(this.session, "deliverable.changed", { deliverableRequirementId: id, state }, actor);
  }

  private put(id: DeliverableRequirementId, item: DeliverableRequirement): void {
    this.session.draft.deliverables[this.index(id)] = item;
  }

  private get(id: DeliverableRequirementId): DeliverableRequirement {
    const value = this.session.draft.deliverables.find((item) => item.id === id);
    invariant(value !== undefined, "NOT_FOUND", `Deliverable ${id} was not found`);
    return value;
  }

  private index(id: DeliverableRequirementId): number {
    const index = this.session.draft.deliverables.findIndex((item) => item.id === id);
    invariant(index >= 0, "NOT_FOUND", `Deliverable ${id} was not found`);
    return index;
  }
}

export function createDeliverableEditor(session: EditorSession): DeliverableEditor {
  return new DeliverableEditor(session as never);
}
