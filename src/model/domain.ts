import type {
  Artifact,
  ArtifactId,
  ArtifactLink,
  ArtifactLinkId,
  ArtifactMetadata,
  ArtifactSubjectReference,
  ArtifactRequirement,
  ArtifactRequirementId,
  ArtifactSubmission,
  ArtifactSubmissionId,
  ArtifactVerification,
  ArtifactVerificationId,
  ArtifactVersion,
  ArtifactVersionId,
} from "@elqora/artifacts";
import type {
  AcceptanceId,
  ApprovalRecordId,
  ApprovalStageId,
  ChallengeEvidenceId,
  ChallengeId,
  CompletionId,
  CriterionId,
  DeliverableRequirementId,
  DependencyId,
  MilestoneEventId,
  MilestoneId,
  MilestoneProfileId,
  MilestoneRevisionId,
  ReviewId,
} from "./ids.js";
import type {
  ActorRef,
  ApprovalStage,
  ChallengeEvidenceKind,
  ChallengeEvidenceState,
  ChallengeResolutionOutcome,
  ChallengeState,
  CriterionState,
  DeliverableRequirementState,
  EvaluationInvalidation,
  EvaluationReason,
  ExecutionCriterion,
  ExecutionDeliverableRequirement,
  ExecutionSourceRole,
  JsonValue,
  ReopenEffect,
  ReviewResult,
  ReviewState,
} from "./execution.js";

export type { Brand } from "./ids.js";
export * from "./ids.js";
export * from "./execution.js";
export * from "./task.js";
export * from "./breakdown.js";

export interface MilestoneClock { now(): string }
export interface MilestoneIdGenerator {
  milestone(): MilestoneId;
  revision(): MilestoneRevisionId;
  criterion(): CriterionId;
  deliverableRequirement(): DeliverableRequirementId;
  dependency(): DependencyId;
  challenge(): ChallengeId;
  challengeEvidence(): ChallengeEvidenceId;
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

export type Criterion = ExecutionCriterion<MilestoneSourceLink>;
export type CriterionDefinitionSnapshot = Omit<Criterion, "state">;

export type DeliverableRequirement = ExecutionDeliverableRequirement<MilestoneSourceLink>;
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

export interface ChallengeResolution {
  readonly outcome: ChallengeResolutionOutcome;
  readonly summary?: string;
  readonly resolvedBy?: ActorRef;
  readonly resolvedAt: string;
  readonly sourceSnapshot?: readonly MilestoneSourceSnapshot[];
}

export interface ChallengeEvidence {
  readonly id: ChallengeEvidenceId;
  readonly milestoneId: MilestoneId;
  readonly challengeId: ChallengeId;
  readonly milestoneRevisionId: MilestoneRevisionId;
  readonly kind: ChallengeEvidenceKind;
  readonly title: string;
  readonly description: string;
  readonly state: ChallengeEvidenceState;
  readonly supersedesEvidenceId?: ChallengeEvidenceId;
  readonly createdBy?: ActorRef;
  readonly createdAt: string;
  readonly withdrawnBy?: ActorRef;
  readonly withdrawnAt?: string;
  readonly withdrawalReason?: string;
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
  /** Append-only audit material. Artifact sources are canonical Artifact Links, not embedded here. */
  readonly evidence: readonly ChallengeEvidence[];
  readonly sourceLinks?: readonly MilestoneSourceLink[];
}

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
  readonly sourceLinks?: readonly MilestoneSourceLink[];
  readonly sourceSnapshot?: readonly MilestoneSourceSnapshot[];
}

export interface MilestoneApprovalPolicy { readonly stages: readonly ApprovalStage[] }
export type ApprovalPolicySnapshot = MilestoneApprovalPolicy;

export interface ApprovalGrantedRecord {
  readonly id: ApprovalRecordId;
  readonly type: "granted";
  readonly milestoneId: MilestoneId;
  readonly milestoneRevisionId: MilestoneRevisionId;
  readonly stageId: ApprovalStageId;
  readonly actor: ActorRef;
  readonly createdAt: string;
}

