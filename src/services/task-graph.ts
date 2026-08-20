import type {
  CriterionGateState,
  CriterionId,
  DeliverableGateState,
  DeliverableRequirementId,
  EvaluationReason,
  MilestoneGraphNode,
  MilestoneId,
  Task,
  TaskDependency,
  TaskDependencyAcceptanceSnapshot,
  TaskId,
  TaskRevisionId,
} from "../model/domain.js";
import type { ValidationIssue } from "../model/errors.js";
import { MilestoneDomainError } from "../model/errors.js";

export interface TaskGateState {
  readonly criteria: ReadonlyMap<CriterionId, CriterionGateState>;
  readonly deliverables: ReadonlyMap<DeliverableRequirementId, DeliverableGateState>;
  readonly accepted: boolean;
  readonly completed: boolean;
}

export interface TaskGraphNode {
  readonly id: TaskId;
  readonly revisionId: TaskRevisionId;
  readonly gates: TaskGateState;
}

export interface TaskGraphSnapshot {
  readonly tasks: ReadonlyMap<TaskId, TaskGraphNode>;
  readonly milestones?: ReadonlyMap<MilestoneId, MilestoneGraphNode>;
  readonly dependencies: readonly TaskDependency[];
}

export interface ExecutionDependencyResolver {
  getMilestone(id: MilestoneId): MilestoneGraphNode | undefined;
  getTask(id: TaskId): TaskGraphNode | undefined;
}

export function graphNodeFromTask(task: Task): TaskGraphNode {
  const gates: TaskGateState = {
    criteria: new Map(task.criteria.map((criterion) => [criterion.id, { state: criterion.state }])),
    deliverables: new Map(task.deliverables.map((deliverable) => [deliverable.id, { state: deliverable.state }])),
    accepted: task.currentAcceptanceId !== undefined,
    completed: task.currentCompletionId !== undefined,
  };
  return { id: task.id, revisionId: task.currentRevisionId, gates };
}

export function createTaskGraphSnapshot(
  tasks: readonly Task[],
  dependencies: readonly TaskDependency[] = tasks.flatMap((task) => task.dependencies),
  milestones?: readonly MilestoneGraphNode[],
): TaskGraphSnapshot {
  return {
    tasks: new Map(tasks.map((task) => [task.id, graphNodeFromTask(task)])),
    ...(milestones === undefined ? {} : { milestones: new Map(milestones.map((node) => [node.id, node])) }),
    dependencies: [...dependencies],
  };
}

export function evaluateTaskDependency(
  dependency: TaskDependency,
  graph: TaskGraphSnapshot | ExecutionDependencyResolver,
): boolean {
  if (dependency.dependsOn.type === "milestone") {
    const upstream = "getMilestone" in graph
      ? graph.getMilestone(dependency.dependsOn.id)
      : graph.milestones?.get(dependency.dependsOn.id);
    if (upstream === undefined) return false;
    switch (dependency.gate.type) {
      case "accepted": return upstream.gates.accepted;
      case "completed": return upstream.gates.completed;
      case "criterion": return upstream.gates.criteria.get(dependency.gate.criterionId)?.state === dependency.gate.requiredState;
      case "deliverable": return upstream.gates.deliverables.get(dependency.gate.deliverableRequirementId)?.state === dependency.gate.requiredState;
    }
  } else {
    const upstream = "getTask" in graph
      ? graph.getTask(dependency.dependsOn.id)
      : graph.tasks.get(dependency.dependsOn.id);
    if (upstream === undefined) return false;
    switch (dependency.gate.type) {
      case "accepted": return upstream.gates.accepted;
      case "completed": return upstream.gates.completed;
      case "criterion": return upstream.gates.criteria.get(dependency.gate.criterionId)?.state === dependency.gate.requiredState;
      case "deliverable": return upstream.gates.deliverables.get(dependency.gate.deliverableRequirementId)?.state === dependency.gate.requiredState;
    }
  }
}

export function evaluateTaskDependencies(
  task: Task,
  graph?: TaskGraphSnapshot | ExecutionDependencyResolver,
): { readonly snapshots: readonly TaskDependencyAcceptanceSnapshot[]; readonly reasons: readonly EvaluationReason[] } {
  const snapshots: TaskDependencyAcceptanceSnapshot[] = [];
  const reasons: EvaluationReason[] = [];
  for (const dependency of task.dependencies) {
    const satisfied = graph !== undefined && evaluateTaskDependency(dependency, graph);
    snapshots.push({
      id: dependency.id,
      dependsOn: structuredClone(dependency.dependsOn),
      gate: structuredClone(dependency.gate),
      blocking: dependency.blocking,
      satisfied,
    });
    if (dependency.blocking && !satisfied) {
      reasons.push({
        code: "unsatisfied_dependency",
        subjectId: dependency.id,
        message: `Dependency ${dependency.id} is not satisfied`,
      });
    }
  }
  return { snapshots, reasons };
}

