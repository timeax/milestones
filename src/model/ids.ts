export type Brand<T, B extends string> = T & { readonly __brand: B };

// Milestone Root IDs
export type MilestoneId = Brand<string, "MilestoneId">;
export type MilestoneProfileId = Brand<string, "MilestoneProfileId">;
export type MilestoneRevisionId = Brand<string, "MilestoneRevisionId">;
export type MilestoneEventId = Brand<string, "MilestoneEventId">;

// Task Root IDs
export type TaskId = Brand<string, "TaskId">;
export type TaskProfileId = Brand<string, "TaskProfileId">;
export type TaskRevisionId = Brand<string, "TaskRevisionId">;
export type TaskEventId = Brand<string, "TaskEventId">;
export type TaskReminderId = Brand<string, "TaskReminderId">;

// Breakdown Root IDs
export type BreakdownId = Brand<string, "BreakdownId">;
export type BreakdownEventId = Brand<string, "BreakdownEventId">;

// Shared Child IDs
export type CriterionId = Brand<string, "CriterionId">;
export type DeliverableRequirementId = Brand<string, "DeliverableRequirementId">;
export type DependencyId = Brand<string, "DependencyId">;
export type ChallengeId = Brand<string, "ChallengeId">;
export type ChallengeEvidenceId = Brand<string, "ChallengeEvidenceId">;
export type ReviewId = Brand<string, "ReviewId">;
export type ApprovalStageId = Brand<string, "ApprovalStageId">;
export type ApprovalRecordId = Brand<string, "ApprovalRecordId">;
export type AcceptanceId = Brand<string, "AcceptanceId">;
export type CompletionId = Brand<string, "CompletionId">;

// Brand assertion / coercion helpers
export const asMilestoneId = (value: string): MilestoneId => value as MilestoneId;
export const asMilestoneProfileId = (value: string): MilestoneProfileId => value as MilestoneProfileId;
export const asMilestoneRevisionId = (value: string): MilestoneRevisionId => value as MilestoneRevisionId;
export const asMilestoneEventId = (value: string): MilestoneEventId => value as MilestoneEventId;

export const asTaskId = (value: string): TaskId => value as TaskId;
export const asTaskProfileId = (value: string): TaskProfileId => value as TaskProfileId;
export const asTaskRevisionId = (value: string): TaskRevisionId => value as TaskRevisionId;
export const asTaskEventId = (value: string): TaskEventId => value as TaskEventId;
export const asTaskReminderId = (value: string): TaskReminderId => value as TaskReminderId;

export const asBreakdownId = (value: string): BreakdownId => value as BreakdownId;
export const asBreakdownEventId = (value: string): BreakdownEventId => value as BreakdownEventId;

export const asCriterionId = (value: string): CriterionId => value as CriterionId;
export const asDeliverableRequirementId = (value: string): DeliverableRequirementId => value as DeliverableRequirementId;
export const asDependencyId = (value: string): DependencyId => value as DependencyId;
export const asChallengeId = (value: string): ChallengeId => value as ChallengeId;
export const asChallengeEvidenceId = (value: string): ChallengeEvidenceId => value as ChallengeEvidenceId;
export const asReviewId = (value: string): ReviewId => value as ReviewId;
export const asApprovalStageId = (value: string): ApprovalStageId => value as ApprovalStageId;
export const asApprovalRecordId = (value: string): ApprovalRecordId => value as ApprovalRecordId;
export const asAcceptanceId = (value: string): AcceptanceId => value as AcceptanceId;
export const asCompletionId = (value: string): CompletionId => value as CompletionId;

export type TaskAcceptanceId = AcceptanceId;
export type TaskCompletionId = CompletionId;
export const asTaskAcceptanceId = asAcceptanceId;
export const asTaskCompletionId = asCompletionId;
