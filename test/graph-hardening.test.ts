import { describe, expect, it } from "vitest";
import {
  MilestoneDomainError,
  MilestoneEditor,
  affectedMilestoneIds,
  asDependencyId,
  blockedMilestoneIds,
  createGraphSnapshot,
  evaluateDependency,
  evaluateGraph,
  readyMilestoneIds,
  validateGraph,
  type MilestoneDependency,
} from "../src/index.js";
import { actor, create } from "./helpers.js";

describe("scheduler-facing graph evaluation", () => {
  it("separates blocked, unblocked, runnable, and non-blocking dependencies deterministically", () => {
    const aHarness = create({}, "sched-a");
    const a = aHarness.milestone;
    const b = create({}, "sched-b").milestone;
    const c = create({}, "sched-c").milestone;
    const dHarness = create({}, "sched-d");
    const dEditor = new MilestoneEditor(dHarness.milestone, dHarness.profile, dHarness);
    dEditor.accept(); dEditor.complete();
    const d = dEditor.commit().milestone;
    const dependencies: MilestoneDependency[] = [
      { id: asDependencyId("z-nonblocking"), milestoneId: c.id, dependsOnMilestoneId: a.id, gate: { type: "accepted" }, blocking: false },
      { id: asDependencyId("a-blocking"), milestoneId: b.id, dependsOnMilestoneId: a.id, gate: { type: "accepted" }, blocking: true },
    ];
    const graph = createGraphSnapshot([d, c, b, a], dependencies);
    const result = evaluateGraph(graph);

    expect(result.dependencies.map((value) => value.dependencyId)).toEqual([asDependencyId("a-blocking"), asDependencyId("z-nonblocking")]);
    expect(blockedMilestoneIds(graph)).toEqual([b.id]);
    expect(result.unblockedMilestoneIds).toEqual([a.id, c.id, d.id].sort());
    expect(readyMilestoneIds(graph)).toEqual([a.id, c.id].sort());
  });

  it("evaluates direct accepted/completed/criterion/deliverable gates", () => {
    const upstreamHarness = create({
      criteria: [{ title: "C", required: true, state: "verified" }],
      deliverables: [{ title: "D", required: true, state: "satisfied" }],
    }, "all-gates-up");
    const close = new MilestoneEditor(upstreamHarness.milestone, upstreamHarness.profile, upstreamHarness);
    close.accept(); close.complete();
    const upstream = close.commit().milestone;
    const downstream = create({}, "all-gates-down").milestone;
    const dependencies: MilestoneDependency[] = [
      { id: asDependencyId("accepted"), milestoneId: downstream.id, dependsOnMilestoneId: upstream.id, gate: { type: "accepted" }, blocking: true },
      { id: asDependencyId("completed"), milestoneId: downstream.id, dependsOnMilestoneId: upstream.id, gate: { type: "completed" }, blocking: true },
      { id: asDependencyId("criterion"), milestoneId: downstream.id, dependsOnMilestoneId: upstream.id, gate: { type: "criterion", criterionId: upstream.criteria[0]!.id, requiredState: "verified" }, blocking: true },
      { id: asDependencyId("deliverable"), milestoneId: downstream.id, dependsOnMilestoneId: upstream.id, gate: { type: "deliverable", deliverableRequirementId: upstream.deliverables[0]!.id, requiredState: "satisfied" }, blocking: true },
    ];
    const graph = createGraphSnapshot([upstream, downstream], dependencies);
    expect(dependencies.every((dependency) => evaluateDependency(dependency, graph))).toBe(true);
    expect(evaluateGraph(graph).blockedMilestoneIds).toEqual([]);
  });

  it("computes multi-hop and diamond invalidation impact without duplicates", () => {
    const a = create({}, "diamond-a").milestone;
    const b = create({}, "diamond-b").milestone;
    const c = create({}, "diamond-c").milestone;
    const d = create({}, "diamond-d").milestone;
    const parallel = create({}, "diamond-parallel").milestone;
    const dependencies: MilestoneDependency[] = [
      { id: asDependencyId("a-b"), milestoneId: b.id, dependsOnMilestoneId: a.id, gate: { type: "accepted" }, blocking: true },
      { id: asDependencyId("a-c"), milestoneId: c.id, dependsOnMilestoneId: a.id, gate: { type: "accepted" }, blocking: true },
      { id: asDependencyId("b-d"), milestoneId: d.id, dependsOnMilestoneId: b.id, gate: { type: "accepted" }, blocking: true },
      { id: asDependencyId("c-d"), milestoneId: d.id, dependsOnMilestoneId: c.id, gate: { type: "accepted" }, blocking: true },
    ];
    const graph = createGraphSnapshot([a, b, c, d, parallel], dependencies);
    expect(affectedMilestoneIds(graph, a.id)).toEqual([b.id, c.id, d.id].sort());
    expect(affectedMilestoneIds(graph, b.id)).toEqual([d.id]);
    expect(affectedMilestoneIds(graph, parallel.id)).toEqual([]);
  });

  it("makes a stale upstream acceptance fail its dependent gate", () => {
    const upstreamHarness = create({}, "stale-upstream");
    const acceptEditor = new MilestoneEditor(upstreamHarness.milestone, upstreamHarness.profile, upstreamHarness);
    acceptEditor.accept(actor);
    const upstream = acceptEditor.commit().milestone;
    const downstream = create({}, "stale-downstream").milestone;
    const dependency: MilestoneDependency = { id: asDependencyId("stale-gate"), milestoneId: downstream.id, dependsOnMilestoneId: upstream.id, gate: { type: "accepted" }, blocking: true };
    expect(evaluateDependency(dependency, createGraphSnapshot([upstream, downstream], [dependency]))).toBe(true);

    const revise = new MilestoneEditor(upstream, upstreamHarness.profile, upstreamHarness);
    revise.definition.update({ title: "new revision" }, { reason: "invalidate", actor });
    const invalidated = revise.commit().milestone;
    const graph = createGraphSnapshot([invalidated, downstream], [dependency]);
    expect(evaluateDependency(dependency, graph)).toBe(false);
    expect(evaluateGraph(graph).blockedMilestoneIds).toEqual([downstream.id]);
  });

  it("rejects invalid cyclic evaluation input", () => {
    const a = create({}, "cycle-eval-a").milestone;
    const b = create({}, "cycle-eval-b").milestone;
    const graph = createGraphSnapshot([a, b], [
      { id: asDependencyId("ab"), milestoneId: a.id, dependsOnMilestoneId: b.id, gate: { type: "accepted" }, blocking: true },
      { id: asDependencyId("ba"), milestoneId: b.id, dependsOnMilestoneId: a.id, gate: { type: "accepted" }, blocking: true },
    ]);
    expect(() => evaluateGraph(graph)).toThrowError(MilestoneDomainError);
  });

  it("holds DAG validation properties across generated forward-only graphs", () => {
    for (let size = 2; size <= 12; size += 1) {
      const nodes = Array.from({ length: size }, (_, index) => create({}, `dag-${size}-${index}`).milestone);
      const dependencies: MilestoneDependency[] = [];
      for (let index = 1; index < nodes.length; index += 1) {
        dependencies.push({
          id: asDependencyId(`dag-${size}-${index}`),
          milestoneId: nodes[index]!.id,
          dependsOnMilestoneId: nodes[Math.floor((index - 1) / 2)]!.id,
          gate: { type: "accepted" },
          blocking: true,
        });
      }
      const graph = createGraphSnapshot(nodes, dependencies);
      expect(validateGraph(graph)).toEqual([]);
      expect(new Set(affectedMilestoneIds(graph, nodes[0]!.id)).size).toBe(size - 1);
    }
  });
});
