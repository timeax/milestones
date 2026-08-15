import type {
  DependencyAcceptanceSnapshot,
  DependencyId,
  EvaluationReason,
  Milestone,
  MilestoneDependency,
  MilestoneGateState,
  MilestoneGraphNode,
  MilestoneGraphSnapshot,
  MilestoneId,
} from "../model/domain.js";
import type { ValidationIssue } from "../model/errors.js";
import { MilestoneDomainError } from "../model/errors.js";

export function graphNodeFromMilestone(milestone: Milestone): MilestoneGraphNode {
  const gates: MilestoneGateState = {
    criteria: new Map(milestone.criteria.map((criterion) => [criterion.id, { state: criterion.state }])),
    deliverables: new Map(milestone.deliverables.map((deliverable) => [deliverable.id, { state: deliverable.state }])),
    accepted: milestone.currentAcceptanceId !== undefined,
    completed: milestone.currentCompletionId !== undefined,
  };
  return { id: milestone.id, revisionId: milestone.currentRevisionId, gates };
}

export function createGraphSnapshot(milestones: readonly Milestone[], dependencies: readonly MilestoneDependency[] = milestones.flatMap((milestone) => milestone.dependencies)): MilestoneGraphSnapshot {
  return { milestones: new Map(milestones.map((milestone) => [milestone.id, graphNodeFromMilestone(milestone)])), dependencies: [...dependencies] };
}

export function evaluateDependency(dependency: MilestoneDependency, graph: MilestoneGraphSnapshot): boolean {
  const upstream = graph.milestones.get(dependency.dependsOnMilestoneId);
  if (upstream === undefined) return false;
  switch (dependency.gate.type) {
    case "accepted": return upstream.gates.accepted;
    case "completed": return upstream.gates.completed;
    case "criterion": return upstream.gates.criteria.get(dependency.gate.criterionId)?.state === dependency.gate.requiredState;
    case "deliverable": return upstream.gates.deliverables.get(dependency.gate.deliverableRequirementId)?.state === dependency.gate.requiredState;
  }
}

export function validateGraph(graph: MilestoneGraphSnapshot): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const keys = new Set<string>();
  for (const dependency of graph.dependencies) {
    if (dependency.milestoneId === dependency.dependsOnMilestoneId) issues.push({ code: "self_dependency", path: `dependencies.${dependency.id}`, message: "A milestone cannot depend on itself" });
    if (!graph.milestones.has(dependency.milestoneId)) issues.push({ code: "missing_graph_node", path: `dependencies.${dependency.id}.milestoneId`, message: `Missing milestone node ${dependency.milestoneId}` });
    const upstream = graph.milestones.get(dependency.dependsOnMilestoneId);
    if (upstream === undefined) {
      issues.push({ code: "missing_graph_node", path: `dependencies.${dependency.id}.dependsOnMilestoneId`, message: `Missing upstream node ${dependency.dependsOnMilestoneId}` });
    } else if (dependency.gate.type === "criterion" && !upstream.gates.criteria.has(dependency.gate.criterionId)) {
      issues.push({ code: "missing_gate_target", path: `dependencies.${dependency.id}.gate.criterionId`, message: `Missing upstream criterion ${dependency.gate.criterionId}` });
    } else if (dependency.gate.type === "deliverable" && !upstream.gates.deliverables.has(dependency.gate.deliverableRequirementId)) {
      issues.push({ code: "missing_gate_target", path: `dependencies.${dependency.id}.gate.deliverableRequirementId`, message: `Missing upstream deliverable ${dependency.gate.deliverableRequirementId}` });
    }
    const key = `${dependency.milestoneId}|${dependency.dependsOnMilestoneId}|${JSON.stringify(dependency.gate)}`;
    if (keys.has(key)) issues.push({ code: "duplicate_dependency", path: `dependencies.${dependency.id}`, message: "Duplicate dependency gate" });
    keys.add(key);
  }
  for (const cycle of detectCycles(graph)) issues.push({ code: "dependency_cycle", path: "dependencies", message: `Dependency cycle: ${cycle.join(" -> ")}` });
  return issues;
}

