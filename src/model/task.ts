import type {
  Artifact,
  ArtifactId,
  ArtifactLink,
  ArtifactLinkId,
  ArtifactMetadata,
  ArtifactRequirement,
  ArtifactRequirementId,
  ArtifactSubjectReference,
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
  BreakdownId,
  ChallengeEvidenceId,
  ChallengeId,
  CompletionId,
  CriterionId,
  DeliverableRequirementId,
  DependencyId,
  MilestoneId,
  TaskEventId,
  TaskId,
  TaskProfileId,
  TaskReminderId,
  TaskRevisionId,
  ReviewId,
} from "./ids.js";
import type {
  ActorRef,
  ApprovalStage,
  ChallengeEvidenceKind,
  ChallengeEvidenceState,
  ChallengeResolutionOutcome,
  ChallengeState,
  EvaluationInvalidation,
  EvaluationReason,
  ExecutionCriterion,
  ExecutionDeliverableRequirement,
  ExecutionSourceRole,
  JsonValue,
  ReopenCause,
  ReopenEffect,
  ReviewResult,
  ReviewState,
} from "./domain.js";

export interface TaskClock {
  now(): string;
}

export interface TaskIdGenerator {
  task(): TaskId;
  revision(): TaskRevisionId;
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
  reminder(): TaskReminderId;
  event(): TaskEventId;
}

export interface TaskProfileRef {
  readonly id: TaskProfileId;
  readonly version: number;
}

export interface TaskProfile {
  readonly ref: TaskProfileRef;
  readonly criteria: { readonly enabled: boolean };
  readonly deliverables: { readonly enabled: boolean };
  readonly dependencies: { readonly enabled: boolean; readonly participatesInGraph: boolean };
  readonly revisions: { readonly enabled: boolean };
  readonly challenges: { readonly enabled: boolean };
  readonly reviews: { readonly enabled: boolean; readonly required: boolean };
  readonly approvals: { readonly enabled: boolean; readonly required: boolean };
  readonly completion: {
    readonly enabled: boolean;
    readonly requiresAcceptance: boolean;
    readonly closeImmediatelyOnAcceptance: boolean;
  };
}