export interface ApprovalRejectedRecord {
  readonly id: ApprovalRecordId;
  readonly type: "rejected";
  readonly milestoneId: MilestoneId;
  readonly milestoneRevisionId: MilestoneRevisionId;
  readonly stageId: ApprovalStageId;
  readonly actor: ActorRef;
  readonly reason?: string;
  readonly createdAt: string;
}

export interface ApprovalRevokedRecord {
  readonly id: ApprovalRecordId;
  readonly type: "revoked";
  readonly milestoneId: MilestoneId;
  readonly milestoneRevisionId: MilestoneRevisionId;
  readonly stageId: ApprovalStageId;
  readonly actor: ActorRef;
  readonly revokesApprovalId: ApprovalRecordId;
  readonly reason?: string;
  readonly createdAt: string;
}

export interface ApprovalWaivedRecord {
  readonly id: ApprovalRecordId;
  readonly type: "waived";
  readonly milestoneId: MilestoneId;
  readonly milestoneRevisionId: MilestoneRevisionId;
  readonly stageId: ApprovalStageId;
  readonly actor: ActorRef;
  readonly reason: string;
  readonly createdAt: string;
}

export type ApprovalRecord =
  | ApprovalGrantedRecord
  | ApprovalRejectedRecord
  | ApprovalRevokedRecord
  | ApprovalWaivedRecord;

export type MilestoneApprovalRecord = ApprovalRecord;

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
  readonly sources?: readonly MilestoneSourceSnapshot[];
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
  readonly sourceLinks?: readonly MilestoneSourceLink[];
  readonly snapshot: MilestoneRevisionSnapshot;
}

export type MilestoneArtifactSubjectType =
  | "milestone"
  | "milestone_revision"
  | "criterion"
  | "deliverable_requirement"
  | "challenge"
  | "challenge_evidence"
  | "review"
  | "approval"
  | "acceptance"
  | "completion";

export type MilestoneArtifactRole =
  | "reference"
  | "context"
  | "specification"
  | "decision"
  | "deliverable"
  | "evidence"
  | "verification"
  | "challenge_evidence"
  | "response_evidence"
  | "review_evidence"
  | "approval_evidence"
  | "acceptance_evidence"
  | "handover";

export type MilestoneArtifactLink = ArtifactLink<MilestoneArtifactRole, MilestoneArtifactSubjectType>;
export type MilestoneSourceSubjectType = "milestone" | "milestone_revision" | "criterion" | "deliverable_requirement" | "challenge" | "review";
export type MilestoneSourceRole = ExecutionSourceRole;
export type MilestoneSourceLink = ArtifactLink<MilestoneSourceRole, MilestoneSourceSubjectType>;

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

