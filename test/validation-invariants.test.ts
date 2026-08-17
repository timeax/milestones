import { describe, expect, it } from "vitest";
import {
  MilestoneEditor,
  asAcceptanceId,
  asApprovalRecordId,
  asApprovalStageId,
  asChallengeId,
  asCompletionId,
  asCriterionId,
  asDeliverableRequirementId,
  asDependencyId,
  asMilestoneId,
  asMilestoneRevisionId,
  asReviewId,
  createGraphSnapshot,
  validateGraph,
  validateMilestone,
  type Milestone,
} from "../src/index.js";
import { actor, create } from "./helpers.js";

function richMilestone(): Milestone {
  const harness = create({
    criteria: [{ title: "C", required: true, weight: 1, state: "verified" }],
    deliverables: [{ title: "D", required: true, state: "satisfied" }],
    dependencies: [{ dependsOnMilestoneId: asMilestoneId("upstream"), gate: { type: "accepted" }, blocking: false }],
    approvalPolicy: { stages: [{ label: "Gate", required: false, requiredApprovalCount: 0, scope: "milestone" }] },
  }, "validation-rich");
  const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
  const reviewId = editor.reviews.request();
  editor.reviews.complete(reviewId, "accepted", { completedBy: actor });
  const challengeId = editor.challenges.raise({ type: "criterion", criterionId: harness.milestone.criteria[0]!.id }, "check", "non_blocking", actor);
  editor.challenges.resolve(challengeId, "no_effect", { actor });
  editor.approvals.grant(harness.milestone.approvalPolicy!.stages[0]!.id, actor);
  editor.accept(actor);
  editor.complete(actor);
  return editor.commit().milestone;
}

function hasCode(milestone: Milestone, code: string): boolean {
  return validateMilestone(milestone).some((item) => item.code === code);
}

describe("aggregate corruption validation", () => {
  const base = richMilestone();
  const revision = base.revisions[0]!;
  const review = base.reviews[0]!;
  const challenge = base.challenges[0]!;
  const approval = base.approvalRecords[0]!;
  const acceptance = base.acceptanceRecords[0]!;
  const completion = base.completionRecords[0]!;
  const { result: _omittedResult, ...completedReviewWithoutResult } = review;

  const cases: readonly [string, string, Milestone][] = [
    ["empty milestone ID", "empty_id", { ...base, id: asMilestoneId("") }],
    ["missing current revision", "missing_current_revision", { ...base, currentRevisionId: asMilestoneRevisionId("missing") }],
    ["missing current acceptance", "missing_current_acceptance", { ...base, currentAcceptanceId: asAcceptanceId("missing") }],
    ["missing current completion", "missing_current_completion", { ...base, currentCompletionId: asCompletionId("missing") }],
    ["duplicate criterion", "duplicate_id", { ...base, criteria: [...base.criteria, base.criteria[0]!] }],
    ["duplicate deliverable", "duplicate_id", { ...base, deliverables: [...base.deliverables, base.deliverables[0]!] }],
    ["duplicate dependency", "duplicate_id", { ...base, dependencies: [...base.dependencies, base.dependencies[0]!] }],
    ["duplicate review", "duplicate_id", { ...base, reviews: [...base.reviews, review] }],
    ["duplicate challenge", "duplicate_id", { ...base, challenges: [...base.challenges, challenge] }],
    ["duplicate approval", "duplicate_id", { ...base, approvalRecords: [...base.approvalRecords, approval] }],
    ["duplicate acceptance", "duplicate_id", { ...base, acceptanceRecords: [...base.acceptanceRecords, acceptance] }],
    ["duplicate completion", "duplicate_id", { ...base, completionRecords: [...base.completionRecords, completion] }],
    ["non-monotonic revision", "invalid_revision_number", { ...base, revisions: [{ ...revision, number: 2 }] }],
    ["foreign revision", "revision_milestone_mismatch", { ...base, revisions: [{ ...revision, milestoneId: asMilestoneId("foreign") }] }],
    ["invalid revision profile", "invalid_version", { ...base, revisions: [{ ...revision, snapshot: { ...revision.snapshot, profile: { ...revision.snapshot.profile, version: 0 } } }] }],
    ["invalid criterion weight", "invalid_weight", { ...base, criteria: [{ ...base.criteria[0]!, weight: Number.NaN }] }],
    ["empty criterion artifact requirement", "empty_artifact_requirement", { ...base, criteria: [{ ...base.criteria[0]!, artifactRequirementIds: ["" as never] }] }],
    ["empty deliverable artifact requirement", "empty_artifact_requirement", { ...base, deliverables: [{ ...base.deliverables[0]!, artifactRequirementIds: ["" as never] }] }],
    ["self dependency", "self_dependency", { ...base, dependencies: [{ ...base.dependencies[0]!, dependsOnMilestoneId: base.id }] }],
    ["review missing revision", "missing_review_revision", { ...base, reviews: [{ ...review, milestoneRevisionId: asMilestoneRevisionId("missing") }] }],
    ["completed review missing result", "incomplete_completed_review", { ...base, reviews: [completedReviewWithoutResult] }],
    ["open review carrying result", "unexpected_review_result", { ...base, reviews: [{ ...review, state: "requested" }] }],
    ["challenge missing revision", "missing_challenge_revision", { ...base, challenges: [{ ...challenge, milestoneRevisionId: asMilestoneRevisionId("missing") }] }],
    ["challenge missing local target", "missing_challenge_target", { ...base, challenges: [{ ...challenge, target: { type: "criterion", criterionId: asCriterionId("missing") } }] }],
    ["challenge resolution mismatch", "challenge_resolution_mismatch", { ...base, challenges: [{ ...challenge, state: "open" }] }],
    ["approval missing revision", "missing_approval_revision", { ...base, approvalRecords: [{ ...approval, milestoneRevisionId: asMilestoneRevisionId("missing") }] }],
    ["approval missing stage", "missing_approval_stage", { ...base, approvalRecords: [{ ...approval, stageId: asApprovalStageId("missing") }] }],
    ["acceptance missing revision", "missing_acceptance_revision", { ...base, acceptanceRecords: [{ ...acceptance, milestoneRevisionId: asMilestoneRevisionId("missing") }] }],
    ["acceptance missing dependency", "missing_acceptance_snapshot_target", { ...base, acceptanceRecords: [{ ...acceptance, snapshot: { ...acceptance.snapshot, dependencies: [{ ...acceptance.snapshot.dependencies[0]!, id: asDependencyId("missing") }] } }] }],
    ["incoherent criterion snapshot", "incoherent_acceptance_snapshot", { ...base, acceptanceRecords: [{ ...acceptance, snapshot: { ...acceptance.snapshot, criteria: [{ ...acceptance.snapshot.criteria[0]!, satisfied: false }] } }] }],
    ["completion missing acceptance", "missing_completion_acceptance", { ...base, completionRecords: [{ ...completion, acceptanceId: asAcceptanceId("missing") }] }],
    ["completion revision mismatch", "completion_revision_mismatch", { ...base, completionRecords: [{ ...completion, milestoneRevisionId: asMilestoneRevisionId("other") }] }],
  ];

  it.each(cases)("detects %s", (_name, code, corrupt) => {
    expect(hasCode(corrupt, code)).toBe(true);
  });

  it("detects broken revision links and foreign/mismatched revocations", () => {
    const second = { ...revision, id: asMilestoneRevisionId("revision-2"), number: 2, previousRevisionId: asMilestoneRevisionId("missing") };
    expect(hasCode({ ...base, revisions: [revision, second], currentRevisionId: second.id }, "broken_revision_chain")).toBe(true);

    const revocation = {
      ...approval,
      id: asApprovalRecordId("revocation"),
      type: "revoked" as const,
      revokesApprovalId: approval.id,
      milestoneId: asMilestoneId("foreign"),
    };
    expect(hasCode({ ...base, approvalRecords: [approval, revocation] }, "revocation_target_mismatch")).toBe(true);
  });
});

