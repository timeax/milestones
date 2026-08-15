import { describe, expect, it } from "vitest";
import {
  MilestoneEditor,
  deserializeMilestone,
  serializeMilestone,
  type ActorRef,
} from "../src/index.js";
import { create, profile } from "./helpers.js";

describe("actor identity", () => {
  it("preserves opaque actor references across every audit ledger and serialization", () => {
    const opaqueActor: ActorRef = {
      id: "opaque://host-value?case=Unchanged%2F123",
      type: "future.identity/type:v9",
    };
    const selectedProfile = profile({
      reviews: { enabled: true, required: true },
      approvals: { enabled: true, required: true },
    });
    const harness = create({
      profile: selectedProfile,
      approvalPolicy: {
        stages: [{
          label: "Audit gate",
          required: true,
          requiredApprovalCount: 1,
          scope: "milestone",
        }],
      },
    }, "actor-contract");
    const editor = new MilestoneEditor(harness.milestone, selectedProfile, harness);

    editor.definition.update({ title: "M1", description: "material change" }, { reason: "audit", actor: opaqueActor });
    const reviewId = editor.reviews.request({ requestedBy: opaqueActor, assignedReviewer: opaqueActor });
    editor.reviews.start(reviewId, opaqueActor);
    editor.reviews.complete(reviewId, "accepted", { completedBy: opaqueActor });
    editor.approvals.grant(harness.milestone.approvalPolicy!.stages[0]!.id, opaqueActor);
    editor.accept(opaqueActor);
    editor.complete(opaqueActor, "done");

    const result = editor.commit();
    const hydrated = deserializeMilestone(JSON.parse(JSON.stringify(serializeMilestone(result.milestone))));

    expect(hydrated.revisions.at(-1)?.actor).toEqual(opaqueActor);
    expect(hydrated.reviews[0]).toMatchObject({
      requestedBy: opaqueActor,
      assignedReviewer: opaqueActor,
      completedBy: opaqueActor,
    });
    expect(hydrated.approvalRecords[0]?.actor).toEqual(opaqueActor);
    expect(hydrated.acceptanceRecords[0]?.actor).toEqual(opaqueActor);
    expect(hydrated.completionRecords[0]?.actor).toEqual(opaqueActor);
    expect(result.events.every((event) => event.actor === undefined || event.actor.id === opaqueActor.id)).toBe(true);
  });

  it("treats actor type and id as opaque identity values", () => {
    const selectedProfile = profile({ approvals: { enabled: true, required: true } });
    const harness = create({
      profile: selectedProfile,
      approvalPolicy: {
        stages: [{
          label: "Two identities",
          required: true,
          requiredApprovalCount: 2,
          scope: "milestone",
        }],
      },
    }, "actor-pair");
    const editor = new MilestoneEditor(harness.milestone, selectedProfile, harness);
    const stage = harness.milestone.approvalPolicy!.stages[0]!;

    editor.approvals.grant(stage.id, { id: "same:id/with:separators", type: "person" });
    editor.approvals.grant(stage.id, { id: "same:id/with:separators", type: "automation" });

    expect(editor.evaluateAcceptance().accepted).toBe(true);
    expect(editor.commit().milestone.approvalRecords.map((record) => record.actor)).toEqual([
      { id: "same:id/with:separators", type: "person" },
      { id: "same:id/with:separators", type: "automation" },
    ]);
  });
});
