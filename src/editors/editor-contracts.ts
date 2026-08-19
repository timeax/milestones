import type {
  ActorRef,
  ApprovalRecordId,
  ApprovalStageId,
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
} from "../model/domain.js";

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

/** Explicit, side-effect-free dependencies for an editor session. */
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