describe("graph-context corruption validation", () => {
  it("detects cycles and invalid criterion/deliverable gate targets", () => {
    const first = create({}, "graph-a").milestone;
    const second = create({}, "graph-b").milestone;
    const dependencies = [
      { id: asDependencyId("a-b"), milestoneId: first.id, dependsOnMilestoneId: second.id, gate: { type: "criterion" as const, criterionId: asCriterionId("missing"), requiredState: "verified" as const }, blocking: true },
      { id: asDependencyId("b-a"), milestoneId: second.id, dependsOnMilestoneId: first.id, gate: { type: "deliverable" as const, deliverableRequirementId: asDeliverableRequirementId("missing"), requiredState: "satisfied" as const }, blocking: true },
    ];
    const issues = validateGraph(createGraphSnapshot([first, second], dependencies));
    expect(issues.map((item) => item.code)).toEqual(expect.arrayContaining(["dependency_cycle", "missing_gate_target"]));
  });

  it("validates unique local audit IDs not present in a minimal fixture", () => {
    const minimal = create().milestone;
    const corrupt = {
      ...minimal,
      reviews: [{ id: asReviewId("r"), milestoneId: minimal.id, milestoneRevisionId: minimal.currentRevisionId, state: "cancelled" as const, result: "accepted" as const, createdAt: minimal.createdAt }],
      challenges: [{ id: asChallengeId("c"), milestoneId: minimal.id, milestoneRevisionId: minimal.currentRevisionId, target: { type: "evidence" as const, ref: "" }, reason: "x", severity: "non_blocking" as const, state: "open" as const, createdAt: minimal.createdAt, evidence: [] }],
    };
    expect(validateMilestone(corrupt).map((item) => item.code)).toEqual(expect.arrayContaining(["unexpected_review_result", "missing_challenge_target"]));
  });
});
