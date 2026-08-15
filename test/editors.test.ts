import { describe, expect, it } from "vitest";
import { MilestoneDomainError, MilestoneEditor, asMilestoneId, asMilestoneProfileId } from "../src/index.js";
import { actor, create, profile } from "./helpers.js";

describe("focused editor subsystems", () => {
  it("edits definition and requirement collections through material revisions", () => {
    const h = create(); const editor = new MilestoneEditor(h.milestone, h.profile, h);
    editor.definition.update({ title: "Renamed", description: "Expanded scope" }, { reason: "Scope update", actor });
    const criterion = editor.criteria.add({ title: "C", required: false, state: "waived" });
    const deliverable = editor.deliverables.add({ title: "D", required: false, state: "waived" });
    const dependency = editor.dependencies.add(asMilestoneId("upstream"), { type: "accepted" });
    editor.criteria.remove(criterion); editor.deliverables.remove(deliverable); editor.dependencies.remove(dependency);
    const result = editor.commit();
    expect(result.milestone.definition.title).toBe("Renamed");
    expect(result.milestone.criteria).toHaveLength(0); expect(result.milestone.deliverables).toHaveLength(0); expect(result.milestone.dependencies).toHaveLength(0);
    expect(result.revision?.snapshot.definition.title).toBe("Renamed");
    expect(result.events.map((event) => event.type)).toEqual(expect.arrayContaining(["milestone.revised", "definition.changed", "criterion.added", "criterion.removed", "deliverable.added", "deliverable.removed", "dependency.added", "dependency.removed"]));
  });

  it("supports deliverable semantic replacement and explicit satisfaction invalidation", () => {
    const h = create({ deliverables: [{ title: "D", required: true, state: "satisfied" }] }); const original = h.milestone.deliverables[0]!;
    const editor = new MilestoneEditor(h.milestone, h.profile, h); editor.deliverables.update(original.id, { description: "tight" }, { satisfactionEffect: "invalidate", reason: "Tighten" });
    const first = editor.commit(); expect(first.milestone.deliverables[0]?.state).toBe("missing"); expect(first.invalidations?.[0]?.type).toBe("deliverable_satisfaction");
    const replacement = new MilestoneEditor(first.milestone, h.profile, h); const replacementId = replacement.deliverables.replace(original.id, { title: "New D", required: true, state: "missing" });
    expect(replacement.commit().milestone.deliverables[0]?.id).toBe(replacementId);
  });

  it("enforces challenge transitions and review cancellation rules", () => {
    const h = create(); const editor = new MilestoneEditor(h.milestone, h.profile, h);
    const challenge = editor.challenges.raise({ type: "milestone" }, "question", "non_blocking", actor);
    editor.challenges.startReview(challenge, actor); editor.challenges.reject(challenge, actor); editor.challenges.reopen(challenge, actor); editor.challenges.withdraw(challenge, actor);
    expect(() => editor.challenges.startReview(challenge, actor)).toThrowError(MilestoneDomainError);
    expect(() => editor.challenges.raise({ type: "criterion", criterionId: "missing" as never }, "bad target", "blocking")).toThrowError(MilestoneDomainError);
    const review = editor.reviews.request({ requestedBy: actor }); editor.reviews.assign(review, { id: "reviewer" }); editor.reviews.cancel(review, actor);
    expect(() => editor.reviews.complete(review, "accepted")).toThrowError(MilestoneDomainError);
    expect(editor.commit().events.some((event) => event.type === "review.changed")).toBe(true);
  });

  it("revises profiles and approval policy without leaking old behavior", () => {
    const h = create(); const next = profile({ ref: { id: asMilestoneProfileId("standard"), version: 2 }, completion: { enabled: true, closeImmediatelyOnAcceptance: true } });
    const editor = new MilestoneEditor(h.milestone, h.profile, h); editor.revisions.applyProfile(next, "Adopt v2", actor);
    const stage = editor.approvals.addStage({ label: "Optional", required: false, requiredApprovalCount: 0, scope: "milestone" }); editor.approvals.removeStage(stage);
    const result = editor.commit();
    expect(result.milestone.profile.version).toBe(2); expect(result.revision?.snapshot.evaluationPolicy.closeImmediatelyOnAcceptance).toBe(true);
    expect(result.milestone.approvalPolicy?.stages).toHaveLength(0);
  });
});
