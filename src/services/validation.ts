import type { Milestone, MilestoneProfile } from "../model/domain.js";
import type { ValidationIssue } from "../model/errors.js";
import { MilestoneValidationError } from "../model/errors.js";
import { validateMilestoneAggregate } from "./validation/aggregate.js";
import { addIssue, nonEmpty } from "./validation/common.js";
export { validateRevisionSnapshot } from "./validation/revisions.js";

export function validateProfile(profile: MilestoneProfile): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!nonEmpty(profile.ref.id)) addIssue(issues, "empty_id", "profile.ref.id", "Profile ID must be non-empty");
  if (!Number.isSafeInteger(profile.ref.version) || profile.ref.version < 1) addIssue(issues, "invalid_version", "profile.ref.version", "Profile version must be a positive integer");
  if (profile.reviews.required && !profile.reviews.enabled) addIssue(issues, "invalid_profile", "profile.reviews", "Required reviews must be enabled");
  if (profile.approvals.required && !profile.approvals.enabled) addIssue(issues, "invalid_profile", "profile.approvals", "Required approvals must be enabled");
  if (profile.completion.closeImmediatelyOnAcceptance && !profile.completion.enabled) addIssue(issues, "invalid_profile", "profile.completion", "Immediate completion requires completion to be enabled");
  return issues;
}

export function validateMilestone(milestone: Milestone, profile?: MilestoneProfile): readonly ValidationIssue[] {
  const issues = [...validateMilestoneAggregate(milestone, profile)];
  if (profile !== undefined) issues.push(...validateProfile(profile));
  return issues;
}

export function assertValidMilestone(milestone: Milestone, profile?: MilestoneProfile): void {
  const issues = validateMilestone(milestone, profile);
  if (issues.length > 0) throw new MilestoneValidationError(issues);
}
