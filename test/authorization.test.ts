import { describe, expect, it } from "vitest";
import {
  MilestoneDomainError,
  MilestoneEditor,
  deserializeMilestone,
  serializeMilestone,
  type MilestoneAction,
} from "../src/index.js";
import { actor, create, profile } from "./helpers.js";

describe("host authorization", () => {
  it("denies atomically without state, event, ID, or sequence changes", () => {
    const harness = create({ criteria: [{ title: "C", required: true, state: "submitted" }] }, "deny");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, {
      ...harness,
      authorization: {
        canPerform(input) {
          (input.milestone.criteria as unknown as { state: string }[])[0]!.state = "failed";
          return { allowed: false, reason: "host policy denied", details: { policy: "test" } };
        },
      },
    });

    expect(() => editor.criteria.verify(harness.milestone.criteria[0]!.id, actor)).toThrowError(
      MilestoneDomainError,
    );
    try {
      editor.criteria.verify(harness.milestone.criteria[0]!.id, actor);
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: "AUTHORIZATION_DENIED" });
    }
    const result = editor.commit();
    expect(result.milestone.criteria[0]!.state).toBe("submitted");
    expect(result.milestone.sequence).toBe(harness.milestone.sequence);
    expect(result.events).toEqual([]);
    expect(result.changes).toEqual([]);
  });

  it("routes every sensitive operation through typed host actions", () => {
    const selectedProfile = profile({
      reviews: { enabled: true, required: true },
      approvals: { enabled: true, required: true },
    });
    const harness = create({
      profile: selectedProfile,
      criteria: [
        { title: "verify", required: true, state: "submitted" },
        { title: "waive", required: true, state: "failed" },
      ],
      deliverables: [
        { title: "satisfy", required: true, state: "submitted" },
        { title: "waive", required: true, state: "rejected" },
      ],
      approvalPolicy: {
        stages: [{
          label: "Governance",
          required: true,
          requiredApprovalCount: 1,
          scope: "milestone",
          authorityRef: "governance:technical-approver",
        }],
      },
    }, "allow");
    const actions: MilestoneAction[] = [];
    const editor = new MilestoneEditor(harness.milestone, selectedProfile, {
      ...harness,
      authorization: {
        canPerform(input) {
          actions.push(input.action);
          if (input.action.startsWith("approval.")) {
            expect(input.subject).toMatchObject({ authorityRef: "governance:technical-approver" });
          }
          return true;
        },
      },
    });

    editor.definition.update({ title: "Revised" }, { actor, reason: "material" });
    editor.criteria.verify(harness.milestone.criteria[0]!.id, actor);
    editor.criteria.waive(harness.milestone.criteria[1]!.id, actor);
    editor.deliverables.satisfy(harness.milestone.deliverables[0]!.id, actor);
    editor.deliverables.waive(harness.milestone.deliverables[1]!.id, actor);
    const challengeId = editor.challenges.raise({ type: "milestone" }, "check", "non_blocking", actor);
    editor.challenges.resolve(challengeId, "no_effect", { actor });
    const reviewId = editor.reviews.request();
    editor.reviews.complete(reviewId, "accepted", { completedBy: actor });
    const stageId = harness.milestone.approvalPolicy!.stages[0]!.id;
    const approvalId = editor.approvals.grant(stageId, actor);
    editor.approvals.reject(stageId, { id: "rejector" }, "record");
    editor.approvals.waive(stageId, { id: "waiver" }, "exception");
    editor.approvals.revoke(approvalId, { id: "revoker" });
    editor.approvals.grant(stageId, { id: "replacement" });
    editor.accept(actor);
    editor.complete(actor);
    const closed = editor.commit().milestone;

    const reopen = new MilestoneEditor(closed, selectedProfile, {
      ...harness,
      authorization: { canPerform: (input) => { actions.push(input.action); return true; } },
    });
    reopen.reopen({ effect: "invalidate_completion", reason: "host request", actor });
    reopen.commit();

    expect(actions).toEqual(expect.arrayContaining<MilestoneAction>([
      "milestone.revise",
      "criterion.verify",
      "criterion.waive",
      "deliverable.satisfy",
      "deliverable.waive",
      "challenge.raise",
      "challenge.resolve",
      "review.complete",
      "approval.grant",
      "approval.reject",
      "approval.waive",
      "approval.revoke",
      "milestone.accept",
      "milestone.complete",
      "milestone.reopen",
    ]));
  });

  it("preserves hook-free behavior and authority references in snapshots and wire data", () => {
    const harness = create({
      approvalPolicy: {
        stages: [{
          label: "Technical",
          required: false,
          requiredApprovalCount: 0,
          scope: "milestone",
          authorityRef: "host:any-selector/value",
        }],
      },
    }, "authority-ref");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.approvals.updateStage(
      harness.milestone.approvalPolicy!.stages[0]!.id,
      { label: "Technical v2" },
      { reason: "rename", actor },
    );
    const result = editor.commit().milestone;
    const hydrated = deserializeMilestone(JSON.parse(JSON.stringify(serializeMilestone(result))));

    expect(hydrated.approvalPolicy?.stages[0]?.authorityRef).toBe("host:any-selector/value");
    expect(hydrated.revisions.at(-1)?.snapshot.approvalPolicy?.stages[0]?.authorityRef).toBe("host:any-selector/value");
  });
});