export function validateTaskGraph(graph: TaskGraphSnapshot): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const keys = new Set<string>();
  for (const dependency of graph.dependencies) {
    if (dependency.dependsOn.type === "task" && dependency.taskId === dependency.dependsOn.id) {
      issues.push({
        code: "self_dependency",
        path: `dependencies.${dependency.id}`,
        message: "A task cannot depend on itself",
      });
    }
    if (!graph.tasks.has(dependency.taskId)) {
      issues.push({
        code: "missing_graph_node",
        path: `dependencies.${dependency.id}.taskId`,
        message: `Missing task node ${dependency.taskId}`,
      });
    }
    if (dependency.dependsOn.type === "task") {
      const upstream = graph.tasks.get(dependency.dependsOn.id);
      if (upstream === undefined) {
        issues.push({
          code: "missing_graph_node",
          path: `dependencies.${dependency.id}.dependsOn.id`,
          message: `Missing upstream task node ${dependency.dependsOn.id}`,
        });
      } else if (dependency.gate.type === "criterion" && !upstream.gates.criteria.has(dependency.gate.criterionId)) {
        issues.push({
          code: "missing_gate_target",
          path: `dependencies.${dependency.id}.gate.criterionId`,
          message: `Missing upstream criterion ${dependency.gate.criterionId}`,
        });
      } else if (dependency.gate.type === "deliverable" && !upstream.gates.deliverables.has(dependency.gate.deliverableRequirementId)) {
        issues.push({
          code: "missing_gate_target",
          path: `dependencies.${dependency.id}.gate.deliverableRequirementId`,
          message: `Missing upstream deliverable ${dependency.gate.deliverableRequirementId}`,
        });
      }
    } else if (dependency.dependsOn.type === "milestone" && graph.milestones !== undefined) {
      const upstream = graph.milestones.get(dependency.dependsOn.id);
      if (upstream === undefined) {
        issues.push({
          code: "missing_graph_node",
          path: `dependencies.${dependency.id}.dependsOn.id`,
          message: `Missing upstream milestone node ${dependency.dependsOn.id}`,
        });
      } else if (dependency.gate.type === "criterion" && !upstream.gates.criteria.has(dependency.gate.criterionId)) {
        issues.push({
          code: "missing_gate_target",
          path: `dependencies.${dependency.id}.gate.criterionId`,
          message: `Missing upstream criterion ${dependency.gate.criterionId}`,
        });
      } else if (dependency.gate.type === "deliverable" && !upstream.gates.deliverables.has(dependency.gate.deliverableRequirementId)) {
        issues.push({
          code: "missing_gate_target",
          path: `dependencies.${dependency.id}.gate.deliverableRequirementId`,
          message: `Missing upstream deliverable ${dependency.gate.deliverableRequirementId}`,
        });
      }
    }
    const key = `${dependency.taskId}:${dependency.dependsOn.type}:${dependency.dependsOn.id}:${dependency.gate.type}:${
      dependency.gate.type === "criterion" ? dependency.gate.criterionId : dependency.gate.type === "deliverable" ? dependency.gate.deliverableRequirementId : ""
    }`;
    if (keys.has(key)) {
      issues.push({
        code: "duplicate_dependency",
        path: `dependencies.${dependency.id}`,
        message: "Duplicate dependency gate",
      });
    }
    keys.add(key);
  }
  for (const cycle of detectTaskGraphCycles(graph)) {
    issues.push({
      code: "dependency_cycle",
      path: "dependencies",
      message: `Dependency cycle: ${cycle.join(" -> ")}`,
    });
  }
  return issues;
}

export function assertValidTaskGraph(graph: TaskGraphSnapshot): void {
  const issues = validateTaskGraph(graph);
  if (issues.length > 0) {
    throw new MilestoneDomainError(
      issues.some((issue) => issue.code === "dependency_cycle") ? "DEPENDENCY_CYCLE" : "INVALID_ARGUMENT",
      "Invalid task dependency graph",
      { issues },
    );
  }
}

export function detectTaskGraphCycles(graph: TaskGraphSnapshot): readonly (readonly TaskId[])[] {
  const adjacency = new Map<TaskId, TaskId[]>();
  for (const id of graph.tasks.keys()) adjacency.set(id, []);
  for (const dependency of graph.dependencies) {
    if (dependency.dependsOn.type === "task") {
      adjacency.get(dependency.taskId)?.push(dependency.dependsOn.id);
    }
  }
  for (const values of adjacency.values()) values.sort((left, right) => left.localeCompare(right));
  const state = new Map<TaskId, 0 | 1 | 2>();
  const path: TaskId[] = [];
  const unique = new Map<string, readonly TaskId[]>();
  const visit = (id: TaskId): void => {
    state.set(id, 1);
    path.push(id);
    for (const next of adjacency.get(id) ?? []) {
      if (state.get(next) === 1) {
        const start = path.indexOf(next);
        const cycle = [...path.slice(start), next];
        const canonical = [...cycle.slice(0, -1)].map(String).sort().join("|");
        unique.set(canonical, cycle);
      } else if ((state.get(next) ?? 0) === 0) {
        visit(next);
      }
    }
    path.pop();
    state.set(id, 2);
  };
  for (const id of [...graph.tasks.keys()].sort((left, right) => left.localeCompare(right))) {
    if ((state.get(id) ?? 0) === 0) visit(id);
  }
  return [...unique.values()].sort((left, right) => left.join("|").localeCompare(right.join("|")));
}
