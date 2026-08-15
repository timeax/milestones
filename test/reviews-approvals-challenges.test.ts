import { describe, expect, it } from "vitest";
import { MilestoneDomainError, MilestoneEditor } from "../src/index.js";
import { actor, create, profile } from "./helpers.js";

describe("reviews, approvals, and challenges", () => {
  it("requires an accepted attributed review and distinct effective approvers", () => {
    const p = profile({ reviews: { enabled: true, required: true }, approvals: { enabled: true, required: true } });
    const h = create({ profile: p, approvalPolicy: { stages: [{ label: "Security", required: true, requiredApprovalCount: 2, scope: "milestone" }] } });
    const stage = h.milestone.approvalPolicy!.stages[0]!;
    const editor = new MilestoneEditor(h.milestone, p, h);
    expect(editor.evaluateAcceptance().reasons.map((reason) => reason.code)).toEqual(expect.arrayContaining(["incomplete_review", "pending_approval"]));
    const reviewId = editor.reviews.request({ requestedBy: { id: "requester" }, assignedReviewer: { id: "reviewer" } });
    editor.reviews.start(reviewId, { id: "reviewer" });
    editor.reviews.complete(reviewId, "accepted", { completedBy: { id: "completer" }, summary: "correct" });
    editor.approvals.grant(stage.id, { id: "a", type: "user" });
    expect(() => editor.approvals.grant(stage.id, { id: "a", type: "user" })).toThrowError(MilestoneDomainError);
    editor.approvals.grant(stage.id, { id: "b", type: "user" });
    editor.accept(actor);
    const result = editor.commit().milestone;
    expect(result.reviews[0]).toMatchObject({ requestedBy: { id: "requester" }, assignedReviewer: { id: "reviewer" }, completedBy: { id: "completer" } });
    expect(result.acceptanceRecords[0]?.snapshot.approvals[0]).toMatchObject({ effectiveApprovalCount: 2, satisfied: true });
  });

  it("keeps approval history append-only and reopens only when revocation breaks a required stage", () => {
    const p = profile({ approvals: { enabled: true, required: true } });
    const h = create({ profile: p, approvalPolicy: { stages: [{ label: "Gate", required: true, requiredApprovalCount: 1, scope: "milestone" }] } });
    const stage = h.milestone.approvalPolicy!.stages[0]!;
    const editor = new MilestoneEditor(h.milestone, p, h); const approvalId = editor.approvals.grant(stage.id, actor); editor.accept(actor); editor.complete(actor); const accepted = editor.commit().milestone;
    const revoke = new MilestoneEditor(accepted, p, h); const revocationId = revoke.approvals.revoke(approvalId, { id: "admin" }, "withdrawn"); const result = revoke.commit().milestone;
    expect(result.currentAcceptanceId).toBeUndefined(); expect(result.currentCompletionId).toBeUndefined();
    expect(result.approvalRecords).toHaveLength(2); expect(result.approvalRecords[1]).toMatchObject({ id: revocationId, type: "revoked", revokesApprovalId: approvalId });
  });

  it("blocks on unresolved blocking challenges and invalidates only explicit outcomes", () => {
    const h = create();
    const editor = new MilestoneEditor(h.milestone, h.profile, h); const challengeId = editor.challenges.raise({ type: "milestone" }, "Validity disputed", "blocking", actor);
    expect(editor.evaluateAcceptance().reasons.some((reason) => reason.code === "blocking_challenge")).toBe(true);
    editor.challenges.resolve(challengeId, "no_effect", { actor }); editor.accept(actor); const accepted = editor.commit().milestone;
    const later = new MilestoneEditor(accepted, h.profile, h); const second = later.challenges.raise({ type: "milestone" }, "New evidence", "blocking", actor);
    expect(accepted.currentAcceptanceId).toBeDefined();
    later.challenges.resolve(second, "acceptance_invalidated", { actor }); const result = later.commit().milestone;
    expect(result.currentAcceptanceId).toBeUndefined(); expect(result.acceptanceRecords).toHaveLength(1);
  });

  it("revises approval policy through stable stage IDs", () => {
    const h = create(); const editor = new MilestoneEditor(h.milestone, h.profile, h);
    const stageId = editor.approvals.addStage({ label: "New gate", required: true, requiredApprovalCount: 1, scope: "milestone" }, { reason: "Add authority gate" });
    editor.approvals.updateStage(stageId, { label: "Renamed gate", requiredApprovalCount: 2 });
    const result = editor.commit();
    expect(result.milestone.approvalPolicy?.stages[0]).toMatchObject({ id: stageId, label: "Renamed gate", requiredApprovalCount: 2 });
    expect(result.revision?.snapshot.approvalPolicy?.stages[0]?.id).toBe(stageId);
  });

  it("records rejection and waiver facts without counting rejection as approval", () => {
    const p = profile({ approvals: { enabled: true, required: true } });
    const h = create({ profile: p, approvalPolicy: { stages: [{ label: "Gate", required: true, requiredApprovalCount: 2, scope: "milestone" }] } }); const stage = h.milestone.approvalPolicy!.stages[0]!;
    const editor = new MilestoneEditor(h.milestone, p, h); editor.approvals.reject(stage.id, { id: "rejector" }, "no"); editor.approvals.waive(stage.id, { id: "admin" }, "exception");
    expect(editor.evaluateAcceptance().accepted).toBe(true); editor.accept(); const result = editor.commit().milestone;
    expect(result.approvalRecords.map((record) => record.type)).toEqual(["rejected", "waived"]);
    expect(result.acceptanceRecords[0]?.snapshot.approvals[0]).toMatchObject({ effectiveApprovalCount: 0, satisfied: true });
  });
});
