import type { Breakdown } from "../../model/domain.js";
import type { ValidationIssue } from "../../model/errors.js";
import { addIssue, nonEmpty } from "./common.js";
import { validateMilestoneAggregate } from "./aggregate.js";

export function validateBreakdownAggregate(breakdown: Breakdown): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!nonEmpty(breakdown.id)) {
    addIssue(issues, "empty_id", "id", "Breakdown ID must be non-empty");
  }
  if (!nonEmpty(breakdown.parentMilestoneId)) {
    addIssue(issues, "empty_parent_milestone_id", "parentMilestoneId", "Parent milestone ID must be non-empty");
  }
  if (!Number.isSafeInteger(breakdown.sequence) || breakdown.sequence < 1) {
    addIssue(issues, "invalid_sequence", "sequence", "Sequence must be a positive integer");
  }
  if (!nonEmpty(breakdown.definition.title)) {
    addIssue(issues, "empty_title", "definition.title", "Breakdown title must be non-empty");
  }

  const childIds = new Set<string>();
  for (const milestone of breakdown.milestones) {
    if (milestone.id === breakdown.parentMilestoneId) {
      addIssue(
        issues,
        "parent_milestone_id_collision",
        `milestones.${milestone.id}`,
        `Breakdown cannot contain its own parent milestone ${breakdown.parentMilestoneId}`,
      );
    }
    if (childIds.has(milestone.id)) {
      addIssue(
        issues,
        "duplicate_child_milestone",
        `milestones.${milestone.id}`,
        `Breakdown contains duplicate child milestone ${milestone.id}`,
      );
    }
    childIds.add(milestone.id);

    // Validate each child milestone as a valid aggregate
    const childIssues = validateMilestoneAggregate(milestone);
    for (const childIssue of childIssues) {
      issues.push({
        ...childIssue,
        path: `milestones.${milestone.id}.${childIssue.path}`,
      });
    }
  }

  return issues;
}