export interface MilestoneSourceSnapshot {
  readonly linkId: ArtifactLinkId;
  readonly artifactId: ArtifactId;
  readonly artifactVersionId?: ArtifactVersionId;
  readonly subject: ArtifactSubjectReference<MilestoneSourceSubjectType>;
  readonly role: MilestoneSourceRole;
  readonly note?: string;
  readonly metadata?: ArtifactMetadata;
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

export interface ChallengeEvidenceSource {
  readonly linkId: import("@elqora/artifacts").ArtifactLinkId;
  readonly role: "challenge_evidence" | "response_evidence";
  readonly artifactId: ArtifactId;
  readonly artifactVersionId: ArtifactVersionId;
}

export type ChallengeEvidenceSourceIssueCode =
  | "evidence_source_role_mismatch"
  | "evidence_source_unpinned"
  | "evidence_source_artifact_missing"
  | "evidence_source_version_missing";

export interface ChallengeEvidenceSourceIssue {
  readonly code: ChallengeEvidenceSourceIssueCode;
  readonly linkId: import("@elqora/artifacts").ArtifactLinkId;
  readonly message: string;
}

export interface ChallengeEvidenceSourceResolution {
  readonly evidenceId: ChallengeEvidenceId;
  readonly status: "pending" | "resolved" | "invalid";
  readonly sources: readonly ChallengeEvidenceSource[];
  readonly issues: readonly ChallengeEvidenceSourceIssue[];
}

export interface ChallengeEvidenceAcceptanceSnapshot {
  readonly id: ChallengeEvidenceId;
  readonly kind: ChallengeEvidenceKind;
  readonly title: string;
  readonly description: string;
  readonly state: ChallengeEvidenceState;
  readonly supersedesEvidenceId?: ChallengeEvidenceId;
  readonly sourceStatus: ChallengeEvidenceSourceResolution["status"];
  readonly sources: readonly ChallengeEvidenceSource[];
}

export interface ChallengeAcceptanceSnapshot {
  readonly id: ChallengeId;
  readonly target: ChallengeTarget;
  readonly severity: "non_blocking" | "blocking";
  readonly state: ChallengeState;
  readonly resolution?: ChallengeResolution;
  readonly blocking: boolean;
  readonly evidence: readonly ChallengeEvidenceAcceptanceSnapshot[];
}

export interface ReviewAcceptanceSnapshot {
  readonly id: ReviewId;
  readonly milestoneRevisionId: MilestoneRevisionId;
  readonly state: ReviewState;
  readonly result?: ReviewResult;
  readonly artifactVersionIds: readonly ArtifactVersionId[];
  readonly satisfied: boolean;
}

export interface ApprovalAcceptanceSnapshot {
  readonly stageId: ApprovalStageId;
  readonly milestoneRevisionId: MilestoneRevisionId;
  readonly effectiveApprovalCount: number;
  readonly requiredApprovalCount: number;
  readonly satisfied: boolean;
  readonly waived: boolean;
  readonly actorIds: readonly string[];
}

export interface MilestoneAcceptanceSnapshot {
  readonly revisionId: MilestoneRevisionId;
  readonly criteria: readonly CriterionAcceptanceSnapshot[];
  readonly deliverables: readonly DeliverableAcceptanceSnapshot[];
  readonly dependencies: readonly DependencyAcceptanceSnapshot[];
  readonly challenges: readonly ChallengeAcceptanceSnapshot[];
  readonly reviews: readonly ReviewAcceptanceSnapshot[];
  readonly approvals: readonly ApprovalAcceptanceSnapshot[];
  readonly artifacts: readonly ArtifactEvaluationSnapshot[];
  readonly sources?: readonly MilestoneSourceSnapshot[];
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
  readonly sourceLinks?: readonly MilestoneSourceLink[];
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

export type ReopenCause =
  | { readonly type: "administrative" }
  | { readonly type: "revision"; readonly revisionId: MilestoneRevisionId }
  | { readonly type: "challenge"; readonly challengeId: ChallengeId }
  | { readonly type: "approval_revocation"; readonly approvalRecordId: ApprovalRecordId }
  | { readonly type: "dependency_invalidation"; readonly dependencyId: DependencyId }
  | { readonly type: "artifact_invalidation"; readonly ref: string }
  | { readonly type: "host_requested"; readonly ref?: string };
export interface ReopenRequest { readonly effect: ReopenEffect; readonly reason: string; readonly actor?: ActorRef; readonly cause?: ReopenCause }

export interface ArtifactEvaluationResult { readonly satisfied: boolean; readonly snapshots: readonly ArtifactEvaluationSnapshot[]; readonly reasons: readonly EvaluationReason[] }
export interface AcceptanceEvaluation {
  readonly accepted: boolean;
  readonly reasons: readonly EvaluationReason[];
  readonly snapshot: MilestoneAcceptanceSnapshot;
}
export interface CompletionEvaluation { readonly completable: boolean; readonly reasons: readonly EvaluationReason[] }
export type DerivedMilestoneState = "open" | "accepted" | "completed";

export type MilestoneChange =
  | { readonly type: "created" }
  | { readonly type: "definition_changed" }
  | { readonly type: "source_changed"; readonly linkId: ArtifactLinkId }
  | { readonly type: "criterion_changed"; readonly criterionId: CriterionId }
  | { readonly type: "deliverable_changed"; readonly deliverableRequirementId: DeliverableRequirementId }
  | { readonly type: "dependency_changed"; readonly dependencyId: DependencyId }
  | { readonly type: "challenge_changed"; readonly challengeId: ChallengeId }
  | { readonly type: "challenge_evidence_changed"; readonly challengeId: ChallengeId; readonly challengeEvidenceId: ChallengeEvidenceId }
  | { readonly type: "review_changed"; readonly reviewId: ReviewId }
  | { readonly type: "approval_recorded"; readonly approvalRecordId: ApprovalRecordId }
  | { readonly type: "approval_policy_changed"; readonly approvalStageId: ApprovalStageId }
  | { readonly type: "profile_changed"; readonly profile: MilestoneProfileRef }
  | { readonly type: "revised"; readonly revisionId: MilestoneRevisionId }
  | { readonly type: "accepted"; readonly acceptanceId: AcceptanceId }
  | { readonly type: "completed"; readonly completionId: CompletionId }
  | { readonly type: "reopened"; readonly effect: ReopenEffect };

interface EventBase<T extends string, P> {
  readonly id: MilestoneEventId; readonly type: T; readonly milestoneId: MilestoneId;
  readonly sequence: number; readonly revisionId: MilestoneRevisionId; readonly actor?: ActorRef;
  readonly occurredAt: string; readonly causationId?: MilestoneEventId; readonly correlationId?: string; readonly payload: P;
}
export type MilestoneCreatedEvent = EventBase<"milestone.created", { readonly profile: MilestoneProfileRef }>;
export type SourceAttachedEvent = EventBase<"source.attached", { readonly source: MilestoneSourceLink }>;
export type SourceDetachedEvent = EventBase<"source.detached", { readonly linkId: ArtifactLinkId; readonly subject: ArtifactSubjectReference<MilestoneSourceSubjectType> }>;
export type SourceReplacedEvent = EventBase<"source.replaced", { readonly previousLinkId: ArtifactLinkId; readonly source: MilestoneSourceLink }>;
export type SourceRoleChangedEvent = EventBase<"source.role_changed", { readonly linkId: ArtifactLinkId; readonly previousRole: MilestoneSourceRole; readonly role: MilestoneSourceRole }>;
export type SourceChangedEvent = EventBase<"source.changed", { readonly source: MilestoneSourceLink; readonly changed: readonly ("note" | "metadata" | "artifact_version")[] }>;
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
export type ChallengeEvidenceAddedEvent = EventBase<"challenge.evidence_added", { readonly evidence: ChallengeEvidence }>;
export type ChallengeEvidenceSupersededEvent = EventBase<"challenge.evidence_superseded", { readonly previousEvidenceId: ChallengeEvidenceId; readonly evidence: ChallengeEvidence }>;
export type ChallengeEvidenceWithdrawnEvent = EventBase<"challenge.evidence_withdrawn", { readonly challengeId: ChallengeId; readonly challengeEvidenceId: ChallengeEvidenceId; readonly reason: string }>;
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
export type MilestoneEvent = MilestoneCreatedEvent | SourceAttachedEvent | SourceDetachedEvent | SourceReplacedEvent | SourceRoleChangedEvent | SourceChangedEvent | MilestoneRevisedEvent | DefinitionChangedEvent | CriterionAddedEvent | CriterionChangedEvent | CriterionRemovedEvent | DeliverableAddedEvent | DeliverableChangedEvent | DeliverableRemovedEvent | DependencyAddedEvent | DependencyChangedEvent | DependencyRemovedEvent | ChallengeRaisedEvent | ChallengeChangedEvent | ChallengeResolvedEvent | ChallengeEvidenceAddedEvent | ChallengeEvidenceSupersededEvent | ChallengeEvidenceWithdrawnEvent | ReviewRequestedEvent | ReviewChangedEvent | ReviewCompletedEvent | ApprovalRecordedEvent | ApprovalRevokedEvent | ApprovalStageAddedEvent | ApprovalStageChangedEvent | ApprovalStageRemovedEvent | ProfileChangedEvent | MilestoneAcceptedEvent | MilestoneCompletedEvent | MilestoneReopenedEvent;

export interface MilestoneEditResult {
  readonly milestone: Milestone;
  readonly changes: readonly MilestoneChange[];
  readonly events: readonly MilestoneEvent[];
  readonly revision?: MilestoneRevision;
  readonly invalidations?: readonly EvaluationInvalidation[];
  readonly affectedMilestoneIds?: readonly MilestoneId[];
}

export interface MilestoneWire extends Omit<Milestone, "criteria" | "deliverables" | "dependencies" | "challenges" | "reviews" | "approvalRecords" | "acceptanceRecords" | "completionRecords" | "revisions"> {
  readonly schemaVersion: "1.2";
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
