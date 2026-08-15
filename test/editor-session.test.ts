import { describe, expect, it } from "vitest";
import { MilestoneDomainError, MilestoneEditor, asMilestoneId } from "../src/index.js";
import { actor, create } from "./helpers.js";

describe("shared editor session", () => {
  it("shares one draft and creates one revision across mixed material sub-editors", () => {
    const harness = create({}, "shared-session");
    const originalSnapshot = structuredClone(harness.milestone);
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);

    editor.definition.update({ title: "Revised title" }, { reason: "Configure milestone", actor });
    const criterionId = editor.criteria.add({
      title: "Shared criterion",
      required: true,
      state: "not_started",
    });
    const dependencyId = editor.dependencies.add(
      asMilestoneId("upstream"),
      { type: "accepted" },
    );
    const challengeId = editor.challenges.raise(
      { type: "criterion", criterionId },
      "Visible through shared draft",
      "non_blocking",
      actor,
    );

    const result = editor.commit();

    expect(result.milestone.revisions).toHaveLength(2);
    expect(result.revision?.number).toBe(2);
    expect(result.revision?.snapshot.criteria[0]?.id).toBe(criterionId);
    expect(result.revision?.snapshot.dependencies[0]?.id).toBe(dependencyId);
    expect(result.milestone.challenges[0]?.id).toBe(challengeId);
    expect(harness.milestone).toEqual(originalSnapshot);
    expect(harness.milestone.revisions).toHaveLength(1);
  });

  it("orders mixed sub-editor events deterministically and advances one shared sequence", () => {
    const harness = create({}, "event-order");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);

    editor.definition.update({ title: "A" }, { reason: "Mixed edit" });
    const criterionId = editor.criteria.add({
      title: "B",
      required: false,
      state: "not_started",
    });
    editor.criteria.start(criterionId);
    editor.deliverables.add({ title: "C", required: false, state: "missing" });

    const result = editor.commit();

    expect(result.events.map((event) => event.type)).toEqual([
      "milestone.revised",
      "definition.changed",
      "criterion.added",
      "criterion.changed",
      "deliverable.added",
    ]);
    expect(result.events.map((event) => event.sequence)).toEqual([2, 3, 4, 5, 6]);
    expect(result.milestone.sequence).toBe(6);
    expect(result.events.every((event) => event.revisionId === result.revision?.id)).toBe(true);
  });

  it("closes the shared session and every sub-editor after commit", () => {
    const harness = create({
      criteria: [{ title: "C", required: false, state: "not_started" }],
    }, "closed-session");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.criteria.start(harness.milestone.criteria[0]!.id);
    editor.commit();

    expect(() => editor.commit()).toThrowError(MilestoneDomainError);
    expect(() => editor.criteria.submit(harness.milestone.criteria[0]!.id)).toThrowError(
      MilestoneDomainError,
    );
    expect(() => editor.challenges.raise(
      { type: "milestone" },
      "late",
      "non_blocking",
    )).toThrowError(MilestoneDomainError);
  });
});
