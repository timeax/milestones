import { describe, expect, it } from "vitest";
import { MilestoneEditor, asDependencyId, createGraphSnapshot, detectCycles, downstreamImpact, evaluateDependency, findUnlockedMilestoneIds, graphNodeFromMilestone, validateGraph, type MilestoneDependency, type MilestoneGraphSnapshot } from "../src/index.js";
import { create } from "./helpers.js";

describe("technical dependency graph", () => {
  it("evaluates accepted, completed, criterion, and deliverable gates from immutable nodes", () => {
    const upstream = create({ criteria: [{ title: "C", required: true, state: "verified" }], deliverables: [{ title: "D", required: true, state: "satisfied" }] }, "up");
    const acceptedEditor = new MilestoneEditor(upstream.milestone, upstream.profile, upstream); acceptedEditor.accept(); acceptedEditor.complete(); const up = acceptedEditor.commit().milestone;
    const down = create({}, "down").milestone;
    const graph = createGraphSnapshot([up, down]);
    const gates: MilestoneDependency[] = [
      { id: asDependencyId("a"), milestoneId: down.id, dependsOnMilestoneId: up.id, gate: { type: "accepted" }, blocking: true },
      { id: asDependencyId("b"), milestoneId: down.id, dependsOnMilestoneId: up.id, gate: { type: "completed" }, blocking: true },
      { id: asDependencyId("c"), milestoneId: down.id, dependsOnMilestoneId: up.id, gate: { type: "criterion", criterionId: up.criteria[0]!.id, requiredState: "verified" }, blocking: true },
      { id: asDependencyId("d"), milestoneId: down.id, dependsOnMilestoneId: up.id, gate: { type: "deliverable", deliverableRequirementId: up.deliverables[0]!.id, requiredState: "satisfied" }, blocking: true },
    ];
    expect(gates.every((dependency) => evaluateDependency(dependency, graph))).toBe(true);
  });

  it("rejects self-dependencies, duplicates, missing gates, and cycles", () => {
    const a = create({}, "a").milestone; const b = create({}, "b").milestone;
    const dependencies: MilestoneDependency[] = [
      { id: asDependencyId("ab"), milestoneId: a.id, dependsOnMilestoneId: b.id, gate: { type: "accepted" }, blocking: true },
      { id: asDependencyId("ba"), milestoneId: b.id, dependsOnMilestoneId: a.id, gate: { type: "accepted" }, blocking: true },
      { id: asDependencyId("self"), milestoneId: a.id, dependsOnMilestoneId: a.id, gate: { type: "accepted" }, blocking: true },
      { id: asDependencyId("dup"), milestoneId: a.id, dependsOnMilestoneId: b.id, gate: { type: "accepted" }, blocking: true },
      { id: asDependencyId("missing"), milestoneId: b.id, dependsOnMilestoneId: a.id, gate: { type: "criterion", criterionId: "absent" as never, requiredState: "verified" }, blocking: true },
    ];
    const graph: MilestoneGraphSnapshot = { milestones: new Map([[a.id, graphNodeFromMilestone(a)], [b.id, graphNodeFromMilestone(b)]]), dependencies };
    const codes = validateGraph(graph).map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(["self_dependency", "duplicate_dependency", "missing_gate_target", "dependency_cycle"]));
    expect(detectCycles(graph).length).toBeGreaterThan(0);
  });

  it("discovers unlocked milestones and transitive downstream impact", () => {
    const a = create({}, "ga").milestone; const b = create({}, "gb").milestone; const c = create({}, "gc").milestone;
    const ab: MilestoneDependency = { id: asDependencyId("ab"), milestoneId: b.id, dependsOnMilestoneId: a.id, gate: { type: "accepted" }, blocking: true };
    const bc: MilestoneDependency = { id: asDependencyId("bc"), milestoneId: c.id, dependsOnMilestoneId: b.id, gate: { type: "accepted" }, blocking: true };
    const graph = createGraphSnapshot([a, b, c], [ab, bc]);
    expect(findUnlockedMilestoneIds(graph)).toEqual([a.id]);
    expect(new Set(downstreamImpact(graph, a.id))).toEqual(new Set([b.id, c.id]));
  });

  it("edits a dependency gate without changing its semantic identity", () => {
    const upstream = create({}, "edit-up").milestone; const h = create({}, "edit-down");
    const editor = new MilestoneEditor(h.milestone, h.profile, h); const id = editor.dependencies.add(upstream.id, { type: "accepted" }); const added = editor.commit().milestone;
    const update = new MilestoneEditor(added, h.profile, h); update.dependencies.update(id, { gate: { type: "completed" }, blocking: false }, { reason: "Tighten gate" }); const changed = update.commit();
    expect(changed.milestone.dependencies[0]).toMatchObject({ id, gate: { type: "completed" }, blocking: false });
    expect(changed.events.some((event) => event.type === "dependency.changed")).toBe(true);
  });
});
