import type {
  MilestoneDependency,
  MilestoneDependencyGate,
  MilestoneId,
} from "../model/domain.js";

function identityKey(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("");
}

/** Canonical semantic identity for a dependency gate. */
export function dependencyGateKey(gate: MilestoneDependencyGate): string {
  switch (gate.type) {
    case "accepted":
      return identityKey(["accepted"]);
    case "completed":
      return identityKey(["completed"]);
    case "criterion":
      return identityKey(["criterion", gate.criterionId, gate.requiredState]);
    case "deliverable":
      return identityKey([
        "deliverable",
        gate.deliverableRequirementId,
        gate.requiredState,
      ]);
  }
}

/**
 * Identity within one milestone aggregate. Dependency ID and blocking behavior
 * are deliberately excluded: blocking is mutable behavior on this relationship.
 */
export function dependencyIdentityKey(
  dependsOnMilestoneId: MilestoneId,
  gate: MilestoneDependencyGate,
): string {
  return identityKey([dependsOnMilestoneId, dependencyGateKey(gate)]);
}

/** Identity across a graph, where the owning milestone is also significant. */
export function graphDependencyIdentityKey(
  dependency: Pick<MilestoneDependency, "milestoneId" | "dependsOnMilestoneId" | "gate">,
): string {
  return identityKey([
    dependency.milestoneId,
    dependencyIdentityKey(dependency.dependsOnMilestoneId, dependency.gate),
  ]);
}
