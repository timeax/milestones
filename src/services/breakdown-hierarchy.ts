import type { Breakdown, BreakdownId, MilestoneId } from "../model/domain.js";
import type { ValidationIssue } from "../model/errors.js";
import { MilestoneDomainError } from "../model/errors.js";

export interface BreakdownHierarchySnapshot {
  readonly breakdowns: ReadonlyMap<BreakdownId, Breakdown>;
}

export function detectBreakdownCycles(
  snapshot: BreakdownHierarchySnapshot,
): readonly (readonly BreakdownId[])[] {
  // Map from milestoneId to breakdowns that decompose that milestone
  const breakdownsByParentMilestone = new Map<MilestoneId, BreakdownId[]>();
  for (const [breakdownId, breakdown] of snapshot.breakdowns) {
    const list = breakdownsByParentMilestone.get(breakdown.parentMilestoneId) ?? [];
    list.push(breakdownId);
    breakdownsByParentMilestone.set(breakdown.parentMilestoneId, list);
  }

  // Graph where breakdown A -> breakdown B if breakdown A contains a child milestone that is decomposed by breakdown B
  const adjacency = new Map<BreakdownId, BreakdownId[]>();
  for (const [breakdownId, breakdown] of snapshot.breakdowns) {
    const childBreakdownIds = new Set<BreakdownId>();
    for (const childMilestone of breakdown.milestones) {
      const decomposingBreakdowns = breakdownsByParentMilestone.get(childMilestone.id) ?? [];
      for (const nextId of decomposingBreakdowns) {
        childBreakdownIds.add(nextId);
      }
    }
    adjacency.set(breakdownId, [...childBreakdownIds].sort((a, b) => a.localeCompare(b)));
  }

  const state = new Map<BreakdownId, 0 | 1 | 2>();
  const path: BreakdownId[] = [];
  const unique = new Map<string, readonly BreakdownId[]>();

  const visit = (id: BreakdownId): void => {
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

  for (const id of [...snapshot.breakdowns.keys()].sort((a, b) => a.localeCompare(b))) {
    if ((state.get(id) ?? 0) === 0) visit(id);
  }

  return [...unique.values()].sort((a, b) => a.join("|").localeCompare(b.join("|")));
}

export function validateBreakdownHierarchy(
  snapshot: BreakdownHierarchySnapshot,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [id, breakdown] of snapshot.breakdowns) {
    const childIds = new Set<MilestoneId>();
    for (const milestone of breakdown.milestones) {
      if (milestone.id === breakdown.parentMilestoneId) {
        issues.push({
          code: "parent_milestone_id_collision",
          path: `breakdowns.${id}.milestones.${milestone.id}`,
          message: `Breakdown ${id} cannot contain its own parent milestone ${breakdown.parentMilestoneId}`,
        });
      }
      if (childIds.has(milestone.id)) {
        issues.push({
          code: "duplicate_child_milestone",
          path: `breakdowns.${id}.milestones.${milestone.id}`,
          message: `Breakdown ${id} contains duplicate child milestone ${milestone.id}`,
        });
      }
      childIds.add(milestone.id);
    }
  }

  for (const cycle of detectBreakdownCycles(snapshot)) {
    issues.push({
      code: "breakdown_hierarchy_cycle",
      path: "breakdowns",
      message: `Breakdown hierarchy cycle detected: ${cycle.join(" -> ")}`,
    });
  }

  return issues;
}

export function assertValidBreakdownHierarchy(
  snapshot: BreakdownHierarchySnapshot,
): void {
  const issues = validateBreakdownHierarchy(snapshot);
  if (issues.length > 0) {
    throw new MilestoneDomainError(
      issues.some((issue) => issue.code === "breakdown_hierarchy_cycle" || issue.code === "parent_milestone_id_collision")
        ? "DEPENDENCY_CYCLE"
        : "INVALID_ARGUMENT",
      "Invalid breakdown hierarchy",
      { issues },
    );
  }
}
