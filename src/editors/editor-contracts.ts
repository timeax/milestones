import type {
  ActorRef,
  ApprovalRecordId,
  ApprovalStageId,
  BreakdownClock,
  BreakdownEventId,
  BreakdownIdGenerator,
  ChallengeId,
  ChallengeEvidenceId,
  ChallengeTarget,
  CriterionId,
  DeliverableRequirementId,
  Milestone,
  MilestoneArtifactContext,
  MilestoneClock,
  MilestoneGraphSnapshot,
  MilestoneIdGenerator,
  MilestoneEventId,
  ReviewId,
  Task,
  TaskArtifactContext,
  TaskChallengeTarget,
  TaskClock,
  TaskEventId,
  TaskIdGenerator,
} from "../model/domain.js";
import type { TaskGraphSnapshot } from "../services/task-graph.js";

export type MilestoneAction =
  | "criterion.verify"
  | "criterion.waive"
  | "deliverable.satisfy"
  | "deliverable.waive"
  | "challenge.raise"
  | "challenge.resolve"
  | "evidence.add"
  | "evidence.supersede"
  | "evidence.withdraw"
  | "review.complete"
  | "approval.grant"
  | "approval.reject"
  | "approval.revoke"
  | "approval.waive"
  | "milestone.accept"
  | "milestone.complete"
  | "milestone.reopen"
  | "milestone.revise"
  | "source.attach"
  | "source.remove"
  | "source.replace"
  | "source.change_role"
  | "source.update";

export type MilestoneActionSubject =
  | { readonly type: "milestone" }
  | { readonly type: "criterion"; readonly criterionId: CriterionId }
  | { readonly type: "deliverable_requirement"; readonly deliverableRequirementId: DeliverableRequirementId }
  | { readonly type: "challenge"; readonly challengeId: ChallengeId }
  | { readonly type: "challenge_evidence"; readonly challengeId: ChallengeId; readonly challengeEvidenceId?: ChallengeEvidenceId }
  | { readonly type: "challenge_target"; readonly target: ChallengeTarget }
  | { readonly type: "review"; readonly reviewId: ReviewId }
  | { readonly type: "source"; readonly subject: { readonly type: import("../model/domain.js").MilestoneSourceSubjectType; readonly id: string }; readonly linkId?: import("@elqora/artifacts").ArtifactLinkId }
  | { readonly type: "approval_stage"; readonly approvalStageId: ApprovalStageId; readonly authorityRef?: string }
  | { readonly type: "approval_record"; readonly approvalRecordId: ApprovalRecordId; readonly approvalStageId: ApprovalStageId; readonly authorityRef?: string };

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface MilestoneAuthorizationInput {
  readonly action: MilestoneAction;
  readonly actor?: ActorRef;
  readonly milestone: Milestone;
  readonly subject?: MilestoneActionSubject;
}

export interface MilestoneAuthorizationContext {
  canPerform(input: MilestoneAuthorizationInput): boolean | AuthorizationDecision;
}

/** Explicit, side-effect-free dependencies for a milestone editor session. */
export interface MilestoneEditorOptions {
  readonly clock: MilestoneClock;
  readonly ids: MilestoneIdGenerator;
  readonly graph?: MilestoneGraphSnapshot;
  readonly artifacts?: MilestoneArtifactContext;
  readonly expectedSequence?: number;
  readonly correlationId?: string;
  readonly causationId?: MilestoneEventId;
  readonly historyLimit?: number;
  readonly authorization?: MilestoneAuthorizationContext;
}

export type TaskAction =
  | "criterion.verify"
  | "criterion.waive"
  | "deliverable.satisfy"
  | "deliverable.waive"
  | "challenge.raise"
  | "challenge.resolve"
  | "evidence.add"
  | "evidence.supersede"
  | "evidence.withdraw"
  | "review.complete"
  | "approval.grant"
  | "approval.reject"
  | "approval.revoke"
  | "approval.waive"
  | "task.accept"
  | "task.complete"
  | "task.reopen"
  | "task.revise"
  | "task.timing.update"
  | "task.reminder.add"
  | "task.reminder.update"
  | "task.reminder.remove"
  | "source.attach"
  | "source.remove"
  | "source.replace"
  | "source.change_role"
  | "source.update";

export type TaskActionSubject =
  | { readonly type: "task" }
  | { readonly type: "criterion"; readonly criterionId: CriterionId }
  | { readonly type: "deliverable_requirement"; readonly deliverableRequirementId: DeliverableRequirementId }
  | { readonly type: "challenge"; readonly challengeId: ChallengeId }
  | { readonly type: "challenge_evidence"; readonly challengeId: ChallengeId; readonly challengeEvidenceId?: ChallengeEvidenceId }
  | { readonly type: "challenge_target"; readonly target: TaskChallengeTarget }
  | { readonly type: "review"; readonly reviewId: ReviewId }
  | { readonly type: "source"; readonly subject: { readonly type: import("../model/domain.js").TaskSourceSubjectType; readonly id: string }; readonly linkId?: import("@elqora/artifacts").ArtifactLinkId }
  | { readonly type: "approval_stage"; readonly approvalStageId: ApprovalStageId; readonly authorityRef?: string }
  | { readonly type: "approval_record"; readonly approvalRecordId: ApprovalRecordId; readonly approvalStageId: ApprovalStageId; readonly authorityRef?: string }
  | { readonly type: "reminder"; readonly reminderId: import("../model/domain.js").TaskReminderId };

export interface TaskAuthorizationInput {
  readonly action: TaskAction;
  readonly actor?: ActorRef;
  readonly task: Task;
  readonly subject?: TaskActionSubject;
}

export interface TaskAuthorizationContext {
  canPerform(input: TaskAuthorizationInput): boolean | AuthorizationDecision;
}

/** Explicit, side-effect-free dependencies for a task editor session. */
export interface TaskEditorOptions {
  readonly clock: TaskClock;
  readonly ids: TaskIdGenerator;
  readonly graph?: TaskGraphSnapshot;
  readonly artifacts?: TaskArtifactContext;
  readonly expectedSequence?: number;
  readonly correlationId?: string;
  readonly causationId?: TaskEventId;
  readonly historyLimit?: number;
  readonly authorization?: TaskAuthorizationContext;
}

export type BreakdownAction =
  | "breakdown.definition.update"
  | "breakdown.milestone.add"
  | "breakdown.milestone.remove"
  | "breakdown.milestone.replace"
  | "breakdown.milestone.move";

export interface BreakdownAuthorizationInput {
  readonly action: BreakdownAction;
  readonly actor?: ActorRef;
  readonly breakdown: import("../model/domain.js").Breakdown;
  readonly milestoneId?: import("../model/domain.js").MilestoneId;
}

export interface BreakdownAuthorizationContext {
  canPerform(input: BreakdownAuthorizationInput): boolean | AuthorizationDecision;
}

export interface BreakdownEditorOptions {
  readonly clock: BreakdownClock;
  readonly ids: BreakdownIdGenerator;
  readonly expectedSequence?: number;
  readonly correlationId?: string;
  readonly causationId?: BreakdownEventId;
  readonly historyLimit?: number;
  readonly authorization?: BreakdownAuthorizationContext;
}
