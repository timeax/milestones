import { describe, expect, it } from "vitest";
import {
  MilestoneEditor,
  asMilestoneId,
  createGraphSnapshot,
  evaluateAcceptance,
  type Milestone,
} from "../src/index.js";
import { actor, create, profile } from "./helpers.js";

describe("acceptance evaluation and snapshots", () => {
  it("is pure, repeatable, and captures every configured gate", () => {
    const upstreamHarness = create({}, "snapshot-upstream");
    const upstreamEditor = new MilestoneEditor(upstreamHarness.milestone, upstreamHarness.profile, upstreamHarness);
    upstreamEditor.accept(actor);
    const upstream = upstreamEditor.commit().milestone;
    const selectedProfile = profile({
      reviews: { enabled: true, required: true },
      approvals: { enabled: true, required: true },
    });
    const harness = create({
      profile: selectedProfile,
      criteria: [{ title: "C", required: true, state: "verified" }],
      deliverables: [{ title: "D", required: true, state: "satisfied" }],
      dependencies: [{ dependsOnMilestoneId: upstream.id, gate: { type: "accepted" }, blocking: true }],
      approvalPolicy: { stages: [{ label: "Gate", required: true, requiredApprovalCount: 1, scope: "milestone" }] },
    }, "snapshot-main");
    const graph = createGraphSnapshot([upstream, harness.milestone]);
    const editor = new MilestoneEditor(harness.milestone, selectedProfile, { ...harness, graph });
    const challengeId = editor.challenges.raise({ type: "milestone" }, "advisory", "non_blocking", actor);
    const reviewId = editor.reviews.request();
    editor.reviews.complete(reviewId, "accepted", { completedBy: actor });
    editor.approvals.grant(harness.milestone.approvalPolicy!.stages[0]!.id, actor);

    const first = editor.evaluateAcceptance();
    const second = editor.evaluateAcceptance();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      accepted: true,
      snapshot: {
        revisionId: harness.milestone.currentRevisionId,
        criteria: [{ satisfied: true }],
        deliverables: [{ satisfied: true }],
        dependencies: [{ satisfied: true }],
        challenges: [{ id: challengeId, blocking: false }],
        reviews: [{ id: reviewId, satisfied: true }],
        approvals: [{ effectiveApprovalCount: 1, satisfied: true }],
      },
    });
    expect(harness.milestone).toEqual(create({
      profile: selectedProfile,
      criteria: [{ title: "C", required: true, state: "verified" }],
      deliverables: [{ title: "D", required: true, state: "satisfied" }],
      dependencies: [{ dependsOnMilestoneId: upstream.id, gate: { type: "accepted" }, blocking: true }],
      approvalPolicy: { stages: [{ label: "Gate", required: true, requiredApprovalCount: 1, scope: "milestone" }] },
    }, "snapshot-main").milestone);
  });

  it("returns stable gate-ordered reason codes and ignores optional work", () => {
    const selectedProfile = profile({
      reviews: { enabled: true, required: true },
      approvals: { enabled: true, required: true },
    });
    const harness = create({
      profile: selectedProfile,
      criteria: [
        { title: "required", required: true, state: "not_started" },
        { title: "optional", required: false, state: "not_started" },
      ],
      deliverables: [{ title: "required", required: true, state: "missing" }],
      dependencies: [{ dependsOnMilestoneId: asMilestoneId("missing-upstream"), gate: { type: "accepted" }, blocking: true }],
      approvalPolicy: { stages: [{ label: "Gate", required: true, requiredApprovalCount: 1, scope: "milestone" }] },
    }, "reason-order");
    const editor = new MilestoneEditor(harness.milestone, selectedProfile, harness);
    editor.challenges.raise({ type: "milestone" }, "block", "blocking", actor);

    const reasons = editor.evaluateAcceptance().reasons;
    expect(reasons.map((reason) => reason.code)).toEqual([
      "missing_criterion",
      "missing_deliverable",
      "unsatisfied_dependency",
      "blocking_challenge",
      "incomplete_review",
      "pending_approval",
    ]);
    expect(reasons.filter((reason) => reason.code === "missing_criterion")).toHaveLength(1);
  });

  it("applies snapshotted waiver policy deterministically", () => {
    const harness = create({ criteria: [{ title: "waived", required: true, state: "waived" }] }, "waiver-policy");
    expect(evaluateAcceptance(harness.milestone, harness.profile).accepted).toBe(true);
    const revision = harness.milestone.revisions[0]!;
    const strict: Milestone = {
      ...harness.milestone,
      revisions: [{
        ...revision,
        snapshot: {
          ...revision.snapshot,
          evaluationPolicy: { ...revision.snapshot.evaluationPolicy, waivedCriteriaSatisfyRequired: false },
        },
      }],
    };
    expect(evaluateAcceptance(strict, harness.profile).reasons.map((reason) => reason.code)).toEqual(["missing_criterion"]);
  });

  it("does not count rejected or revoked approvals", () => {
    const selectedProfile = profile({ approvals: { enabled: true, required: true } });
    const harness = create({
      profile: selectedProfile,
      approvalPolicy: { stages: [{ label: "Gate", required: true, requiredApprovalCount: 1, scope: "milestone" }] },
    }, "approval-evaluation");
    const editor = new MilestoneEditor(harness.milestone, selectedProfile, harness);
    const stageId = harness.milestone.approvalPolicy!.stages[0]!.id;
    editor.approvals.reject(stageId, { id: "rejector" });
    expect(editor.evaluateAcceptance().reasons.map((reason) => reason.code)).toContain("pending_approval");
    const grantId = editor.approvals.grant(stageId, actor);
    expect(editor.evaluateAcceptance().accepted).toBe(true);
    editor.approvals.revoke(grantId, { id: "revoker" });
    expect(editor.evaluateAcceptance().reasons.map((reason) => reason.code)).toContain("pending_approval");
  });
});

describe("completion evaluation and durable ledgers", () => {
  it("exposes pure completion evaluation with specific failure reasons", () => {
    const disabledProfile = profile({ completion: { enabled: false, closeImmediatelyOnAcceptance: false } });
    const disabled = create({ profile: disabledProfile }, "completion-disabled");
    const disabledEditor = new MilestoneEditor(disabled.milestone, disabledProfile, disabled);
    expect(disabledEditor.evaluateCompletion()).toMatchObject({
      completable: false,
      reasons: [{ code: "profile_feature_disabled" }, { code: "missing_acceptance" }],
    });

    const harness = create({}, "completion-enabled");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    expect(editor.evaluateCompletion().reasons.map((reason) => reason.code)).toEqual(["missing_acceptance"]);
    editor.accept(actor);
    expect(editor.evaluateCompletion()).toEqual({ completable: true, reasons: [] });
  });

  it("completion references its exact acceptance and both histories survive reopening", () => {
    const harness = create({}, "durable-ledgers");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    const acceptanceId = editor.accept(actor);
    const completionId = editor.complete(actor, "closed");
    const completed = editor.commit().milestone;
    expect(completed.completionRecords[0]).toMatchObject({ id: completionId, acceptanceId });

    const reopen = new MilestoneEditor(completed, harness.profile, harness);
    reopen.reopen({ effect: "invalidate_acceptance_and_completion", reason: "recheck", actor });
    const opened = reopen.commit().milestone;
    expect(opened.acceptanceRecords.map((value) => value.id)).toEqual([acceptanceId]);
    expect(opened.completionRecords.map((value) => value.id)).toEqual([completionId]);
    expect(opened.currentAcceptanceId).toBeUndefined();
    expect(opened.currentCompletionId).toBeUndefined();
  });
});
