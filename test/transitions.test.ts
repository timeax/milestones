import { describe, expect, it } from "vitest";
import {
  MilestoneDomainError,
  MilestoneEditor,
  asAcceptanceId,
  asApprovalStageId,
  asMilestoneId,
  type ChallengeState,
  type CriterionState,
  type DeliverableRequirementState,
  type ReviewState,
} from "../src/index.js";
import {
  CHALLENGE_TRANSITIONS,
  CRITERION_TRANSITIONS,
  DELIVERABLE_TRANSITIONS,
  REVIEW_TRANSITIONS,
  assertChallengeTransition,
  assertCriterionTransition,
  assertDeliverableTransition,
  assertReviewTransition,
} from "../src/services/transitions/index.js";
import { actor, create } from "./helpers.js";

function verifyMatrix<State extends string>(
  states: readonly State[],
  matrix: Readonly<Record<State, readonly State[]>>,
  assertTransition: (from: State, to: State) => void,
): void {
  for (const from of states) {
    for (const to of states) {
      if (matrix[from].includes(to)) {
        expect(() => assertTransition(from, to), `${from} -> ${to}`).not.toThrow();
      } else {
        expect(() => assertTransition(from, to), `${from} -/-> ${to}`).toThrowError(
          MilestoneDomainError,
        );
      }
    }
  }
}

describe("explicit transition matrices", () => {
  it("defines every valid and invalid criterion transition", () => {
    verifyMatrix<CriterionState>(
      ["not_started", "in_progress", "submitted", "verified", "failed", "waived"],
      CRITERION_TRANSITIONS,
      assertCriterionTransition,
    );
  });

  it("defines every valid and invalid deliverable transition", () => {
    verifyMatrix<DeliverableRequirementState>(
      ["missing", "submitted", "satisfied", "rejected", "waived"],
      DELIVERABLE_TRANSITIONS,
      assertDeliverableTransition,
    );
  });

  it("defines every valid and invalid challenge transition", () => {
    verifyMatrix<ChallengeState>(
      ["open", "under_review", "resolved", "rejected", "withdrawn", "reopened"],
      CHALLENGE_TRANSITIONS,
      assertChallengeTransition,
    );
  });

  it("defines every valid and invalid review transition", () => {
    verifyMatrix<ReviewState>(
      ["requested", "in_progress", "completed", "cancelled"],
      REVIEW_TRANSITIONS,
      assertReviewTransition,
    );
  });

  it("uses the matrices atomically in editors", () => {
    const harness = create({
      criteria: [{ title: "C", required: true, state: "waived" }],
      deliverables: [{ title: "D", required: true, state: "satisfied" }],
    }, "matrix-editors");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    expect(() => editor.criteria.submit(harness.milestone.criteria[0]!.id, actor)).toThrowError(MilestoneDomainError);
    expect(() => editor.deliverables.satisfy(harness.milestone.deliverables[0]!.id, actor)).toThrowError(MilestoneDomainError);
    const reviewId = editor.reviews.request();
    editor.reviews.cancel(reviewId, actor);
    expect(() => editor.reviews.complete(reviewId, "accepted", { completedBy: actor })).toThrowError(MilestoneDomainError);
    const result = editor.commit();
    expect(result.events.map((event) => event.type)).toEqual(["review.requested", "review.changed"]);
  });
});

describe("approval and completion lifecycle guards", () => {
  it("rejects revocation of grants owned by another milestone or an unknown stage", () => {
    const harness = create({
      approvalPolicy: {
        stages: [{ label: "Gate", required: true, requiredApprovalCount: 1, scope: "milestone" }],
      },
    }, "revocation-guards");
    const grantEditor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    const approvalId = grantEditor.approvals.grant(harness.milestone.approvalPolicy!.stages[0]!.id, actor);
    const granted = grantEditor.commit().milestone;
    const grant = granted.approvalRecords[0]!;

    const wrongMilestone = {
      ...granted,
      approvalRecords: [{ ...grant, milestoneId: asMilestoneId("another-milestone") }],
    };
    expect(() => new MilestoneEditor(wrongMilestone, harness.profile, harness).approvals.revoke(approvalId, actor)).toThrowError(MilestoneDomainError);

    const wrongStage = {
      ...granted,
      approvalRecords: [{ ...grant, stageId: asApprovalStageId("unknown-stage") }],
    };
    expect(() => new MilestoneEditor(wrongStage, harness.profile, harness).approvals.revoke(approvalId, actor)).toThrowError(MilestoneDomainError);
  });

  it("rejects nonexistent and stale current acceptances for completion", () => {
    const harness = create({}, "completion-guards");
    const nonexistent = { ...harness.milestone, currentAcceptanceId: asAcceptanceId("missing") };
    expect(() => new MilestoneEditor(nonexistent, harness.profile, harness).complete(actor)).toThrowError(MilestoneDomainError);

    const acceptEditor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    const oldAcceptanceId = acceptEditor.accept(actor);
    const accepted = acceptEditor.commit().milestone;
    const reviseEditor = new MilestoneEditor(accepted, harness.profile, harness);
    reviseEditor.definition.update({ title: "new revision" }, { reason: "scope changed", actor });
    const revised = reviseEditor.commit().milestone;
    const stale = { ...revised, currentAcceptanceId: oldAcceptanceId };
    expect(() => new MilestoneEditor(stale, harness.profile, harness).complete(actor)).toThrowError(MilestoneDomainError);
  });

  it("cannot revoke the same effective approval twice and preserves both ledger facts", () => {
    const harness = create({
      approvalPolicy: {
        stages: [{ label: "Gate", required: true, requiredApprovalCount: 1, scope: "milestone" }],
      },
    }, "double-revoke");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    const approvalId = editor.approvals.grant(harness.milestone.approvalPolicy!.stages[0]!.id, actor);
    editor.approvals.revoke(approvalId, { id: "revoker" });
    expect(() => editor.approvals.revoke(approvalId, { id: "again" })).toThrowError(MilestoneDomainError);
    expect(editor.commit().milestone.approvalRecords.map((record) => record.type)).toEqual(["granted", "revoked"]);
  });
});
