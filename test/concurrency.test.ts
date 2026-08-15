import { describe, expect, it } from "vitest";
import {
  MilestoneDomainError,
  MilestoneEditor,
  deserializeMilestone,
  serializeMilestone,
} from "../src/index.js";
import { actor, create } from "./helpers.js";

describe("optimistic concurrency contract", () => {
  it("accepts an exact expected sequence and advances by emitted-event count", () => {
    const harness = create({ criteria: [{ title: "C", required: true, state: "submitted" }] }, "concurrency-match");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, { ...harness, expectedSequence: 1 });
    editor.criteria.verify(harness.milestone.criteria[0]!.id, actor);
    const result = editor.commit();
    expect(result.milestone.sequence).toBe(1 + result.events.length);
    expect(result.events.map((event) => event.sequence)).toEqual([2]);
  });

  it("rejects mismatch before mutation, ID allocation, or event emission", () => {
    const harness = create({}, "concurrency-mismatch");
    const before = structuredClone(harness.milestone);
    expect(() => new MilestoneEditor(harness.milestone, harness.profile, { ...harness, expectedSequence: 0 })).toThrowError(MilestoneDomainError);
    expect(harness.milestone).toEqual(before);

    const valid = new MilestoneEditor(harness.milestone, harness.profile, { ...harness, expectedSequence: 1 });
    valid.accept(actor);
    expect(valid.commit().events[0]?.id).toBe("concurrency-mismatch_event_5");
  });

  it("preserves sequence through the supported wire representation", () => {
    const harness = create({}, "concurrency-wire");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.accept(actor); editor.complete(actor);
    const committed = editor.commit().milestone;
    const hydrated = deserializeMilestone(JSON.parse(JSON.stringify(serializeMilestone(committed))));
    expect(hydrated.sequence).toBe(committed.sequence);
  });

  it("hands deterministic expected sequences across consecutive commits", () => {
    const harness = create({}, "concurrency-chain");
    const first = new MilestoneEditor(harness.milestone, harness.profile, { ...harness, expectedSequence: 1 });
    first.definition.update({ title: "revision two" }, { reason: "scope", actor });
    const firstResult = first.commit();
    expect(firstResult.events.map((event) => event.sequence)).toEqual([2, 3]);

    const second = new MilestoneEditor(firstResult.milestone, harness.profile, { ...harness, expectedSequence: 3 });
    second.accept(actor);
    const secondResult = second.commit();
    expect(secondResult.events.map((event) => event.sequence)).toEqual([4]);
    expect(secondResult.milestone.sequence).toBe(4);
  });
});
