import type {
  Artifact,
  ArtifactId,
  ArtifactLink,
  ArtifactRequirement,
  ArtifactRequirementId,
  ArtifactSubmission,
  ArtifactSubmissionId,
  ArtifactVerification,
  ArtifactVerificationId,
  ArtifactVersion,
  ArtifactVersionId,
} from "@elqora/artifacts";

export type Brand<T, B extends string> = T & { readonly __brand: B };
export type MilestoneId = Brand<string, "MilestoneId">;
export type MilestoneProfileId = Brand<string, "MilestoneProfileId">;
export type MilestoneRevisionId = Brand<string, "MilestoneRevisionId">;
export type CriterionId = Brand<string, "CriterionId">;
export type DeliverableRequirementId = Brand<string, "DeliverableRequirementId">;
export type DependencyId = Brand<string, "DependencyId">;
export type ChallengeId = Brand<string, "ChallengeId">;
export type ReviewId = Brand<string, "ReviewId">;
export type ApprovalStageId = Brand<string, "ApprovalStageId">;
export type ApprovalRecordId = Brand<string, "ApprovalRecordId">;
export type AcceptanceId = Brand<string, "AcceptanceId">;
export type CompletionId = Brand<string, "CompletionId">;
export type MilestoneEventId = Brand<string, "MilestoneEventId">;

export interface ActorRef { readonly id: string; readonly type?: string }
export interface MilestoneClock { now(): string }
export interface MilestoneIdGenerator {
  milestone(): MilestoneId;
  revision(): MilestoneRevisionId;
  criterion(): CriterionId;
  deliverableRequirement(): DeliverableRequirementId;
  dependency(): DependencyId;
  challenge(): ChallengeId;
  review(): ReviewId;
  approvalStage(): ApprovalStageId;
  approvalRecord(): ApprovalRecordId;
  acceptance(): AcceptanceId;
  completion(): CompletionId;
  event(): MilestoneEventId;
}

export interface MilestoneProfileRef { readonly id: MilestoneProfileId; readonly version: number }
export interface MilestoneProfile {
  readonly ref: MilestoneProfileRef;
  readonly criteria: { readonly enabled: boolean };
  readonly deliverables: { readonly enabled: boolean };
  readonly dependencies: { readonly enabled: boolean; readonly participatesInGraph: boolean };
  readonly revisions: { readonly enabled: boolean };
  readonly challenges: { readonly enabled: boolean };
  readonly reviews: { readonly enabled: boolean; readonly required: boolean };
  readonly approvals: { readonly enabled: boolean; readonly required: boolean };
  readonly completion: { readonly enabled: boolean; readonly closeImmediatelyOnAcceptance: boolean };
}

