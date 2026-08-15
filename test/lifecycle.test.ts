import { describe, expect, it } from "vitest";
import { MilestoneDomainError, MilestoneEditor, calculateProgress, deriveMilestoneState } from "../src/index.js";
import { actor, create, profile } from "./helpers.js";

describe("milestone lifecycle and revisions", () => {
  it("creates a fully materialized aggregate and advances sequence for every mutation", () => {
    const h = create({
      criteria: [{ title: "Tests pass", required: true, weight: 3, state: "not_started" }],
      deliverables: [{ title: "Build", required: true, state: "missing" }],
    });
    expect(h.milestone.sequence).toBe(1);
    expect(h.milestone.revisions[0]?.snapshot.criteria).toHaveLength(1);
    const editor = new MilestoneEditor(h.milestone, h.profile, h);
    editor.criteria.start(h.milestone.criteria[0]!.id, actor);
    editor.criteria.submit(h.milestone.criteria[0]!.id, actor);
    editor.criteria.verify(h.milestone.criteria[0]!.id, actor);
    editor.deliverables.submit(h.milestone.deliverables[0]!.id, actor);
    editor.deliverables.satisfy(h.milestone.deliverables[0]!.id, actor);
    const result = editor.commit();
    expect(result.events.map((event) => event.sequence)).toEqual([2, 3, 4, 5, 6]);
    expect(result.milestone.sequence).toBe(6);
    expect(calculateProgress(result.milestone)).toEqual({ completedWeight: 4, totalWeight: 4, percentage: 100 });
    expect(deriveMilestoneState(result.milestone)).toBe("open");
  });

  it("accepts, completes, reopens with exact effects, and preserves append-only history", () => {
    const h = create();
    const editor = new MilestoneEditor(h.milestone, h.profile, h);
    const acceptanceId = editor.accept(actor);
    const completionId = editor.complete(actor, "handover done");
    const closed = editor.commit().milestone;
    expect(deriveMilestoneState(closed)).toBe("completed");
    expect(closed.currentAcceptanceId).toBe(acceptanceId);
    expect(closed.currentCompletionId).toBe(completionId);

    const reopen = new MilestoneEditor(closed, h.profile, h);
    reopen.reopen({ effect: "invalidate_completion", reason: "administrative correction", actor, cause: { type: "administrative" } });
    const opened = reopen.commit();
    expect(opened.milestone.currentAcceptanceId).toBe(acceptanceId);
    expect(opened.milestone.currentCompletionId).toBeUndefined();
    expect(opened.milestone.completionRecords).toHaveLength(1);
    expect(opened.invalidations?.[0]?.ref).toBe(completionId);

    const invalidate = new MilestoneEditor(opened.milestone, h.profile, h);
    invalidate.reopen({ effect: "invalidate_acceptance_and_completion", reason: "acceptance invalid", actor });
    const invalidated = invalidate.commit().milestone;
    expect(invalidated.currentAcceptanceId).toBeUndefined();
    expect(invalidated.acceptanceRecords).toHaveLength(1);
  });

  it("material revisions preserve logical IDs, replace semantic IDs, and invalidate pointers", () => {
    const h = create({ criteria: [{ title: "Original", required: true, state: "verified" }] });
    const acceptedEditor = new MilestoneEditor(h.milestone, h.profile, h); acceptedEditor.accept(actor); acceptedEditor.complete(actor);
    const accepted = acceptedEditor.commit().milestone; const originalId = accepted.criteria[0]!.id;
    const editor = new MilestoneEditor(accepted, h.profile, h);
    editor.criteria.update(originalId, { title: "Tightened" }, { reason: "Clarify same logical requirement", actor });
    const revised = editor.commit();
    expect(revised.milestone.criteria[0]!.id).toBe(originalId);
    expect(revised.milestone.revisions).toHaveLength(2);
    expect(revised.milestone.currentAcceptanceId).toBeUndefined();
    expect(revised.milestone.acceptanceRecords).toHaveLength(1);
    expect(revised.invalidations).toHaveLength(2);
    expect(revised.revision?.snapshot.criteria[0]?.title).toBe("Tightened");

    const replacementEditor = new MilestoneEditor(revised.milestone, h.profile, h);
    const replacementId = replacementEditor.criteria.replace(originalId, { title: "Replacement", required: true, state: "not_started" }, { reason: "Semantic replacement", actor });
    const replaced = replacementEditor.commit().milestone;
    expect(replacementId).not.toBe(originalId);
    expect(replaced.revisions[1]?.snapshot.criteria[0]?.id).toBe(originalId);
    expect(replaced.revisions[2]?.snapshot.criteria[0]?.id).toBe(replacementId);
  });

  it("supports immediate completion and optimistic sequence checks", () => {
    const immediate = profile({ completion: { enabled: true, closeImmediatelyOnAcceptance: true } });
    const h = create({ profile: immediate }, "immediate");
    const editor = new MilestoneEditor(h.milestone, h.profile, h); editor.accept(); const result = editor.commit();
    expect(result.milestone.currentCompletionId).toBeDefined();
    expect(result.events.map((event) => event.type)).toEqual(["milestone.accepted", "milestone.completed"]);
    expect(() => new MilestoneEditor(result.milestone, h.profile, { ...h, expectedSequence: 1 })).toThrowError(MilestoneDomainError);
  });

  it("makes verification preservation versus invalidation explicit on material edits", () => {
    const h = create({ criteria: [{ title: "C", required: true, state: "verified" }], deliverables: [{ title: "D", required: true, state: "satisfied" }] }, "effects");
    const editor = new MilestoneEditor(h.milestone, h.profile, h);
    editor.criteria.update(h.milestone.criteria[0]!.id, { description: "tightened" }, { reason: "tighten", verificationEffect: "invalidate" });
    editor.deliverables.update(h.milestone.deliverables[0]!.id, { description: "clarified" }, { satisfactionEffect: "preserve" });
    const result = editor.commit();
    expect(result.milestone.criteria[0]!.state).toBe("not_started");
    expect(result.milestone.deliverables[0]!.state).toBe("satisfied");
    expect(result.invalidations).toContainEqual({ type: "criterion_verification", ref: h.milestone.criteria[0]!.id, reason: "tighten" });
  });
});
