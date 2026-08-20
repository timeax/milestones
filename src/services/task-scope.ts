import type { Task, TaskId } from "../model/domain.js";
import type { ValidationIssue } from "../model/errors.js";
import { MilestoneDomainError } from "../model/errors.js";

export interface TaskScopeGraphSnapshot {
  readonly tasks: ReadonlyMap<TaskId, Task>;
}

export function detectTaskScopeCycles(snapshot: TaskScopeGraphSnapshot): readonly (readonly TaskId[])[] {
  const adjacency = new Map<TaskId, TaskId[]>();
  for (const [id, task] of snapshot.tasks) {
    if (task.scope.type === "task") {
      adjacency.set(id, [task.scope.taskId]);
    } else {
      adjacency.set(id, []);
    }
  }

  const state = new Map<TaskId, 0 | 1 | 2>();
  const path: TaskId[] = [];
  const unique = new Map<string, readonly TaskId[]>();

  const visit = (id: TaskId): void => {
    state.set(id, 1);
    path.push(id);
    for (const parentId of adjacency.get(id) ?? []) {
      if (!snapshot.tasks.has(parentId)) continue;
      if (state.get(parentId) === 1) {
        const start = path.indexOf(parentId);
        const cycle = [...path.slice(start), parentId];
        const canonical = [...cycle.slice(0, -1)].map(String).sort().join("|");
        unique.set(canonical, cycle);
      } else if ((state.get(parentId) ?? 0) === 0) {
        visit(parentId);
      }
    }
    path.pop();
    state.set(id, 2);
  };

  for (const id of [...snapshot.tasks.keys()].sort((a, b) => a.localeCompare(b))) {
    if ((state.get(id) ?? 0) === 0) visit(id);
  }

  return [...unique.values()].sort((a, b) => a.join("|").localeCompare(b.join("|")));
}

export function validateTaskScopeGraph(snapshot: TaskScopeGraphSnapshot): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [id, task] of snapshot.tasks) {
    if (task.scope.type === "task") {
      if (task.scope.taskId === id) {
        issues.push({
          code: "self_scoped_task",
          path: `tasks.${id}.scope.taskId`,
          message: `Task ${id} cannot be scoped directly to itself`,
        });
      }
    }
  }

  for (const cycle of detectTaskScopeCycles(snapshot)) {
    issues.push({
      code: "task_scope_cycle",
      path: "tasks.scope",
      message: `Task scope hierarchy cycle detected: ${cycle.join(" -> ")}`,
    });
  }

  return issues;
}

export function assertValidTaskScopeGraph(snapshot: TaskScopeGraphSnapshot): void {
  const issues = validateTaskScopeGraph(snapshot);
  if (issues.length > 0) {
    throw new MilestoneDomainError(
      issues.some((issue) => issue.code === "task_scope_cycle" || issue.code === "self_scoped_task")
        ? "DEPENDENCY_CYCLE"
        : "INVALID_ARGUMENT",
      "Invalid task scope hierarchy",
      { issues },
    );
  }
}