export function assertValidGraph(graph: MilestoneGraphSnapshot): void {
  const issues = validateGraph(graph);
  if (issues.length > 0) throw new MilestoneDomainError(issues.some((issue) => issue.code === "dependency_cycle") ? "DEPENDENCY_CYCLE" : "INVALID_ARGUMENT", "Invalid milestone dependency graph", { issues });
}

export function detectCycles(graph: MilestoneGraphSnapshot): readonly (readonly MilestoneId[])[] {
  const adjacency = new Map<MilestoneId, MilestoneId[]>();
  for (const id of graph.milestones.keys()) adjacency.set(id, []);
  for (const dependency of graph.dependencies) adjacency.get(dependency.milestoneId)?.push(dependency.dependsOnMilestoneId);
  const state = new Map<MilestoneId, 0 | 1 | 2>();
  const path: MilestoneId[] = [];
  const unique = new Map<string, readonly MilestoneId[]>();
  const visit = (id: MilestoneId): void => {
    state.set(id, 1); path.push(id);
    for (const next of adjacency.get(id) ?? []) {
      if (state.get(next) === 1) {
        const start = path.indexOf(next);
        const cycle = [...path.slice(start), next];
        const canonical = [...cycle.slice(0, -1)].map(String).sort().join("|");
        unique.set(canonical, cycle);
      } else if ((state.get(next) ?? 0) === 0) visit(next);
    }
    path.pop(); state.set(id, 2);
  };
  for (const id of graph.milestones.keys()) if ((state.get(id) ?? 0) === 0) visit(id);
  return [...unique.values()];
}

export function evaluateMilestoneDependencies(milestone: Milestone, graph?: MilestoneGraphSnapshot): { readonly snapshots: readonly DependencyAcceptanceSnapshot[]; readonly reasons: readonly EvaluationReason[] } {
  const snapshots: DependencyAcceptanceSnapshot[] = [];
  const reasons: EvaluationReason[] = [];
  for (const dependency of milestone.dependencies) {
    const satisfied = graph !== undefined && evaluateDependency(dependency, graph);
    const upstreamRevisionId = graph?.milestones.get(dependency.dependsOnMilestoneId)?.revisionId;
    snapshots.push({ id: dependency.id, dependsOnMilestoneId: dependency.dependsOnMilestoneId, ...(upstreamRevisionId === undefined ? {} : { dependsOnRevisionId: upstreamRevisionId }), gate: structuredClone(dependency.gate), blocking: dependency.blocking, satisfied });
    if (dependency.blocking && !satisfied) reasons.push({ code: "unsatisfied_dependency", subjectId: dependency.id, message: `Dependency ${dependency.id} is not satisfied` });
  }
  return { snapshots, reasons };
}

export function findUnlockedMilestoneIds(graph: MilestoneGraphSnapshot): readonly MilestoneId[] {
  assertValidGraph(graph);
  return [...graph.milestones.keys()].filter((id) => graph.dependencies.filter((dependency) => dependency.milestoneId === id && dependency.blocking).every((dependency) => evaluateDependency(dependency, graph)));
}

export function downstreamImpact(graph: MilestoneGraphSnapshot, changedMilestoneId: MilestoneId): readonly MilestoneId[] {
  const result = new Set<MilestoneId>();
  const queue = [changedMilestoneId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dependency of graph.dependencies) {
      if (dependency.dependsOnMilestoneId === current && !result.has(dependency.milestoneId)) {
        result.add(dependency.milestoneId); queue.push(dependency.milestoneId);
      }
    }
  }
  result.delete(changedMilestoneId);
  return [...result];
}

export function dependencyById(graph: MilestoneGraphSnapshot, id: DependencyId): MilestoneDependency | undefined {
  return graph.dependencies.find((dependency) => dependency.id === id);
}
