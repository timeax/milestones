import { describe, expect, it } from "vitest";
import { MilestoneEditor } from "../src/index.js";
import { actor, create } from "./helpers.js";

describe("revision semantics", () => {
  it("coalesces material edits from multiple subdomains into one final revision", () => {
    const harness = create({
      criteria: [{ title: "C", required: true, state: "not_started" }],
      deliverables: [{ title: "D", required: true, state: "missing" }],
      approvalPolicy: { stages: [{ label: "Gate", required: false, requiredApprovalCount: 0, scope: "milestone" }] },
    }, "material-coalesce");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.definition.update({ title: "Revised", description: "scope" }, { reason: "bundle", actor });
    editor.criteria.update(harness.milestone.criteria[0]!.id, { weight: 3 }, { actor });
    editor.deliverables.update(harness.milestone.deliverables[0]!.id, { required: false }, { actor });
    editor.approvals.updateStage(harness.milestone.approvalPolicy!.stages[0]!.id, { label: "Gate v2" }, { actor });
    const result = editor.commit();

    expect(result.milestone.revisions).toHaveLength(2);
    expect(result.revision?.snapshot).toMatchObject({
      definition: { title: "Revised", description: "scope" },
      criteria: [{ weight: 3 }],
      deliverables: [{ required: false }],
      approvalPolicy: { stages: [{ label: "Gate v2" }] },
    });
    expect(result.changes.filter((change) => change.type === "revised")).toHaveLength(1);
  });

  it("keeps execution-only state changes outside revision history", () => {
    const harness = create({
      criteria: [{ title: "C", required: true, state: "submitted" }],
      deliverables: [{ title: "D", required: true, state: "submitted" }],
      approvalPolicy: { stages: [{ label: "Gate", required: false, requiredApprovalCount: 0, scope: "milestone" }] },
    }, "runtime-only");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.criteria.verify(harness.milestone.criteria[0]!.id, actor);
    editor.deliverables.satisfy(harness.milestone.deliverables[0]!.id, actor);
    const challengeId = editor.challenges.raise({ type: "milestone" }, "check", "non_blocking", actor);
    editor.challenges.resolve(challengeId, "no_effect", { actor });
    const reviewId = editor.reviews.request();
    editor.reviews.complete(reviewId, "accepted", { completedBy: actor });
    editor.approvals.grant(harness.milestone.approvalPolicy!.stages[0]!.id, actor);
    editor.accept(actor);
    editor.complete(actor);
    const result = editor.commit();

    expect(result.revision).toBeUndefined();
    expect(result.milestone.revisions).toHaveLength(1);
  });

  it("supports explicit preserve and invalidate effects", () => {
    const harness = create({
      criteria: [
        { title: "preserve", required: true, state: "verified" },
        { title: "invalidate", required: true, state: "verified" },
      ],
      deliverables: [
        { title: "preserve", required: true, state: "satisfied" },
        { title: "invalidate", required: true, state: "satisfied" },
      ],
    }, "verification-effects");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.criteria.update(harness.milestone.criteria[0]!.id, { description: "clarified" }, { verificationEffect: "preserve" });
    editor.criteria.update(harness.milestone.criteria[1]!.id, { description: "changed" }, { verificationEffect: "invalidate", reason: "recheck" });
    editor.deliverables.update(harness.milestone.deliverables[0]!.id, { description: "clarified" }, { satisfactionEffect: "preserve" });
    editor.deliverables.update(harness.milestone.deliverables[1]!.id, { description: "changed" }, { satisfactionEffect: "invalidate", reason: "redeliver" });
    const result = editor.commit();

    expect(result.milestone.criteria.map((value) => value.state)).toEqual(["verified", "not_started"]);
    expect(result.milestone.deliverables.map((value) => value.state)).toEqual(["satisfied", "missing"]);
    expect(result.invalidations).toEqual(expect.arrayContaining([
      { type: "criterion_verification", ref: harness.milestone.criteria[1]!.id, reason: "recheck" },
      { type: "deliverable_satisfaction", ref: harness.milestone.deliverables[1]!.id, reason: "redeliver" },
    ]));
  });

  it("invalidates current pointers while preserving lifecycle ledgers", () => {
    const harness = create({}, "revision-ledgers");
    const close = new MilestoneEditor(harness.milestone, harness.profile, harness);
    const acceptanceId = close.accept(actor);
    const completionId = close.complete(actor);
    const closed = close.commit().milestone;
    const revise = new MilestoneEditor(closed, harness.profile, harness);
    revise.definition.update({ title: "new scope" }, { reason: "scope", actor });
    const result = revise.commit();

    expect(result.milestone.currentAcceptanceId).toBeUndefined();
    expect(result.milestone.currentCompletionId).toBeUndefined();
    expect(result.milestone.acceptanceRecords.map((value) => value.id)).toEqual([acceptanceId]);
    expect(result.milestone.completionRecords.map((value) => value.id)).toEqual([completionId]);
    expect(result.invalidations?.map(({ type, ref }) => ({ type, ref }))).toEqual([
      { type: "completion", ref: completionId },
      { type: "acceptance", ref: acceptanceId },
    ]);
    expect(result.invalidations?.every((value) => value.reason.includes("Material revision"))).toBe(true);
  });

  it("ignores idempotent updates but permits an explicit administrative revision", () => {
    const harness = create({}, "revision-noop");
    const noOp = new MilestoneEditor(harness.milestone, harness.profile, harness);
    noOp.definition.update(harness.milestone.definition, { reason: "same" });
    noOp.revisions.applyProfile(harness.profile, "same profile");
    expect(noOp.history.canUndo).toBe(false);
    const unchanged = noOp.commit();
    expect(unchanged).toMatchObject({ changes: [], events: [] });
    expect(unchanged.revision).toBeUndefined();

    const explicit = new MilestoneEditor(unchanged.milestone, harness.profile, harness);
    explicit.revisions.begin("administrative checkpoint", actor);
    expect(explicit.commit().milestone.revisions).toHaveLength(2);
  });

  it("does not let later sessions mutate an already committed revision snapshot", () => {
    const harness = create({}, "snapshot-immutability");
    const first = new MilestoneEditor(harness.milestone, harness.profile, harness);
    first.definition.update({ title: "version two" }, { reason: "first" });
    const committed = first.commit();
    const retainedSnapshot = structuredClone(committed.revision!.snapshot);

    const second = new MilestoneEditor(committed.milestone, harness.profile, harness);
    second.definition.update({ title: "version three" }, { reason: "second" });
    second.commit();

    expect(committed.revision!.snapshot).toEqual(retainedSnapshot);
    expect(committed.revision!.snapshot.definition.title).toBe("version two");
  });
});
