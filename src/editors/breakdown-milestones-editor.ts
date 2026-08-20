import type {
  ActorRef,
  CreateMilestoneInput,
  Milestone,
  MilestoneId,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { emitBreakdown } from "./internal/events.js";
import { authorizeBreakdown, clone, ensureOpen } from "./internal/helpers.js";
import type { BreakdownEditorSession } from "./internal/session.js";
import type { MilestoneEditorOptions } from "./editor-contracts.js";
import { MilestoneEditor } from "./milestone-editor.js";

export interface BreakdownMilestonesEditor {
  add(milestone: Milestone, actor?: ActorRef): void;
  create(
    input: CreateMilestoneInput,
    options: Pick<MilestoneEditorOptions, "clock" | "ids"> & Partial<MilestoneEditorOptions>,
    actor?: ActorRef,
  ): Milestone;
  remove(id: MilestoneId, actor?: ActorRef): void;
  replace(id: MilestoneId, milestone: Milestone, actor?: ActorRef): void;
  move(id: MilestoneId, toIndex: number, actor?: ActorRef): void;
  has(id: MilestoneId): boolean;
  get(id: MilestoneId): Milestone | undefined;
  list(): readonly Milestone[];
}

export function createBreakdownMilestonesEditor(session: BreakdownEditorSession): BreakdownMilestonesEditor {
  function assertChildMilestoneValid(milestone: Milestone): void {
    invariant(
      milestone.id !== session.draft.parentMilestoneId,
      "INVALID_ARGUMENT",
      `Breakdown cannot contain its own parent milestone ${session.draft.parentMilestoneId}`,
      { milestoneId: milestone.id, parentMilestoneId: session.draft.parentMilestoneId },
    );
  }

  return {
    add(milestone: Milestone, actor?: ActorRef): void {
      ensureOpen(session);
      assertChildMilestoneValid(milestone);
      authorizeBreakdown(session, "breakdown.milestone.add", actor, milestone.id);
      const duplicate = session.draft.milestones.some((item) => item.id === milestone.id);
      invariant(!duplicate, "DUPLICATE_ID", `Milestone ${milestone.id} already exists in this breakdown`);
      session.draft.milestones.push(clone(milestone));
      session.changes.push({ type: "milestone_added", milestoneId: milestone.id });
      emitBreakdown(session, "breakdown.milestone_added", { milestoneId: milestone.id }, actor);
    },

    create(
      input: CreateMilestoneInput,
      options: Pick<MilestoneEditorOptions, "clock" | "ids"> & Partial<MilestoneEditorOptions>,
      actor?: ActorRef,
    ): Milestone {
      ensureOpen(session);
      const editResult = MilestoneEditor.create(input, options as MilestoneEditorOptions);
      const created = editResult.milestone;
      this.add(created, actor);
      return created;
    },

    remove(id: MilestoneId, actor?: ActorRef): void {
      ensureOpen(session);
      authorizeBreakdown(session, "breakdown.milestone.remove", actor, id);
      const index = session.draft.milestones.findIndex((item) => item.id === id);
      invariant(index !== -1, "NOT_FOUND", `Milestone ${id} was not found in this breakdown`);
      session.draft.milestones.splice(index, 1);
      session.changes.push({ type: "milestone_removed", milestoneId: id });
      emitBreakdown(session, "breakdown.milestone_removed", { milestoneId: id }, actor);
    },

    replace(id: MilestoneId, milestone: Milestone, actor?: ActorRef): void {
      ensureOpen(session);
      assertChildMilestoneValid(milestone);
      authorizeBreakdown(session, "breakdown.milestone.replace", actor, id);
      const index = session.draft.milestones.findIndex((item) => item.id === id);
      invariant(index !== -1, "NOT_FOUND", `Milestone ${id} was not found in this breakdown`);
      session.draft.milestones[index] = clone(milestone);
      session.changes.push({ type: "milestone_replaced", milestoneId: milestone.id, previousMilestoneId: id });
      emitBreakdown(session, "breakdown.milestone_replaced", { milestoneId: milestone.id, previousMilestoneId: id }, actor);
    },

    move(id: MilestoneId, toIndex: number, actor?: ActorRef): void {
      ensureOpen(session);
      authorizeBreakdown(session, "breakdown.milestone.move", actor, id);
      const fromIndex = session.draft.milestones.findIndex((item) => item.id === id);
      invariant(fromIndex !== -1, "NOT_FOUND", `Milestone ${id} was not found in this breakdown`);
      invariant(
        Number.isSafeInteger(toIndex) && toIndex >= 0 && toIndex < session.draft.milestones.length,
        "INVALID_ARGUMENT",
        `Target index ${toIndex} is out of bounds`,
      );
      if (fromIndex === toIndex) return;
      const [item] = session.draft.milestones.splice(fromIndex, 1);
      session.draft.milestones.splice(toIndex, 0, item!);
      session.changes.push({ type: "milestones_reordered" });
      emitBreakdown(
        session,
        "breakdown.milestones_reordered",
        { milestoneIds: session.draft.milestones.map((m) => m.id) },
        actor,
      );
    },

    has(id: MilestoneId): boolean {
      return session.draft.milestones.some((item) => item.id === id);
    },

    get(id: MilestoneId): Milestone | undefined {
      const found = session.draft.milestones.find((item) => item.id === id);
      return found === undefined ? undefined : clone(found);
    },

    list(): readonly Milestone[] {
      return clone(session.draft.milestones);
    },
  };
}
