import { describe, expect, it } from "vitest";
import {
  MilestoneDomainError,
  MilestoneEditor,
  asApprovalRecordId,
  asChallengeId,
  asDependencyId,
  asMilestoneRevisionId,
  type ReopenCause,
} from "../src/index.js";
import { actor, create } from "./helpers.js";

function completed(seed: string) {
  const harness = create({}, seed);
  const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
  const acceptanceId = editor.accept(actor);
  const completionId = editor.complete(actor);
  return { ...harness, milestone: editor.commit().milestone, acceptanceId, completionId };
}

describe("reopening cause and effect contract", () => {
  it("supports administrative completion-only reopening", () => {
    const harness = completed("reopen-admin");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.reopen({ effect: "invalidate_completion", reason: "administrative correction", actor, cause: { type: "administrative" } });
    const result = editor.commit();
    expect(result.milestone.currentAcceptanceId).toBe(harness.acceptanceId);
    expect(result.milestone.currentCompletionId).toBeUndefined();
    expect(result.invalidations).toEqual([{ type: "completion", ref: harness.completionId, reason: "administrative correction" }]);
  });

  const validityCauses: readonly ReopenCause[] = [
    { type: "revision", revisionId: asMilestoneRevisionId("external-revision") },
    { type: "challenge", challengeId: asChallengeId("challenge") },
    { type: "approval_revocation", approvalRecordId: asApprovalRecordId("revocation") },
    { type: "dependency_invalidation", dependencyId: asDependencyId("dependency") },
    { type: "artifact_invalidation", ref: "verification" },
  ];

  it.each(validityCauses)("requires acceptance invalidation for $type", (cause) => {
    const harness = completed(`reopen-${cause.type}`);
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    expect(() => editor.reopen({ effect: "invalidate_completion", reason: "invalid", actor, cause })).toThrowError(MilestoneDomainError);
    const unchanged = editor.commit();
    expect(unchanged.events).toEqual([]);
    expect(unchanged.milestone.currentAcceptanceId).toBe(harness.acceptanceId);
    expect(unchanged.milestone.currentCompletionId).toBe(harness.completionId);
  });

  it.each(validityCauses)("clears both pointers and preserves history for $type", (cause) => {
    const harness = completed(`invalidate-${cause.type}`);
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.reopen({ effect: "invalidate_acceptance_and_completion", reason: "underlying truth changed", actor, cause });
    const result = editor.commit();
    expect(result.milestone.currentAcceptanceId).toBeUndefined();
    expect(result.milestone.currentCompletionId).toBeUndefined();
    expect(result.milestone.acceptanceRecords.map((value) => value.id)).toEqual([harness.acceptanceId]);
    expect(result.milestone.completionRecords.map((value) => value.id)).toEqual([harness.completionId]);
    expect(result.events[0]).toMatchObject({ type: "milestone.reopened", payload: { cause } });
  });

  it("allows a host-requested full reopen followed by new durable lifecycle facts", () => {
    const harness = completed("reopen-host");
    const oldAcceptance = structuredClone(harness.milestone.acceptanceRecords[0]);
    const oldCompletion = structuredClone(harness.milestone.completionRecords[0]);
    const reopen = new MilestoneEditor(harness.milestone, harness.profile, harness);
    reopen.reopen({ effect: "invalidate_acceptance_and_completion", reason: "host governance", actor, cause: { type: "host_requested", ref: "case-1" } });
    const opened = reopen.commit().milestone;

    const closeAgain = new MilestoneEditor(opened, harness.profile, harness);
    const newAcceptanceId = closeAgain.accept(actor);
    const newCompletionId = closeAgain.complete(actor);
    const closedAgain = closeAgain.commit().milestone;
    expect(closedAgain.acceptanceRecords.map((value) => value.id)).toEqual([harness.acceptanceId, newAcceptanceId]);
    expect(closedAgain.completionRecords.map((value) => value.id)).toEqual([harness.completionId, newCompletionId]);
    expect(closedAgain.acceptanceRecords[0]).toEqual(oldAcceptance);
    expect(closedAgain.completionRecords[0]).toEqual(oldCompletion);
  });

  it("material revision performs revision-driven invalidation without rewriting ledgers", () => {
    const harness = completed("reopen-material-revision");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.definition.update({ title: "new material truth" }, { reason: "revision", actor });
    const result = editor.commit();
    expect(result.milestone.currentAcceptanceId).toBeUndefined();
    expect(result.milestone.currentCompletionId).toBeUndefined();
    expect(result.milestone.acceptanceRecords).toHaveLength(1);
    expect(result.milestone.completionRecords).toHaveLength(1);
    expect(result.events.map((event) => event.type)).toEqual(["milestone.revised", "definition.changed"]);
  });
});
