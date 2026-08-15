import { describe, expect, it } from "vitest";
import {
  MilestoneDomainError,
  MilestoneEditor,
  asMilestoneId,
  calculateProgress,
  createGraphSnapshot,
  deserializeEvents,
  deserializeGraph,
  deserializeMilestone,
  serializeEvents,
  serializeGraph,
  serializeMilestone,
  validateMilestone,
  validateProfile,
} from "../src/index.js";
import { actor, create, profile } from "./helpers.js";

describe("serialization, validation, and editor boundaries", () => {
  it("round-trips aggregate, events, and map-based graph wire formats", () => {
    const h = create({ criteria: [{ title: "C", required: false, state: "waived" }] });
    const editor = new MilestoneEditor(h.milestone, h.profile, h); editor.criteria.reset(h.milestone.criteria[0]!.id, actor); const edited = editor.commit();
    const wire = serializeMilestone(edited.milestone); const hydrated = deserializeMilestone(JSON.parse(JSON.stringify(wire)));
    expect(hydrated).toEqual(edited.milestone);
    expect(deserializeEvents(serializeEvents(edited.events))).toEqual(edited.events);
    const graph = createGraphSnapshot([edited.milestone]);
    const graphHydrated = deserializeGraph(JSON.parse(JSON.stringify(serializeGraph(graph))) as unknown as ReturnType<typeof serializeGraph>);
    expect(graphHydrated.milestones.get(edited.milestone.id)?.gates.criteria.get(edited.milestone.criteria[0]!.id)?.state).toBe("not_started");
  });

  it("rejects invalid profiles, aggregates, and serialized input", () => {
    const invalidProfile = profile({ reviews: { enabled: false, required: true } });
    expect(validateProfile(invalidProfile)[0]?.code).toBe("invalid_profile");
    const h = create();
    const broken = { ...h.milestone, currentRevisionId: "missing" as never };
    expect(validateMilestone(broken).some((issue) => issue.code === "missing_current_revision")).toBe(true);
    expect(() => deserializeMilestone({ schemaVersion: "2.0" })).toThrowError(MilestoneDomainError);
    expect(() => deserializeEvents("not json")).toThrowError(MilestoneDomainError);
    expect(() => deserializeMilestone({ schemaVersion: "1.0", id: "x" })).toThrowError(MilestoneDomainError);
  });

  it("enforces profile feature boundaries and rollback closure without host I/O", () => {
    const p = profile({ criteria: { enabled: false }, deliverables: { enabled: false }, dependencies: { enabled: false, participatesInGraph: false }, challenges: { enabled: false }, reviews: { enabled: false, required: false }, approvals: { enabled: false, required: false } });
    const h = create({ profile: p }); const editor = new MilestoneEditor(h.milestone, p, h);
    expect(() => editor.criteria.add({ title: "x", required: true, state: "not_started" })).toThrowError(MilestoneDomainError);
    expect(() => editor.dependencies.add(asMilestoneId("other"), { type: "accepted" })).toThrowError(MilestoneDomainError);
    editor.rollback(); expect(() => editor.commit()).toThrowError(MilestoneDomainError);
  });

  it("handles deterministic zero-weight and empty progress", () => {
    const empty = create().milestone;
    expect(calculateProgress(empty).percentage).toBe(100);
    const zero = create({ criteria: [{ title: "zero", required: true, weight: 0, state: "not_started" }] }).milestone;
    expect(calculateProgress(zero)).toEqual({ completedWeight: 0, totalWeight: 0, percentage: 100 });
  });

  it("rejects runtime values that JSON would silently corrupt", () => {
    const h = create(); const invalid = { ...h.milestone, definition: { ...h.milestone.definition, metadata: { value: Number.NaN } } };
    expect(() => serializeMilestone(invalid as never)).toThrowError(MilestoneDomainError);
  });
});