export interface TaskDefinition {
  readonly title: string;
  readonly description?: string;
  readonly key?: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export type TaskScope =
  | {
      readonly type: "project";
      /** Opaque host-owned Project identity. The SDK stores but does not resolve it. */
      readonly projectId: string;
    }
  | {
      readonly type: "milestone";
      readonly milestoneId: MilestoneId;
    }
  | {
      readonly type: "breakdown";
      readonly breakdownId: BreakdownId;
    }
  | {
      readonly type: "task";
      readonly taskId: TaskId;
    };

export interface TaskTiming {
  readonly startsAt?: string;
  readonly dueAt?: string;
  /** Optional IANA timezone for human scheduling. */
  readonly timeZone?: string;
}

export type TaskReminderTrigger =
  | { readonly type: "at"; readonly at: string }
  | { readonly type: "before_due"; readonly duration: string }
  | { readonly type: "after_start"; readonly duration: string };

export interface TaskReminder {
  readonly id: TaskReminderId;
  readonly trigger: TaskReminderTrigger;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export type TaskSourceSubjectType =
  | "task"
  | "task_revision"
  | "criterion"
  | "deliverable_requirement"
  | "challenge"
  | "review";

export type TaskSourceRole = ExecutionSourceRole;
export type TaskSourceLink = ArtifactLink<TaskSourceRole, TaskSourceSubjectType>;

export interface TaskSourceSnapshot {
  readonly linkId: ArtifactLinkId;
  readonly artifactId: ArtifactId;
  readonly artifactVersionId?: ArtifactVersionId;
  readonly subject: ArtifactSubjectReference<TaskSourceSubjectType>;
  readonly role: TaskSourceRole;
  readonly note?: string;
  readonly metadata?: ArtifactMetadata;
}

export type TaskCriterion = ExecutionCriterion<TaskSourceLink>;
export type TaskDeliverableRequirement = ExecutionDeliverableRequirement<TaskSourceLink>;

export type ExecutionSubjectRef =
  | { readonly type: "milestone"; readonly id: MilestoneId }
  | { readonly type: "task"; readonly id: TaskId };

export type TaskDependencyGate =
  | { readonly type: "accepted" }
  | { readonly type: "completed" }
  | { readonly type: "criterion"; readonly criterionId: CriterionId; readonly requiredState: "verified" }
  | { readonly type: "deliverable"; readonly deliverableRequirementId: DeliverableRequirementId; readonly requiredState: "satisfied" };

export interface TaskDependency {
  readonly id: DependencyId;
  readonly taskId: TaskId;
  readonly dependsOn: ExecutionSubjectRef;
  readonly gate: TaskDependencyGate;
  readonly blocking: boolean;
}
export type TaskDependencyDefinitionSnapshot = TaskDependency;

export type TaskChallengeTarget =
  | { readonly type: "task" }
  | { readonly type: "criterion"; readonly criterionId: CriterionId }
  | { readonly type: "deliverable_requirement"; readonly deliverableRequirementId: DeliverableRequirementId }
  | { readonly type: "review"; readonly reviewId: ReviewId }
  | { readonly type: "artifact"; readonly artifactId: ArtifactId; readonly artifactVersionId?: ArtifactVersionId }
  | { readonly type: "evidence"; readonly ref: string };

export interface TaskChallengeResolution {
  readonly outcome: ChallengeResolutionOutcome;
  readonly summary?: string;
  readonly resolvedBy?: ActorRef;
  readonly resolvedAt: string;
  readonly sourceSnapshot?: readonly TaskSourceSnapshot[];
}

export interface TaskChallengeEvidence {
  readonly id: ChallengeEvidenceId;
  readonly taskId: TaskId;
  readonly challengeId: ChallengeId;
  readonly taskRevisionId: TaskRevisionId;
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

export interface TaskChallenge {
  readonly id: ChallengeId;
  readonly taskId: TaskId;
  readonly taskRevisionId: TaskRevisionId;
  readonly target: TaskChallengeTarget;
  readonly reason: string;
  readonly severity: "non_blocking" | "blocking";
  readonly state: ChallengeState;
  readonly raisedBy?: ActorRef;
  readonly createdAt: string;
  readonly resolution?: TaskChallengeResolution;
  readonly evidence: readonly TaskChallengeEvidence[];
  readonly sourceLinks?: readonly TaskSourceLink[];
}

export interface TaskReview {
  readonly id: ReviewId;
  readonly taskId: TaskId;
  readonly taskRevisionId: TaskRevisionId;
  readonly requestedBy?: ActorRef;
  readonly assignedReviewer?: ActorRef;
  readonly completedBy?: ActorRef;
  readonly state: ReviewState;
  readonly result?: ReviewResult;
  readonly summary?: string;
  readonly createdAt: string;
  readonly completedAt?: string;
  readonly artifactVersionIds?: readonly ArtifactVersionId[];
  readonly sourceLinks?: readonly TaskSourceLink[];
  readonly sourceSnapshot?: readonly TaskSourceSnapshot[];
}

export interface TaskApprovalPolicy {
  readonly stages: readonly ApprovalStage[];
}

export interface TaskApprovalGrantedRecord {
  readonly id: ApprovalRecordId;
  readonly type: "granted";
  readonly taskId: TaskId;
  readonly taskRevisionId: TaskRevisionId;
  readonly stageId: ApprovalStageId;
  readonly actor: ActorRef;
  readonly createdAt: string;
}

export interface TaskApprovalRejectedRecord {
  readonly id: ApprovalRecordId;
  readonly type: "rejected";
  readonly taskId: TaskId;
  readonly taskRevisionId: TaskRevisionId;
  readonly stageId: ApprovalStageId;
  readonly actor: ActorRef;
  readonly reason?: string;
  readonly createdAt: string;
}

export interface TaskApprovalRevokedRecord {
  readonly id: ApprovalRecordId;
  readonly type: "revoked";
  readonly taskId: TaskId;
  readonly taskRevisionId: TaskRevisionId;
  readonly stageId: ApprovalStageId;
  readonly actor: ActorRef;
  readonly revokesApprovalId: ApprovalRecordId;
  readonly reason?: string;
  readonly createdAt: string;
}

export interface TaskApprovalWaivedRecord {
  readonly id: ApprovalRecordId;
  readonly type: "waived";
  readonly taskId: TaskId;
  readonly taskRevisionId: TaskRevisionId;
  readonly stageId: ApprovalStageId;
  readonly actor: ActorRef;
  readonly reason: string;
  readonly createdAt: string;
}

export type TaskApprovalRecord =
  | TaskApprovalGrantedRecord
  | TaskApprovalRejectedRecord
  | TaskApprovalRevokedRecord
  | TaskApprovalWaivedRecord;

export interface TaskEvaluationPolicySnapshot {
  readonly requiredCriteriaMustBeVerified: boolean;
  readonly requiredDeliverablesMustBeSatisfied: boolean;
  readonly waivedCriteriaSatisfyRequired: boolean;
  readonly waivedDeliverablesSatisfyRequired: boolean;
  readonly blockingChallengesPreventAcceptance: boolean;
  readonly requiredReviewResult: "accepted";
  readonly requireReviewWhenProfileRequires: boolean;
  readonly requireApprovalsWhenProfileRequires: boolean;
  readonly requiresAcceptance: boolean;
  readonly completionRequiresCurrentAcceptance: boolean;
  readonly closeImmediatelyOnAcceptance: boolean;
}

export type TaskCriterionDefinitionSnapshot = Omit<TaskCriterion, "state">;
export type TaskDeliverableDefinitionSnapshot = Omit<TaskDeliverableRequirement, "state">;

export interface TaskRevisionSnapshot {
  readonly profile: TaskProfileRef;
  readonly evaluationPolicy: TaskEvaluationPolicySnapshot;
  readonly definition: TaskDefinition;
  readonly criteria: readonly TaskCriterionDefinitionSnapshot[];
  readonly deliverables: readonly TaskDeliverableDefinitionSnapshot[];
  readonly dependencies: readonly TaskDependencyDefinitionSnapshot[];
  readonly sources?: readonly TaskSourceSnapshot[];
  readonly approvalPolicy?: TaskApprovalPolicy;
  readonly timing?: TaskTiming;
}

export interface TaskRevision {
  readonly id: TaskRevisionId;
  readonly taskId: TaskId;
  readonly number: number;
  readonly previousRevisionId?: TaskRevisionId;
  readonly reason?: string;
  readonly actor?: ActorRef;
  readonly createdAt: string;
  readonly sourceLinks?: readonly TaskSourceLink[];
  readonly snapshot: TaskRevisionSnapshot;
}

export type TaskArtifactSubjectType =
  | "task"
  | "task_revision"
  | "criterion"
  | "deliverable_requirement"
  | "challenge"
  | "challenge_evidence"
  | "review"
  | "approval"
  | "acceptance"
  | "completion";

export type TaskArtifactRole =
  | "reference"
  | "context"
  | "specification"
  | "decision"
  | "provenance"
  | "audit"
  | "deliverable"
  | "evidence"
  | "verification"
  | "challenge_evidence"
  | "response_evidence"
  | "review_evidence"
  | "approval_evidence"
  | "acceptance_evidence"
  | "handover";

export type TaskArtifactLink = ArtifactLink<TaskArtifactRole, TaskArtifactSubjectType>;

export interface TaskArtifactContext {
  readonly requirements: ReadonlyMap<ArtifactRequirementId, ArtifactRequirement>;
  readonly artifacts: ReadonlyMap<ArtifactId, Artifact>;
  readonly versions: ReadonlyMap<ArtifactVersionId, ArtifactVersion>;
  readonly submissions: ReadonlyMap<ArtifactSubmissionId, ArtifactSubmission>;
  readonly verifications: ReadonlyMap<ArtifactVerificationId, ArtifactVerification>;
  readonly links: readonly TaskArtifactLink[];
}

export interface TaskDependencyAcceptanceSnapshot {
  readonly id: DependencyId;
  readonly dependsOn: ExecutionSubjectRef;
  readonly gate: TaskDependencyGate;
  readonly blocking: boolean;
  readonly satisfied: boolean;
}

export interface TaskChallengeAcceptanceSnapshot {
  readonly id: ChallengeId;
  readonly target: TaskChallengeTarget;
  readonly severity: "non_blocking" | "blocking";
  readonly state: ChallengeState;
  readonly resolution?: TaskChallengeResolution;
  readonly blocking: boolean;
  readonly evidence: readonly import("./domain.js").ChallengeEvidenceAcceptanceSnapshot[];
}

export interface TaskReviewAcceptanceSnapshot {
  readonly id: ReviewId;
  readonly taskRevisionId: TaskRevisionId;
  readonly state: ReviewState;
  readonly result?: ReviewResult;
  readonly artifactVersionIds: readonly ArtifactVersionId[];
  readonly satisfied: boolean;
}

export interface TaskApprovalAcceptanceSnapshot {
  readonly stageId: ApprovalStageId;
  readonly taskRevisionId: TaskRevisionId;
  readonly effectiveApprovalCount: number;
  readonly requiredApprovalCount: number;
  readonly satisfied: boolean;
  readonly waived: boolean;
  readonly actorIds: readonly string[];
}

export interface TaskAcceptanceSnapshot {
  readonly revisionId: TaskRevisionId;
  readonly criteria: readonly import("./domain.js").CriterionAcceptanceSnapshot[];
  readonly deliverables: readonly import("./domain.js").DeliverableAcceptanceSnapshot[];
  readonly dependencies: readonly TaskDependencyAcceptanceSnapshot[];
  readonly challenges: readonly TaskChallengeAcceptanceSnapshot[];
  readonly reviews: readonly TaskReviewAcceptanceSnapshot[];
  readonly approvals: readonly TaskApprovalAcceptanceSnapshot[];
  readonly artifacts: readonly import("./domain.js").ArtifactEvaluationSnapshot[];
  readonly sources?: readonly TaskSourceSnapshot[];
}

export interface TaskAcceptance {
  readonly id: AcceptanceId;
  readonly taskId: TaskId;
  readonly taskRevisionId: TaskRevisionId;
  readonly acceptedAt: string;
  readonly actor?: ActorRef;
  readonly snapshot: TaskAcceptanceSnapshot;
}

export interface TaskCompletion {
  readonly id: CompletionId;
  readonly taskId: TaskId;
  readonly taskRevisionId: TaskRevisionId;
  readonly acceptanceId?: AcceptanceId;
  readonly completedAt: string;
  readonly actor?: ActorRef;
  readonly reason?: string;
}

export interface Task {
  readonly id: TaskId;
  readonly scope: TaskScope;
  readonly profile: TaskProfileRef;
  readonly currentRevisionId: TaskRevisionId;
  readonly revisions: readonly TaskRevision[];
  readonly definition: TaskDefinition;
  readonly sourceLinks?: readonly TaskSourceLink[];
  readonly criteria: readonly TaskCriterion[];
  readonly deliverables: readonly TaskDeliverableRequirement[];
  readonly dependencies: readonly TaskDependency[];
  readonly challenges: readonly TaskChallenge[];
  readonly reviews: readonly TaskReview[];
  readonly approvalPolicy?: TaskApprovalPolicy;
  readonly approvalRecords: readonly TaskApprovalRecord[];
  readonly acceptanceRecords: readonly TaskAcceptance[];
  readonly currentAcceptanceId?: AcceptanceId;
  readonly completionRecords: readonly TaskCompletion[];
  readonly currentCompletionId?: CompletionId;
  readonly timing?: TaskTiming;
  readonly reminders: readonly TaskReminder[];
  readonly sequence: number;
  readonly createdAt: string;
  readonly updatedAt?: string;
}

export type DerivedTaskState = "open" | "accepted" | "completed";

export interface TaskAcceptanceEvaluation {
  readonly accepted: boolean;
  readonly reasons: readonly EvaluationReason[];
  readonly snapshot: TaskAcceptanceSnapshot;
}

export interface TaskCompletionEvaluation {
  readonly completable: boolean;
  readonly reasons: readonly EvaluationReason[];
}

export type TaskChange =
  | { readonly type: "created" }
  | { readonly type: "definition_changed" }
  | { readonly type: "scope_changed" }
  | { readonly type: "timing_changed" }
  | { readonly type: "reminder_added"; readonly reminderId: TaskReminderId }
  | { readonly type: "reminder_updated"; readonly reminderId: TaskReminderId }
  | { readonly type: "reminder_removed"; readonly reminderId: TaskReminderId }
  | { readonly type: "source_changed"; readonly linkId: ArtifactLinkId }
  | { readonly type: "criterion_changed"; readonly criterionId: CriterionId }
  | { readonly type: "deliverable_changed"; readonly deliverableRequirementId: DeliverableRequirementId }
  | { readonly type: "dependency_changed"; readonly dependencyId: DependencyId }
  | { readonly type: "challenge_changed"; readonly challengeId: ChallengeId }
  | { readonly type: "challenge_evidence_changed"; readonly challengeId: ChallengeId; readonly challengeEvidenceId: ChallengeEvidenceId }
  | { readonly type: "review_changed"; readonly reviewId: ReviewId }
  | { readonly type: "approval_recorded"; readonly approvalRecordId: ApprovalRecordId }
  | { readonly type: "approval_policy_changed"; readonly approvalStageId: ApprovalStageId }
  | { readonly type: "profile_changed"; readonly profile: TaskProfileRef }
  | { readonly type: "revised"; readonly revisionId: TaskRevisionId }
  | { readonly type: "accepted"; readonly acceptanceId: AcceptanceId }
  | { readonly type: "completed"; readonly completionId: CompletionId }
  | { readonly type: "reopened"; readonly effect: ReopenEffect };

interface TaskEventBase<T extends string, P> {
  readonly id: TaskEventId;
  readonly type: T;
  readonly taskId: TaskId;
  readonly sequence: number;
  readonly revisionId: TaskRevisionId;
  readonly actor?: ActorRef;
  readonly occurredAt: string;
  readonly causationId?: TaskEventId;
  readonly correlationId?: string;
  readonly payload: P;
}

export type TaskCreatedEvent = TaskEventBase<"task.created", { readonly profile: TaskProfileRef; readonly scope: TaskScope }>;
export type TaskDefinitionChangedEvent = TaskEventBase<"task.definition_changed", { readonly definition: TaskDefinition }>;
export type TaskTimingChangedEvent = TaskEventBase<"task.timing_changed", { readonly timing?: TaskTiming }>;
export type TaskReminderAddedEvent = TaskEventBase<"task.reminder_added", { readonly reminder: TaskReminder }>;
export type TaskReminderUpdatedEvent = TaskEventBase<"task.reminder_updated", { readonly reminder: TaskReminder }>;
export type TaskReminderRemovedEvent = TaskEventBase<"task.reminder_removed", { readonly reminderId: TaskReminderId }>;
export type TaskSourceAttachedEvent = TaskEventBase<"task.source_attached", { readonly source: TaskSourceLink }>;
export type TaskSourceDetachedEvent = TaskEventBase<"task.source_detached", { readonly linkId: ArtifactLinkId; readonly subject: ArtifactSubjectReference<TaskSourceSubjectType> }>;
export type TaskSourceReplacedEvent = TaskEventBase<"task.source_replaced", { readonly previousLinkId: ArtifactLinkId; readonly source: TaskSourceLink }>;
export type TaskSourceRoleChangedEvent = TaskEventBase<"task.source_role_changed", { readonly linkId: ArtifactLinkId; readonly previousRole: TaskSourceRole; readonly role: TaskSourceRole }>;
export type TaskSourceChangedEvent = TaskEventBase<"task.source_changed", { readonly source: TaskSourceLink; readonly changed: readonly ("note" | "metadata" | "artifact_version")[] }>;
export type TaskRevisedEvent = TaskEventBase<"task.revised", { readonly revisionId: TaskRevisionId; readonly previousRevisionId: TaskRevisionId; readonly reason?: string }>;
export type TaskCriterionAddedEvent = TaskEventBase<"task.criterion_added", { readonly criterion: TaskCriterion }>;
export type TaskCriterionChangedEvent = TaskEventBase<"task.criterion_changed", { readonly criterionId: CriterionId; readonly state: import("./domain.js").CriterionState }>;
export type TaskCriterionRemovedEvent = TaskEventBase<"task.criterion_removed", { readonly criterionId: CriterionId }>;
export type TaskDeliverableAddedEvent = TaskEventBase<"task.deliverable_added", { readonly deliverable: TaskDeliverableRequirement }>;
export type TaskDeliverableChangedEvent = TaskEventBase<"task.deliverable_changed", { readonly deliverableRequirementId: DeliverableRequirementId; readonly state: import("./domain.js").DeliverableRequirementState }>;
export type TaskDeliverableRemovedEvent = TaskEventBase<"task.deliverable_removed", { readonly deliverableRequirementId: DeliverableRequirementId }>;
export type TaskDependencyAddedEvent = TaskEventBase<"task.dependency_added", { readonly dependency: TaskDependency }>;
export type TaskDependencyChangedEvent = TaskEventBase<"task.dependency_changed", { readonly dependency: TaskDependency }>;
export type TaskDependencyRemovedEvent = TaskEventBase<"task.dependency_removed", { readonly dependencyId: DependencyId }>;
export type TaskChallengeRaisedEvent = TaskEventBase<"task.challenge_raised", { readonly challenge: TaskChallenge }>;
export type TaskChallengeChangedEvent = TaskEventBase<"task.challenge_changed", { readonly challengeId: ChallengeId; readonly state: ChallengeState }>;
export type TaskChallengeResolvedEvent = TaskEventBase<"task.challenge_resolved", { readonly challengeId: ChallengeId; readonly resolution: TaskChallengeResolution }>;
export type TaskChallengeEvidenceAddedEvent = TaskEventBase<"task.challenge_evidence_added", { readonly evidence: TaskChallengeEvidence }>;
export type TaskChallengeEvidenceSupersededEvent = TaskEventBase<"task.challenge_evidence_superseded", { readonly previousEvidenceId: ChallengeEvidenceId; readonly evidence: TaskChallengeEvidence }>;
export type TaskChallengeEvidenceWithdrawnEvent = TaskEventBase<"task.challenge_evidence_withdrawn", { readonly challengeId: ChallengeId; readonly challengeEvidenceId: ChallengeEvidenceId; readonly reason: string }>;
export type TaskReviewRequestedEvent = TaskEventBase<"task.review_requested", { readonly review: TaskReview }>;
export type TaskReviewChangedEvent = TaskEventBase<"task.review_changed", { readonly reviewId: ReviewId; readonly state: ReviewState }>;
export type TaskReviewCompletedEvent = TaskEventBase<"task.review_completed", { readonly reviewId: ReviewId; readonly result: ReviewResult }>;
export type TaskApprovalRecordedEvent = TaskEventBase<"task.approval_recorded", { readonly record: TaskApprovalRecord }>;
export type TaskApprovalRevokedEvent = TaskEventBase<"task.approval_revoked", { readonly record: TaskApprovalRevokedRecord }>;
export type TaskApprovalStageAddedEvent = TaskEventBase<"task.approval_stage_added", { readonly stage: ApprovalStage }>;
export type TaskApprovalStageChangedEvent = TaskEventBase<"task.approval_stage_changed", { readonly stage: ApprovalStage }>;
export type TaskApprovalStageRemovedEvent = TaskEventBase<"task.approval_stage_removed", { readonly approvalStageId: ApprovalStageId }>;
export type TaskProfileChangedEvent = TaskEventBase<"task.profile_changed", { readonly profile: TaskProfileRef }>;
export type TaskAcceptedEvent = TaskEventBase<"task.accepted", { readonly acceptance: TaskAcceptance }>;
export type TaskCompletedEvent = TaskEventBase<"task.completed", { readonly completion: TaskCompletion }>;
export type TaskReopenedEvent = TaskEventBase<"task.reopened", { readonly effect: ReopenEffect; readonly reason: string; readonly cause?: ReopenCause }>;

export type TaskEvent =
  | TaskCreatedEvent
  | TaskDefinitionChangedEvent
  | TaskTimingChangedEvent
  | TaskReminderAddedEvent
  | TaskReminderUpdatedEvent
  | TaskReminderRemovedEvent
  | TaskSourceAttachedEvent
  | TaskSourceDetachedEvent
  | TaskSourceReplacedEvent
  | TaskSourceRoleChangedEvent
  | TaskSourceChangedEvent
  | TaskRevisedEvent
  | TaskCriterionAddedEvent
  | TaskCriterionChangedEvent
  | TaskCriterionRemovedEvent
  | TaskDeliverableAddedEvent
  | TaskDeliverableChangedEvent
  | TaskDeliverableRemovedEvent
  | TaskDependencyAddedEvent
  | TaskDependencyChangedEvent
  | TaskDependencyRemovedEvent
  | TaskChallengeRaisedEvent
  | TaskChallengeChangedEvent
  | TaskChallengeResolvedEvent
  | TaskChallengeEvidenceAddedEvent
  | TaskChallengeEvidenceSupersededEvent
  | TaskChallengeEvidenceWithdrawnEvent
  | TaskReviewRequestedEvent
  | TaskReviewChangedEvent
  | TaskReviewCompletedEvent
  | TaskApprovalRecordedEvent
  | TaskApprovalRevokedEvent
  | TaskApprovalStageAddedEvent
  | TaskApprovalStageChangedEvent
  | TaskApprovalStageRemovedEvent
  | TaskProfileChangedEvent
  | TaskAcceptedEvent
  | TaskCompletedEvent
  | TaskReopenedEvent;

export interface TaskEditResult {
  readonly task: Task;
  readonly changes: readonly TaskChange[];
  readonly events: readonly TaskEvent[];
  readonly revision?: TaskRevision;
  readonly invalidations?: readonly EvaluationInvalidation[];
  readonly affectedTaskIds?: readonly TaskId[];
}

export interface TaskWire extends Omit<Task, "criteria" | "deliverables" | "dependencies" | "challenges" | "reviews" | "approvalRecords" | "acceptanceRecords" | "completionRecords" | "revisions"> {
  readonly schemaVersion: "1.0";
  readonly criteria: readonly TaskCriterion[];
  readonly deliverables: readonly TaskDeliverableRequirement[];
  readonly dependencies: readonly TaskDependency[];
  readonly challenges: readonly TaskChallenge[];
  readonly reviews: readonly TaskReview[];
  readonly approvalRecords: readonly TaskApprovalRecord[];
  readonly acceptanceRecords: readonly TaskAcceptance[];
  readonly completionRecords: readonly TaskCompletion[];
  readonly revisions: readonly TaskRevision[];
}

export interface CreateTaskDependencyInput {
  readonly dependsOn: ExecutionSubjectRef;
  readonly gate: TaskDependencyGate;
  readonly blocking: boolean;
}

export interface CreateTaskApprovalPolicyInput {
  readonly stages: readonly Omit<ApprovalStage, "id">[];
}

export interface CreateTaskReminderInput {
  readonly trigger: TaskReminderTrigger;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface UpdateTaskReminderInput {
  readonly trigger?: TaskReminderTrigger;
  readonly metadata?: Readonly<Record<string, JsonValue>>;
}

export interface CreateTaskInput {
  readonly id?: TaskId;
  readonly scope: TaskScope;
  readonly profile: TaskProfile;
  readonly definition: TaskDefinition;
  readonly revisionReason?: string;
  readonly evaluationPolicy?: TaskEvaluationPolicySnapshot;
  readonly criteria?: readonly Omit<TaskCriterion, "id">[];
  readonly deliverables?: readonly Omit<TaskDeliverableRequirement, "id">[];
  readonly dependencies?: readonly CreateTaskDependencyInput[];
  readonly approvalPolicy?: CreateTaskApprovalPolicyInput;
  readonly timing?: TaskTiming;
  readonly reminders?: readonly CreateTaskReminderInput[];
  readonly actor?: ActorRef;
}

export interface TaskReopenRequest {
  readonly effect: ReopenEffect;
  readonly reason: string;
  readonly actor?: ActorRef;
  readonly cause?: ReopenCause;
}