export interface MilestoneDefinition {
  readonly title: string;
  readonly description?: string;
  readonly key?: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export type CriterionState = "not_started" | "in_progress" | "submitted" | "verified" | "failed" | "waived";
export interface Criterion {
  readonly id: CriterionId;
  readonly title: string;
  readonly description?: string;
  readonly required: boolean;
  readonly weight?: number;
  readonly state: CriterionState;
  readonly artifactRequirementIds?: readonly ArtifactRequirementId[];
}
export type CriterionDefinitionSnapshot = Omit<Criterion, "state">;

export type DeliverableRequirementState = "missing" | "submitted" | "satisfied" | "rejected" | "waived";
export interface DeliverableRequirement {
  readonly id: DeliverableRequirementId;
  readonly title: string;
  readonly description?: string;
  readonly required: boolean;
  readonly state: DeliverableRequirementState;
  readonly artifactRequirementIds?: readonly ArtifactRequirementId[];
}
export type DeliverableDefinitionSnapshot = Omit<DeliverableRequirement, "state">;

export type MilestoneDependencyGate =
  | { readonly type: "accepted" }
  | { readonly type: "completed" }
  | { readonly type: "criterion"; readonly criterionId: CriterionId; readonly requiredState: "verified" }
  | { readonly type: "deliverable"; readonly deliverableRequirementId: DeliverableRequirementId; readonly requiredState: "satisfied" };
export interface MilestoneDependency {
  readonly id: DependencyId;
  readonly milestoneId: MilestoneId;
  readonly dependsOnMilestoneId: MilestoneId;
  readonly gate: MilestoneDependencyGate;
  readonly blocking: boolean;
}
export type DependencyDefinitionSnapshot = MilestoneDependency;

export type ChallengeTarget =
  | { readonly type: "milestone" }
  | { readonly type: "criterion"; readonly criterionId: CriterionId }
  | { readonly type: "deliverable_requirement"; readonly deliverableRequirementId: DeliverableRequirementId }
  | { readonly type: "review"; readonly reviewId: ReviewId }
  | { readonly type: "artifact"; readonly artifactId: ArtifactId; readonly artifactVersionId?: ArtifactVersionId }
  | { readonly type: "evidence"; readonly ref: string };
export type ChallengeState = "open" | "under_review" | "resolved" | "rejected" | "withdrawn" | "reopened";
export type ChallengeResolutionOutcome = "no_effect" | "target_invalidated" | "acceptance_invalidated" | "requirements_invalidated";
export interface ChallengeResolution {
  readonly outcome: ChallengeResolutionOutcome;
  readonly summary?: string;
  readonly resolvedBy?: ActorRef;
  readonly resolvedAt: string;
}
export interface MilestoneChallenge {
  readonly id: ChallengeId;
  readonly milestoneId: MilestoneId;
  readonly milestoneRevisionId: MilestoneRevisionId;
  readonly target: ChallengeTarget;
  readonly reason: string;
  readonly severity: "non_blocking" | "blocking";
  readonly state: ChallengeState;
  readonly raisedBy?: ActorRef;
  readonly createdAt: string;
  readonly resolution?: ChallengeResolution;
}

export type ReviewState = "requested" | "in_progress" | "completed" | "cancelled";
export type ReviewResult = "accepted" | "changes_requested" | "rejected";
export interface MilestoneReview {
  readonly id: ReviewId;
  readonly milestoneId: MilestoneId;
  readonly milestoneRevisionId: MilestoneRevisionId;
  readonly requestedBy?: ActorRef;
  readonly assignedReviewer?: ActorRef;
  readonly completedBy?: ActorRef;
  readonly state: ReviewState;
  readonly result?: ReviewResult;
  readonly summary?: string;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly artifactVersionIds?: readonly ArtifactVersionId[];
}

export interface ApprovalStage {
  readonly id: ApprovalStageId;
  readonly label: string;
  readonly required: boolean;
  readonly order?: number;
  readonly requiredApprovalCount: number;
  readonly scope: "milestone" | "criteria" | "deliverables";
  readonly criterionIds?: readonly CriterionId[];
  readonly deliverableRequirementIds?: readonly DeliverableRequirementId[];
  /** Opaque host-owned selector; the milestone SDK stores but never resolves it. */
  readonly authorityRef?: string;
}
export interface MilestoneApprovalPolicy { readonly stages: readonly ApprovalStage[] }
export type ApprovalPolicySnapshot = MilestoneApprovalPolicy;

interface ApprovalRecordBase {
  readonly id: ApprovalRecordId;
  readonly milestoneId: MilestoneId;
  readonly milestoneRevisionId: MilestoneRevisionId;
  readonly stageId: ApprovalStageId;
  readonly actor: ActorRef;
  readonly createdAt: string;
}
export interface ApprovalGrantedRecord extends ApprovalRecordBase { readonly type: "granted" }
export interface ApprovalRejectedRecord extends ApprovalRecordBase { readonly type: "rejected"; readonly reason?: string }
export interface ApprovalRevokedRecord extends ApprovalRecordBase { readonly type: "revoked"; readonly revokesApprovalId: ApprovalRecordId; readonly reason?: string }
export interface ApprovalWaivedRecord extends ApprovalRecordBase { readonly type: "waived"; readonly reason: string }
export type ApprovalRecord = ApprovalGrantedRecord | ApprovalRejectedRecord | ApprovalRevokedRecord | ApprovalWaivedRecord;

export interface MilestoneEvaluationPolicySnapshot {
  readonly requiredCriteriaMustBeVerified: boolean;
  readonly requiredDeliverablesMustBeSatisfied: boolean;
  readonly waivedCriteriaSatisfyRequired: boolean;
  readonly waivedDeliverablesSatisfyRequired: boolean;
  readonly blockingChallengesPreventAcceptance: boolean;
  readonly requiredReviewResult: "accepted";
  readonly requireReviewWhenProfileRequires: boolean;
  readonly requireApprovalsWhenProfileRequires: boolean;
  readonly completionRequiresCurrentAcceptance: boolean;
  readonly closeImmediatelyOnAcceptance: boolean;
}

export interface MilestoneRevisionSnapshot {
  readonly profile: MilestoneProfileRef;
  readonly evaluationPolicy: MilestoneEvaluationPolicySnapshot;
  readonly definition: MilestoneDefinition;
  readonly criteria: readonly CriterionDefinitionSnapshot[];
  readonly deliverables: readonly DeliverableDefinitionSnapshot[];
  readonly dependencies: readonly DependencyDefinitionSnapshot[];
  readonly approvalPolicy?: ApprovalPolicySnapshot;
}
export interface MilestoneRevision {
  readonly id: MilestoneRevisionId;
  readonly milestoneId: MilestoneId;
  readonly number: number;
  readonly previousRevisionId?: MilestoneRevisionId;
  readonly reason?: string;
  readonly actor?: ActorRef;
  readonly createdAt: string;
  readonly snapshot: MilestoneRevisionSnapshot;
}

export type MilestoneArtifactSubjectType = "milestone" | "criterion" | "deliverable_requirement" | "challenge" | "review" | "approval" | "acceptance" | "completion";
export type MilestoneArtifactRole = "deliverable" | "evidence" | "verification" | "challenge_evidence" | "response_evidence" | "review_evidence" | "approval_evidence" | "acceptance_evidence" | "handover";
export type MilestoneArtifactLink = ArtifactLink<MilestoneArtifactRole, MilestoneArtifactSubjectType>;
export interface MilestoneArtifactContext {
  readonly requirements: ReadonlyMap<ArtifactRequirementId, ArtifactRequirement>;
  readonly artifacts: ReadonlyMap<ArtifactId, Artifact>;
  readonly versions: ReadonlyMap<ArtifactVersionId, ArtifactVersion>;
  readonly submissions: ReadonlyMap<ArtifactSubmissionId, ArtifactSubmission>;
  readonly verifications: ReadonlyMap<ArtifactVerificationId, ArtifactVerification>;
  readonly links: readonly MilestoneArtifactLink[];
}
export interface ArtifactEvaluationSnapshot {
  readonly artifactRequirementId: ArtifactRequirementId;
  readonly artifactId: ArtifactId;
  readonly artifactVersionId?: ArtifactVersionId;
  readonly submissionId?: ArtifactSubmissionId;
  readonly verificationId?: ArtifactVerificationId;
  readonly outcome: "satisfied" | "failed" | "waived";
}

export interface CriterionAcceptanceSnapshot {
  readonly id: CriterionId;
  readonly state: CriterionState;
  readonly satisfied: boolean;
}
export interface DeliverableAcceptanceSnapshot {
  readonly id: DeliverableRequirementId;
  readonly state: DeliverableRequirementState;
  readonly satisfied: boolean;
}
export interface DependencyAcceptanceSnapshot {
  readonly id: DependencyId;
  readonly dependsOnMilestoneId: MilestoneId;
  readonly dependsOnRevisionId?: MilestoneRevisionId;
  readonly gate: MilestoneDependencyGate;
  readonly blocking: boolean;
  readonly satisfied: boolean;
}
export interface ChallengeAcceptanceSnapshot { readonly id: ChallengeId; readonly target: ChallengeTarget; readonly severity: "non_blocking" | "blocking"; readonly state: ChallengeState; readonly resolution?: ChallengeResolution; readonly blocking: boolean }
export interface ReviewAcceptanceSnapshot { readonly id: ReviewId; readonly milestoneRevisionId: MilestoneRevisionId; readonly state: ReviewState; readonly result?: ReviewResult; readonly artifactVersionIds: readonly ArtifactVersionId[]; readonly satisfied: boolean }
export interface ApprovalAcceptanceSnapshot { readonly stageId: ApprovalStageId; readonly milestoneRevisionId: MilestoneRevisionId; readonly effectiveApprovalCount: number; readonly requiredApprovalCount: number; readonly satisfied: boolean; readonly waived: boolean; readonly actorIds: readonly string[] }
export interface MilestoneAcceptanceSnapshot {
  readonly revisionId: MilestoneRevisionId;
  readonly criteria: readonly CriterionAcceptanceSnapshot[];
  readonly deliverables: readonly DeliverableAcceptanceSnapshot[];
  readonly dependencies: readonly DependencyAcceptanceSnapshot[];
  readonly challenges: readonly ChallengeAcceptanceSnapshot[];
  readonly reviews: readonly ReviewAcceptanceSnapshot[];
  readonly approvals: readonly ApprovalAcceptanceSnapshot[];
  readonly artifacts: readonly ArtifactEvaluationSnapshot[];
}
export interface MilestoneAcceptance {
  readonly id: AcceptanceId;
  readonly milestoneId: MilestoneId;
  readonly milestoneRevisionId: MilestoneRevisionId;
  readonly acceptedAt: string;
  readonly actor?: ActorRef;
  readonly snapshot: MilestoneAcceptanceSnapshot;
}
export interface MilestoneCompletion {
  readonly id: CompletionId;
  readonly milestoneId: MilestoneId;
  readonly milestoneRevisionId: MilestoneRevisionId;
  readonly acceptanceId: AcceptanceId;
  readonly completedAt: string;
  readonly actor?: ActorRef;
  readonly reason?: string;
}

export interface Milestone {
  readonly id: MilestoneId;
  readonly profile: MilestoneProfileRef;
  readonly currentRevisionId: MilestoneRevisionId;
  readonly revisions: readonly MilestoneRevision[];
  readonly definition: MilestoneDefinition;
  readonly criteria: readonly Criterion[];
  readonly deliverables: readonly DeliverableRequirement[];
  readonly dependencies: readonly MilestoneDependency[];
  readonly challenges: readonly MilestoneChallenge[];
  readonly reviews: readonly MilestoneReview[];
  readonly approvalPolicy?: MilestoneApprovalPolicy;
  readonly approvalRecords: readonly ApprovalRecord[];
  readonly acceptanceRecords: readonly MilestoneAcceptance[];
  readonly currentAcceptanceId?: AcceptanceId;
  readonly completionRecords: readonly MilestoneCompletion[];
  readonly currentCompletionId?: CompletionId;
  readonly sequence: number;
  readonly createdAt: string;
  readonly updatedAt?: string;
}

export interface CriterionGateState { readonly state: CriterionState }
export interface DeliverableGateState { readonly state: DeliverableRequirementState }
export interface MilestoneGateState {
  readonly criteria: ReadonlyMap<CriterionId, CriterionGateState>;
  readonly deliverables: ReadonlyMap<DeliverableRequirementId, DeliverableGateState>;
  readonly accepted: boolean;
  readonly completed: boolean;
}
export interface MilestoneGraphNode { readonly id: MilestoneId; readonly revisionId: MilestoneRevisionId; readonly gates: MilestoneGateState }
export interface MilestoneGraphSnapshot { readonly milestones: ReadonlyMap<MilestoneId, MilestoneGraphNode>; readonly dependencies: readonly MilestoneDependency[] }
export interface DependencyEvaluation {
  readonly dependencyId: DependencyId;
  readonly milestoneId: MilestoneId;
  readonly dependsOnMilestoneId: MilestoneId;
  readonly blocking: boolean;
  readonly satisfied: boolean;
}
export interface MilestoneGraphEvaluation {
  readonly dependencies: readonly DependencyEvaluation[];
  readonly blockedMilestoneIds: readonly MilestoneId[];
  readonly unblockedMilestoneIds: readonly MilestoneId[];
  readonly runnableMilestoneIds: readonly MilestoneId[];
}

export type ReopenEffect = "invalidate_completion" | "invalidate_acceptance_and_completion";
export type ReopenCause =
  | { readonly type: "administrative" }
  | { readonly type: "revision"; readonly revisionId: MilestoneRevisionId }
  | { readonly type: "challenge"; readonly challengeId: ChallengeId }
  | { readonly type: "approval_revocation"; readonly approvalRecordId: ApprovalRecordId }
  | { readonly type: "dependency_invalidation"; readonly dependencyId: DependencyId }
  | { readonly type: "artifact_invalidation"; readonly ref: string }
  | { readonly type: "host_requested"; readonly ref?: string };
export interface ReopenRequest { readonly effect: ReopenEffect; readonly reason: string; readonly actor?: ActorRef; readonly cause?: ReopenCause }

export type EvaluationReasonCode =
  | "missing_criterion" | "missing_deliverable" | "missing_acceptance" | "unsatisfied_dependency" | "blocking_challenge"
  | "incomplete_review" | "pending_approval" | "artifact_requirement_missing" | "artifact_submission_missing"
  | "artifact_verification_missing" | "artifact_verification_failed" | "artifact_version_missing" | "profile_feature_disabled";
export interface EvaluationReason { readonly code: EvaluationReasonCode; readonly subjectId: string; readonly message: string }
export interface ArtifactEvaluationResult { readonly satisfied: boolean; readonly snapshots: readonly ArtifactEvaluationSnapshot[]; readonly reasons: readonly EvaluationReason[] }
export interface AcceptanceEvaluation {
  readonly accepted: boolean;
  readonly reasons: readonly EvaluationReason[];
  readonly snapshot: MilestoneAcceptanceSnapshot;
}
export interface CompletionEvaluation { readonly completable: boolean; readonly reasons: readonly EvaluationReason[] }
export interface ProgressResult { readonly completedWeight: number; readonly totalWeight: number; readonly percentage: number }
export type DerivedMilestoneState = "open" | "accepted" | "completed";

export type MilestoneChange =
  | { readonly type: "created" }
  | { readonly type: "definition_changed" }
  | { readonly type: "criterion_changed"; readonly criterionId: CriterionId }
  | { readonly type: "deliverable_changed"; readonly deliverableRequirementId: DeliverableRequirementId }
  | { readonly type: "dependency_changed"; readonly dependencyId: DependencyId }
  | { readonly type: "challenge_changed"; readonly challengeId: ChallengeId }
  | { readonly type: "review_changed"; readonly reviewId: ReviewId }
  | { readonly type: "approval_recorded"; readonly approvalRecordId: ApprovalRecordId }
  | { readonly type: "approval_policy_changed"; readonly approvalStageId: ApprovalStageId }
  | { readonly type: "profile_changed"; readonly profile: MilestoneProfileRef }
  | { readonly type: "revised"; readonly revisionId: MilestoneRevisionId }
  | { readonly type: "accepted"; readonly acceptanceId: AcceptanceId }
  | { readonly type: "completed"; readonly completionId: CompletionId }
  | { readonly type: "reopened"; readonly effect: ReopenEffect };
export interface EvaluationInvalidation { readonly type: "acceptance" | "completion" | "criterion_verification" | "deliverable_satisfaction"; readonly ref: string; readonly reason: string }

interface EventBase<T extends string, P> {
  readonly id: MilestoneEventId; readonly type: T; readonly milestoneId: MilestoneId;
  readonly sequence: number; readonly revisionId: MilestoneRevisionId; readonly actor?: ActorRef;
  readonly occurredAt: string; readonly causationId?: MilestoneEventId; readonly correlationId?: string; readonly payload: P;
}
export type MilestoneCreatedEvent = EventBase<"milestone.created", { readonly profile: MilestoneProfileRef }>;
export type MilestoneRevisedEvent = EventBase<"milestone.revised", { readonly revisionId: MilestoneRevisionId; readonly previousRevisionId: MilestoneRevisionId; readonly reason?: string }>;
export type DefinitionChangedEvent = EventBase<"definition.changed", { readonly definition: MilestoneDefinition }>;
export type CriterionAddedEvent = EventBase<"criterion.added", { readonly criterion: Criterion }>;
export type CriterionChangedEvent = EventBase<"criterion.changed", { readonly criterionId: CriterionId; readonly state: CriterionState }>;
export type CriterionRemovedEvent = EventBase<"criterion.removed", { readonly criterionId: CriterionId }>;
export type DeliverableAddedEvent = EventBase<"deliverable.added", { readonly deliverable: DeliverableRequirement }>;
export type DeliverableChangedEvent = EventBase<"deliverable.changed", { readonly deliverableRequirementId: DeliverableRequirementId; readonly state: DeliverableRequirementState }>;
export type DeliverableRemovedEvent = EventBase<"deliverable.removed", { readonly deliverableRequirementId: DeliverableRequirementId }>;
export type DependencyAddedEvent = EventBase<"dependency.added", { readonly dependency: MilestoneDependency }>;
export type DependencyChangedEvent = EventBase<"dependency.changed", { readonly dependency: MilestoneDependency }>;
export type DependencyRemovedEvent = EventBase<"dependency.removed", { readonly dependencyId: DependencyId }>;
export type ChallengeRaisedEvent = EventBase<"challenge.raised", { readonly challenge: MilestoneChallenge }>;
export type ChallengeChangedEvent = EventBase<"challenge.changed", { readonly challengeId: ChallengeId; readonly state: ChallengeState }>;
export type ChallengeResolvedEvent = EventBase<"challenge.resolved", { readonly challengeId: ChallengeId; readonly resolution: ChallengeResolution }>;
export type ReviewRequestedEvent = EventBase<"review.requested", { readonly review: MilestoneReview }>;
export type ReviewChangedEvent = EventBase<"review.changed", { readonly reviewId: ReviewId; readonly state: ReviewState }>;
export type ReviewCompletedEvent = EventBase<"review.completed", { readonly reviewId: ReviewId; readonly result: ReviewResult }>;
export type ApprovalRecordedEvent = EventBase<"approval.recorded", { readonly record: ApprovalGrantedRecord | ApprovalRejectedRecord | ApprovalWaivedRecord }>;
export type ApprovalRevokedEvent = EventBase<"approval.revoked", { readonly record: ApprovalRevokedRecord }>;
export type ApprovalStageAddedEvent = EventBase<"approval_stage.added", { readonly stage: ApprovalStage }>;
export type ApprovalStageChangedEvent = EventBase<"approval_stage.changed", { readonly stage: ApprovalStage }>;
export type ApprovalStageRemovedEvent = EventBase<"approval_stage.removed", { readonly approvalStageId: ApprovalStageId }>;
export type ProfileChangedEvent = EventBase<"profile.changed", { readonly profile: MilestoneProfileRef }>;
export type MilestoneAcceptedEvent = EventBase<"milestone.accepted", { readonly acceptance: MilestoneAcceptance }>;
export type MilestoneCompletedEvent = EventBase<"milestone.completed", { readonly completion: MilestoneCompletion }>;
export type MilestoneReopenedEvent = EventBase<"milestone.reopened", { readonly effect: ReopenEffect; readonly reason: string; readonly cause?: ReopenCause }>;
export type MilestoneEvent = MilestoneCreatedEvent | MilestoneRevisedEvent | DefinitionChangedEvent | CriterionAddedEvent | CriterionChangedEvent | CriterionRemovedEvent | DeliverableAddedEvent | DeliverableChangedEvent | DeliverableRemovedEvent | DependencyAddedEvent | DependencyChangedEvent | DependencyRemovedEvent | ChallengeRaisedEvent | ChallengeChangedEvent | ChallengeResolvedEvent | ReviewRequestedEvent | ReviewChangedEvent | ReviewCompletedEvent | ApprovalRecordedEvent | ApprovalRevokedEvent | ApprovalStageAddedEvent | ApprovalStageChangedEvent | ApprovalStageRemovedEvent | ProfileChangedEvent | MilestoneAcceptedEvent | MilestoneCompletedEvent | MilestoneReopenedEvent;

export interface MilestoneEditResult {
  readonly milestone: Milestone;
  readonly changes: readonly MilestoneChange[];
  readonly events: readonly MilestoneEvent[];
  readonly revision?: MilestoneRevision;
  readonly invalidations?: readonly EvaluationInvalidation[];
  readonly affectedMilestoneIds?: readonly MilestoneId[];
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[];

export interface MilestoneWire extends Omit<Milestone, "criteria" | "deliverables" | "dependencies" | "challenges" | "reviews" | "approvalRecords" | "acceptanceRecords" | "completionRecords" | "revisions"> {
  readonly schemaVersion: "1.0";
  readonly criteria: readonly Criterion[];
  readonly deliverables: readonly DeliverableRequirement[];
  readonly dependencies: readonly MilestoneDependency[];
  readonly challenges: readonly MilestoneChallenge[];
  readonly reviews: readonly MilestoneReview[];
  readonly approvalRecords: readonly ApprovalRecord[];
  readonly acceptanceRecords: readonly MilestoneAcceptance[];
  readonly completionRecords: readonly MilestoneCompletion[];
  readonly revisions: readonly MilestoneRevision[];
}

export interface CreateMilestoneInput {
  readonly profile: MilestoneProfile;
  readonly definition: MilestoneDefinition;
  readonly criteria?: readonly Omit<Criterion, "id">[];
  readonly deliverables?: readonly Omit<DeliverableRequirement, "id">[];
  readonly dependencies?: readonly Omit<MilestoneDependency, "id" | "milestoneId">[];
  readonly approvalPolicy?: Omit<MilestoneApprovalPolicy, "stages"> & { readonly stages: readonly Omit<ApprovalStage, "id">[] };
  readonly actor?: ActorRef;
}
