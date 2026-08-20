import type { ArtifactRequirementId } from "@elqora/artifacts";
import type {
  ApprovalRecordId,
  ApprovalStageId,
  CriterionId,
  DeliverableRequirementId,
} from "./ids.js";

export type ExecutionUnitKind = "milestone" | "task";

export interface ActorRef {
  readonly id: string;
  readonly type?: string;
  readonly label?: string;
}

export interface ExecutionClock {
  now(): string;
}

export interface ExecutionIdGenerator {
  event(): string;
  criterion(): CriterionId;
  deliverableRequirement(): DeliverableRequirementId;
  dependency(): string;
  challenge(): string;
  challengeEvidence(): string;
  review(): string;
  approvalStage(): ApprovalStageId;
  approvalRecord(): ApprovalRecordId;
  revision(): string;
  acceptance(): string;
  completion(): string;
}

export interface ExecutionProfileFeatures {
  readonly enabled: boolean;
}

export type ExecutionSourceRole =
  | "specification"
  | "verification"
  | "provenance"
  | "reference"
  | "audit"
  | "context"
  | "decision";

export type CriterionState =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "verified"
  | "failed"
  | "waived";

export type DeliverableRequirementState =
  | "missing"
  | "submitted"
  | "satisfied"
  | "rejected"
  | "waived";

export interface ExecutionCriterion<TSourceLink = unknown> {
  readonly id: CriterionId;
  readonly title: string;
  readonly description?: string;
  readonly weight?: number;
  readonly required: boolean;
  readonly state: CriterionState;
  readonly artifactRequirementIds?: readonly ArtifactRequirementId[];
  readonly sourceLinks?: readonly TSourceLink[];
}

export interface ExecutionDeliverableRequirement<TSourceLink = unknown> {
  readonly id: DeliverableRequirementId;
  readonly title: string;
  readonly description?: string;
  readonly required: boolean;
  readonly state: DeliverableRequirementState;
  readonly artifactRequirementIds?: readonly ArtifactRequirementId[];
  readonly sourceLinks?: readonly TSourceLink[];
}

export type ChallengeState = "open" | "under_review" | "resolved" | "rejected" | "withdrawn" | "reopened";
export type ChallengeResolutionOutcome = "no_effect" | "target_invalidated" | "acceptance_invalidated" | "requirements_invalidated";
export type ChallengeEvidenceKind = "supporting" | "response";
export type ChallengeEvidenceState = "active" | "superseded" | "withdrawn";

export type ReviewState = "requested" | "in_progress" | "completed" | "cancelled";
export type ReviewResult = "accepted" | "changes_requested" | "rejected";

export interface ApprovalStage {
  readonly id: ApprovalStageId;
  readonly label: string;
  readonly required: boolean;
  readonly order?: number;
  readonly requiredApprovalCount: number;
  readonly scope: "milestone" | "criteria" | "deliverables";
  readonly criterionIds?: readonly CriterionId[];
  readonly deliverableRequirementIds?: readonly DeliverableRequirementId[];
  /** Opaque host-owned selector; the SDK stores but never resolves it. */
  readonly authorityRef?: string;
}

export type ReopenEffect = "invalidate_completion" | "invalidate_completion_only" | "invalidate_acceptance_and_completion";

export type EvaluationReasonCode =
  | "missing_criterion"
  | "missing_deliverable"
  | "unsatisfied_dependency"
  | "blocking_challenge"
  | "incomplete_review"
  | "pending_approval"
  | "missing_acceptance"
  | "profile_feature_disabled"
  | "artifact_requirement_missing"
  | "artifact_submission_missing"
  | "artifact_version_missing"
  | "artifact_verification_missing"
  | "artifact_verification_failed";

export interface EvaluationReason {
  readonly code: EvaluationReasonCode;
  readonly subjectId: string;
  readonly message: string;
}

export interface EvaluationInvalidation {
  readonly type: "acceptance" | "completion" | "criterion_verification" | "deliverable_satisfaction";
  readonly ref: string;
  readonly reason: string;
}

export interface ProgressResult {
  readonly completedWeight: number;
  readonly totalWeight: number;
  readonly percentage: number;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface AuthorizationDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly details?: Readonly<Record<string, unknown>>;
}
