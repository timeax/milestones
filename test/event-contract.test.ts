import { describe, expect, it } from "vitest";
import {
  MilestoneDomainError,
  MilestoneEditor,
  asMilestoneEventId,
  asMilestoneProfileId,
  deserializeEvents,
  serializeEvents,
} from "../src/index.js";
import { actor, create, profile } from "./helpers.js";

describe("typed event audit contract", () => {
  it("increments milestone-local sequence once per event with stable metadata and order", () => {
    const harness = create({ criteria: [{ title: "C", required: true, state: "submitted" }] }, "event-order");
    const causationId = asMilestoneEventId("external-command-event");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, {
      ...harness,
      correlationId: "workflow:42",
      causationId,
    });
    editor.criteria.verify(harness.milestone.criteria[0]!.id, actor);
    const challengeId = editor.challenges.raise({ type: "milestone" }, "check", "non_blocking", actor);
    editor.challenges.resolve(challengeId, "no_effect", { actor });
    const stageId = editor.approvals.addStage({ label: "Gate", required: false, requiredApprovalCount: 0, scope: "milestone" }, { actor });
    editor.approvals.updateStage(stageId, { label: "Gate v2" }, { actor });
    editor.approvals.removeStage(stageId, { actor });
    const result = editor.commit();

    expect(result.events.map((event) => event.type)).toEqual([
      "criterion.changed",
      "challenge.raised",
      "challenge.resolved",
      "milestone.revised",
      "approval_stage.added",
      "approval_stage.changed",
      "approval_stage.removed",
    ]);
    expect(result.events.map((event) => event.sequence)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(result.milestone.sequence).toBe(8);
    expect(result.events.every((event) => event.milestoneId === harness.milestone.id)).toBe(true);
    expect(result.events.every((event) => event.revisionId.length > 0)).toBe(true);
    expect(result.events.every((event) => event.occurredAt === harness.clock.now())).toBe(true);
    expect(result.events.every((event) => event.correlationId === "workflow:42" && event.causationId === causationId)).toBe(true);
    expect(result.events.every((event) => event.actor?.id === actor.id)).toBe(true);
  });

  it("freezes event meaning at emission even when the draft entity later changes", () => {
    const harness = create({}, "event-payload-clone");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    const challengeId = editor.challenges.raise({ type: "milestone" }, "question", "non_blocking", actor);
    editor.challenges.resolve(challengeId, "no_effect", { actor });
    const result = editor.commit();
    const raised = result.events[0];
    expect(raised).toMatchObject({ type: "challenge.raised", payload: { challenge: { state: "open" } } });
    expect(raised?.type === "challenge.raised" && "resolution" in raised.payload.challenge).toBe(false);
    expect(result.milestone.challenges[0]?.state).toBe("resolved");
  });

  it("emits explicit profile changes in addition to their material revision", () => {
    const harness = create({}, "profile-event");
    const nextProfile = profile({ ref: { id: asMilestoneProfileId("standard"), version: 2 } });
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.revisions.applyProfile(nextProfile, "policy update", actor);
    const result = editor.commit();
    expect(result.events.map((event) => event.type)).toEqual(["milestone.revised", "profile.changed"]);
    expect(result.events[1]).toMatchObject({ payload: { profile: nextProfile.ref } });
  });

  it("drops failed operations without event or sequence leakage", () => {
    const harness = create({ criteria: [{ title: "C", required: true, state: "submitted" }] }, "failed-event");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.criteria.verify(harness.milestone.criteria[0]!.id, actor);
    expect(() => editor.criteria.verify(harness.milestone.criteria[0]!.id, actor)).toThrowError(MilestoneDomainError);
    const result = editor.commit();
    expect(result.events).toHaveLength(1);
    expect(result.milestone.sequence).toBe(harness.milestone.sequence + 1);
  });

  it("rejects optimistic conflicts before any domain mutation", () => {
    const harness = create({}, "event-conflict");
    expect(() => new MilestoneEditor(harness.milestone, harness.profile, { ...harness, expectedSequence: 999 })).toThrowError(MilestoneDomainError);
    expect(harness.milestone.sequence).toBe(1);
  });

  it("round-trips the complete typed event envelope", () => {
    const harness = create({}, "event-wire");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, { ...harness, correlationId: "corr", causationId: asMilestoneEventId("cause") });
    editor.accept(actor); editor.complete(actor);
    const events = editor.commit().events;
    expect(deserializeEvents(serializeEvents(events))).toEqual(events);
  });
});
