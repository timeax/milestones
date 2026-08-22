import type {
  ActorRef,
  DependencyId,
  Milestone,
  MilestoneDependency,
  MilestoneDependencyGate,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { dependencyIdentityKey } from "../services/dependency-identity.js";
import { emit } from "./internal/events.js";
import { clone, ensureOpen, equalDomainValue, feature } from "./internal/helpers.js";
import { beginMaterialRevision } from "./internal/revision.js";
import type { EditorSession } from "./internal/session.js";

interface DependencyEditOptions {
  readonly reason?: string;
  readonly actor?: ActorRef;
}

export class DependencyEditor {
  private readonly session: EditorSession;

  public constructor(session: EditorSession) { this.session = session; }

  public add(
    dependsOnMilestoneId: Milestone["id"],
    gate: MilestoneDependencyGate,
    blocking = true,
    options: DependencyEditOptions = {},
  ): DependencyId {
    ensureOpen(this.session);
    feature(this.session.profile.dependencies.enabled, "dependencies");
    invariant(
      dependsOnMilestoneId !== this.session.draft.id,
      "SELF_DEPENDENCY",
      "A milestone cannot depend on itself",
    );
    invariant(
      !this.session.draft.dependencies.some(
        (item) => dependencyIdentityKey(item.dependsOnMilestoneId, item.gate)
          === dependencyIdentityKey(dependsOnMilestoneId, gate),
      ),
      "DUPLICATE_DEPENDENCY",
      "Duplicate dependency gate",
    );
    beginMaterialRevision(this.session, options.reason, options.actor);
    const dependency: MilestoneDependency = {
      id: this.session.ids.dependency(),
      milestoneId: this.session.draft.id,
      dependsOnMilestoneId,
      gate: clone(gate),
      blocking,
    };
    this.session.draft.dependencies.push(dependency);
    this.session.changes.push({ type: "dependency_changed", dependencyId: dependency.id });
    emit(this.session, "dependency.added", { dependency }, options.actor);
    return dependency.id;
  }

  public remove(id: DependencyId, options: DependencyEditOptions = {}): void {
    ensureOpen(this.session);
    invariant(
      this.session.draft.dependencies.some((item) => item.id === id),
      "NOT_FOUND",
      `Dependency ${id} was not found`,
    );
    beginMaterialRevision(this.session, options.reason, options.actor);
    this.session.draft.dependencies = this.session.draft.dependencies.filter(
      (item) => item.id !== id,
    );
    this.session.changes.push({ type: "dependency_changed", dependencyId: id });
    emit(this.session, "dependency.removed", { dependencyId: id }, options.actor);
  }

  public update(
    id: DependencyId,
    patch: Partial<Pick<MilestoneDependency, "gate" | "blocking">>,
    options: DependencyEditOptions = {},
  ): void {
    ensureOpen(this.session);
    const index = this.session.draft.dependencies.findIndex((item) => item.id === id);
    invariant(index >= 0, "NOT_FOUND", `Dependency ${id} was not found`);
    const current = this.session.draft.dependencies[index]!;
    const updated = {
      ...current,
      ...clone(patch),
      id: current.id,
      milestoneId: current.milestoneId,
      dependsOnMilestoneId: current.dependsOnMilestoneId,
    };
    if (equalDomainValue(current, updated)) return;
    invariant(
      !this.session.draft.dependencies.some(
        (item) => item.id !== id
          && dependencyIdentityKey(item.dependsOnMilestoneId, item.gate)
            === dependencyIdentityKey(updated.dependsOnMilestoneId, updated.gate),
      ),
      "DUPLICATE_DEPENDENCY",
      "Duplicate dependency gate",
    );
    beginMaterialRevision(this.session, options.reason, options.actor);
    this.session.draft.dependencies[index] = updated;
    this.session.changes.push({ type: "dependency_changed", dependencyId: id });
    emit(this.session, "dependency.changed", { dependency: updated }, options.actor);
  }
}

export function createDependencyEditor(session: EditorSession): DependencyEditor {
  return new DependencyEditor(session);
}
