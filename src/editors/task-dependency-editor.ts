import type {
  ActorRef,
  CreateTaskDependencyInput,
  DependencyId,
  ExecutionSubjectRef,
  TaskDependency,
  TaskDependencyGate,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { emitTask } from "./internal/events.js";
import { authorizeTask, clone, ensureOpen, feature } from "./internal/helpers.js";
import { beginMaterialTaskRevision } from "./internal/revision.js";
import type { TaskEditorSession } from "./internal/session.js";

export interface TaskDependencyEditor {
  add(input: CreateTaskDependencyInput, actor?: ActorRef): DependencyId;
  update(id: DependencyId, patch: Partial<CreateTaskDependencyInput>, actor?: ActorRef): void;
  replace(id: DependencyId, input: CreateTaskDependencyInput, actor?: ActorRef): void;
  remove(id: DependencyId, actor?: ActorRef): void;
  clear(actor?: ActorRef): void;
  has(id: DependencyId): boolean;
  get(id: DependencyId): TaskDependency | undefined;
  list(): readonly TaskDependency[];
}

export function createTaskDependencyEditor(session: TaskEditorSession): TaskDependencyEditor {
  function validateGate(gate: TaskDependencyGate): void {
    if (!gate || !["accepted", "completed", "criterion", "deliverable"].includes(gate.type)) {
      invariant(false, "INVALID_ARGUMENT", "Invalid dependency gate type");
    }
  }

  function validateTarget(dependsOn: ExecutionSubjectRef): void {
    if (!dependsOn || !["milestone", "task"].includes(dependsOn.type)) {
      invariant(false, "INVALID_ARGUMENT", "Invalid dependency target type");
    }
    if (dependsOn.type === "task" && dependsOn.id === session.draft.id) {
      invariant(false, "SELF_DEPENDENCY", "A task cannot depend on itself", { taskId: session.draft.id });
    }
  }

  return {
    add(input: CreateTaskDependencyInput, actor?: ActorRef): DependencyId {
      ensureOpen(session);
      feature(session.profile.dependencies.enabled, "dependencies");
      authorizeTask(session, "source.update", actor, { type: "task" });
      validateTarget(input.dependsOn);
      validateGate(input.gate);
      const duplicate = session.draft.dependencies.some(
        (dep) =>
          dep.dependsOn.type === input.dependsOn.type &&
          dep.dependsOn.id === input.dependsOn.id &&
          dep.gate.type === input.gate.type,
      );
      invariant(!duplicate, "DUPLICATE_DEPENDENCY", "Duplicate dependency already exists");
      beginMaterialTaskRevision(session, "Dependency added", actor);
      const id = session.ids.dependency();
      const dependency: TaskDependency = {
        id,
        taskId: session.draft.id,
        dependsOn: clone(input.dependsOn),
        gate: clone(input.gate),
        blocking: input.blocking,
      };
      session.draft.dependencies.push(dependency);
      session.changes.push({ type: "dependency_changed", dependencyId: id });
      emitTask(session, "task.dependency_added", { dependency: clone(dependency) }, actor);
      return id;
    },

    update(id: DependencyId, patch: Partial<CreateTaskDependencyInput>, actor?: ActorRef): void {
      ensureOpen(session);
      feature(session.profile.dependencies.enabled, "dependencies");
      const index = session.draft.dependencies.findIndex((item) => item.id === id);
      invariant(index !== -1, "NOT_FOUND", `Dependency ${id} was not found`, { dependencyId: id });
      const current = session.draft.dependencies[index]!;
      if (patch.dependsOn !== undefined) validateTarget(patch.dependsOn);
      if (patch.gate !== undefined) validateGate(patch.gate);
      beginMaterialTaskRevision(session, "Dependency updated", actor);
      const updated: TaskDependency = {
        ...current,
        ...(patch.dependsOn === undefined ? {} : { dependsOn: clone(patch.dependsOn) }),
        ...(patch.gate === undefined ? {} : { gate: clone(patch.gate) }),
        ...(patch.blocking === undefined ? {} : { blocking: patch.blocking }),
      };
      session.draft.dependencies[index] = updated;
      session.changes.push({ type: "dependency_changed", dependencyId: id });
      emitTask(session, "task.dependency_changed", { dependency: clone(updated) }, actor);
    },

    replace(id: DependencyId, input: CreateTaskDependencyInput, actor?: ActorRef): void {
      this.update(id, input, actor);
    },

    remove(id: DependencyId, actor?: ActorRef): void {
      ensureOpen(session);
      feature(session.profile.dependencies.enabled, "dependencies");
      const index = session.draft.dependencies.findIndex((item) => item.id === id);
      invariant(index !== -1, "NOT_FOUND", `Dependency ${id} was not found`, { dependencyId: id });
      beginMaterialTaskRevision(session, "Dependency removed", actor);
      session.draft.dependencies.splice(index, 1);
      session.changes.push({ type: "dependency_changed", dependencyId: id });
      emitTask(session, "task.dependency_removed", { dependencyId: id }, actor);
    },

    clear(actor?: ActorRef): void {
      ensureOpen(session);
      for (const dep of [...session.draft.dependencies]) {
        this.remove(dep.id, actor);
      }
    },

    has(id: DependencyId): boolean {
      return session.draft.dependencies.some((item) => item.id === id);
    },

    get(id: DependencyId): TaskDependency | undefined {
      const dep = session.draft.dependencies.find((item) => item.id === id);
      return dep === undefined ? undefined : clone(dep);
    },

    list(): readonly TaskDependency[] {
      return clone(session.draft.dependencies);
    },
  };
}
