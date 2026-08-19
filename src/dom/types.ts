import type {
  ArtifactId,
  ArtifactLinkId,
  ArtifactMetadata,
  ArtifactRequirementId,
  ArtifactSubmissionId,
  ArtifactVerificationId,
  ArtifactVersionId,
} from "@elqora/artifacts";

import type {
  AcceptanceId,
  ActorRef,
  ApprovalRecordId,
  ApprovalStageId,
  ChallengeEvidenceId,
  ChallengeEvidenceKind,
  ChallengeEvidenceSourceIssueCode,
  ChallengeEvidenceState,
  ChallengeId,
  ChallengeResolutionOutcome,
  ChallengeState,
  ChallengeTarget,
  CompletionId,
  CriterionId,
  CriterionState,
  DeliverableRequirementId,
  DeliverableRequirementState,
  DependencyId,
  DerivedMilestoneState,
  EvaluationReasonCode,
  JsonValue,
  Milestone,
  MilestoneArtifactContext,
  MilestoneDependencyGate,
  MilestoneGraphSnapshot,
  MilestoneId,
  MilestoneProfile,
  MilestoneProfileId,
  MilestoneRevisionId,
  MilestoneSourceRole,
  MilestoneSourceSubjectType,
  ReviewId,
  ReviewResult,
  ReviewState,
} from "../model/domain.js";

/**
 * Construction context for the Milestone DOM.
 *
 * The Milestone itself is always required.
 *
 * Profile, graph and artifact context provide the information required
 * for richer semantic queries such as acceptance, completion, blockers,
 * source resolution and artifact-aware evaluation.
 */
export interface MilestoneDocumentContext {
  readonly milestone: Milestone;
  readonly profile: MilestoneProfile;
  readonly graph?: MilestoneGraphSnapshot;
  readonly artifacts?: MilestoneArtifactContext;
}

/* -------------------------------------------------------------------------- */
/*                              Common DOM types                              */
/* -------------------------------------------------------------------------- */

/**
 * Controls bounded reads from potentially large textual content.
 */
export interface TextReadOptions {
  /**
   * Zero-based character offset.
   *
   * @default 0
   */
  readonly offset?: number;

  /**
   * Maximum number of characters to return.
   *
   * If omitted, the remainder of the content is returned.
   */
  readonly limit?: number;
}

/**
 * Controls creation of a short preview of textual content.
 */
export interface TextExcerptOptions {
  /**
   * Maximum number of characters in the excerpt.
   *
   * @default 240
   */
  readonly limit?: number;
}

/**
 * Result of a bounded text read.
 */
export interface TextChunk {
  readonly text: string;
  readonly offset: number;
  readonly end: number;
  readonly length: number;
  readonly totalLength: number;
  readonly hasPrevious: boolean;
  readonly hasMore: boolean;
  readonly previousOffset?: number;
  readonly nextOffset?: number;
}

/**
 * First-class representation of narrative/textual content.
 *
 * A TextDocument allows callers to inspect metadata about the content
 * without automatically retrieving the whole value.
 *
 * This is particularly useful for CLI and AI consumers where descriptions,
 * reasons, summaries and other narrative fields may be very large.
 */
export interface TextDocument {
  /**
   * Returns true when the document contains no text.
   */
  isEmpty(): boolean;

  /**
   * Total character length.
   */
  getLength(): number;

  /**
   * Returns the complete text.
   *
   * This should be used deliberately when the caller really wants the
   * entire content.
   */
  getText(): string;

  /**
   * Returns a short preview suitable for list/overview presentation.
   */
  getExcerpt(options?: TextExcerptOptions): string;

  /**
   * Reads a bounded portion of the content.
   */
  read(options?: TextReadOptions): TextChunk;
}

/**
 * Bounded collection-list options.
 *
 * Collection Documents should not require callers to materialize every
 * child just to produce a CLI listing.
 */
export interface DocumentListOptions {
  /**
   * Zero-based item offset.
   *
   * @default 0
   */
  readonly offset?: number;

  /**
   * Maximum number of items to return.
   */
  readonly limit?: number;
}

/**
 * Common behavior for collections of addressable DOM nodes.
 *
 * TOverview is intentionally different from TDocument:
 *
 * list()
 *   -> compact/lightweight document handles
 *
 * get()
 *   -> complete semantic document for one entity
 */
export interface DocumentCollection<
  TId extends string,
  TOverview,
  TDocument,
> {
  getCount(): number;
  isEmpty(): boolean;
  has(id: TId): boolean;

  /**
   * Lightweight listing.
   *
   * Implementations should preserve canonical/domain ordering unless the
   * collection explicitly documents another deterministic order.
   */
  list(options?: DocumentListOptions): readonly TOverview[];

  /**
   * Returns undefined when no entity with the ID exists.
   */
  get(id: TId): TDocument | undefined;

  /**
   * Returns the entity or throws the package's normal NOT_FOUND error.
   */
  require(id: TId): TDocument;
}

/* -------------------------------------------------------------------------- */
/*                                  Profile                                   */
/* -------------------------------------------------------------------------- */

export interface MilestoneProfileDocument {
  getId(): MilestoneProfileId;
  getVersion(): number;
  isCriteriaEnabled(): boolean;
  isDeliverablesEnabled(): boolean;
  isDependenciesEnabled(): boolean;
  participatesInGraph(): boolean;
  isRevisionsEnabled(): boolean;
  isChallengesEnabled(): boolean;
  isReviewsEnabled(): boolean;
  isReviewRequired(): boolean;
  isApprovalsEnabled(): boolean;
  isApprovalRequired(): boolean;
  isCompletionEnabled(): boolean;
  closesImmediatelyOnAcceptance(): boolean;
}

/* -------------------------------------------------------------------------- */
/*                                Definition                                  */
/* -------------------------------------------------------------------------- */

export interface MilestoneDefinitionDocument {
  getTitle(): string;
  getKey(): string | undefined;

  /**
   * Description is first-class and may be arbitrarily large.
   */
  getDescription(): TextDocument;
  hasDescription(): boolean;
  getMetadata(): Readonly<Record<string, JsonValue>>;
  getMetadataValue(key: string): JsonValue | undefined;
  hasMetadata(key: string): boolean;
}

/* -------------------------------------------------------------------------- */
/*                                  Progress                                  */
/* -------------------------------------------------------------------------- */

export interface MilestoneProgressDocument {
  getCompletedWeight(): number;
  getTotalWeight(): number;
  getPercentage(): number;
  isComplete(): boolean;
}

/* -------------------------------------------------------------------------- */
/*                                  Sources                                   */
/* -------------------------------------------------------------------------- */

export interface MilestoneSourceOverviewDocument {
  getId(): ArtifactLinkId;
  getArtifactId(): ArtifactId;
  getArtifactVersionId(): ArtifactVersionId | undefined;
  getRole(): MilestoneSourceRole;
  getSubjectType(): MilestoneSourceSubjectType;
  getSubjectId(): string;

  /**
   * Notes may also contain substantial narrative information.
   */
  getNote(): TextDocument;
  hasNote(): boolean;
  isPinned(): boolean;
  isDefinitionBearing(): boolean;
}

export interface MilestoneSourceDocument
  extends MilestoneSourceOverviewDocument {
  getMetadata(): ArtifactMetadata | undefined;

  /**
   * Version after historical/current source resolution.
   *
   * For an explicitly pinned Source this will normally equal
   * getArtifactVersionId().
   */
  getResolvedArtifactVersionId(): ArtifactVersionId | undefined;
  isResolved(): boolean;
}

export interface MilestoneSourcesDocument
  extends DocumentCollection<
    ArtifactLinkId,
    MilestoneSourceOverviewDocument,
    MilestoneSourceDocument
  > {
  getByRole(role: MilestoneSourceRole): readonly MilestoneSourceDocument[];
  getBySubject(
    type: MilestoneSourceSubjectType,
    id: string,
  ): readonly MilestoneSourceDocument[];
  getReferences(): readonly MilestoneSourceDocument[];
  getContext(): readonly MilestoneSourceDocument[];
  getSpecifications(): readonly MilestoneSourceDocument[];
  getDecisions(): readonly MilestoneSourceDocument[];
}

/* -------------------------------------------------------------------------- */
/*                                  Criteria                                  */
/* -------------------------------------------------------------------------- */

export interface CriterionOverviewDocument {
  getId(): CriterionId;
  getTitle(): string;
  getState(): CriterionState;
  isRequired(): boolean;
  getWeight(): number;

  /**
   * Provides deliberate navigation to the full narrative content without
   * embedding that content into normal listings.
   */
  getDescription(): TextDocument;
  hasDescription(): boolean;
}

export interface CriterionDocument {
  getId(): CriterionId;
  getOverview(): CriterionOverviewDocument;
  getTitle(): string;
  getDescription(): TextDocument;
  hasDescription(): boolean;
  getState(): CriterionState;
  isRequired(): boolean;
  getWeight(): number;
  isVerified(): boolean;
  isWaived(): boolean;
  isSatisfied(): boolean;
  getArtifactRequirementIds(): readonly ArtifactRequirementId[];
  getSources(): MilestoneSourcesDocument;
}

export interface CriteriaDocument
  extends DocumentCollection<
    CriterionId,
    CriterionOverviewDocument,
    CriterionDocument
  > {
  getRequired(): readonly CriterionDocument[];
  getOptional(): readonly CriterionDocument[];
  getVerified(): readonly CriterionDocument[];
  getUnsatisfied(): readonly CriterionDocument[];
  getByState(state: CriterionState): readonly CriterionDocument[];
}

/* -------------------------------------------------------------------------- */
/*                               Deliverables                                 */
/* -------------------------------------------------------------------------- */

export interface DeliverableOverviewDocument {
  getId(): DeliverableRequirementId;
  getTitle(): string;
  getState(): DeliverableRequirementState;
  isRequired(): boolean;
  getDescription(): TextDocument;
  hasDescription(): boolean;
}

export interface DeliverableDocument {
  getId(): DeliverableRequirementId;
  getOverview(): DeliverableOverviewDocument;
  getTitle(): string;
  getDescription(): TextDocument;
  hasDescription(): boolean;
  getState(): DeliverableRequirementState;
  isRequired(): boolean;
  isSatisfied(): boolean;
  isWaived(): boolean;
  getArtifactRequirementIds(): readonly ArtifactRequirementId[];
  getSources(): MilestoneSourcesDocument;
}

export interface DeliverablesDocument
  extends DocumentCollection<
    DeliverableRequirementId,
    DeliverableOverviewDocument,
    DeliverableDocument
  > {
  getRequired(): readonly DeliverableDocument[];
  getOptional(): readonly DeliverableDocument[];
  getSatisfied(): readonly DeliverableDocument[];
  getUnsatisfied(): readonly DeliverableDocument[];
  getByState(
    state: DeliverableRequirementState,
  ): readonly DeliverableDocument[];
}

/* -------------------------------------------------------------------------- */
/*                                Dependencies                                */
/* -------------------------------------------------------------------------- */

export interface DependencyOverviewDocument {
  getId(): DependencyId;
  getMilestoneId(): MilestoneId;
  getDependsOnMilestoneId(): MilestoneId;
  getGate(): MilestoneDependencyGate;
  isBlocking(): boolean;

  /**
   * Undefined means the supplied document context is insufficient to
   * determine current satisfaction.
   */
  isSatisfied(): boolean | undefined;
}

export interface DependencyDocument extends DependencyOverviewDocument {
  isUnsatisfied(): boolean | undefined;
}

export interface DependenciesDocument
  extends DocumentCollection<
    DependencyId,
    DependencyOverviewDocument,
    DependencyDocument
  > {
  getBlocking(): readonly DependencyDocument[];
  getNonBlocking(): readonly DependencyDocument[];
  getSatisfied(): readonly DependencyDocument[];
  getUnsatisfied(): readonly DependencyDocument[];
  getUnknown(): readonly DependencyDocument[];
}

/**
 * Current graph/readiness state of this milestone.
 *
 * "Blocked" here refers to technical dependency blocking rather than
 * acceptance failure.
 */
export interface MilestoneReadinessDocument {
  /**
   * Whether enough graph context exists to evaluate readiness.
   */
  canEvaluate(): boolean;

  /**
   * true      -> conclusively blocked
   * false     -> conclusively not blocked
   * undefined -> graph context unavailable
   */
  isBlocked(): boolean | undefined;

  /**
   * true      -> currently runnable
   * false     -> graph exists but milestone is not runnable
   * undefined -> graph context unavailable
   */
  isReady(): boolean | undefined;

  /**
   * Only blocking dependencies that are currently unsatisfied.
   */
  getBlockers(): readonly DependencyDocument[];
  /**
   * Blocking dependencies whose state cannot currently be evaluated.
   */
  getUnknownBlockingDependencies(): readonly DependencyDocument[];
  getDependencies(): DependenciesDocument;
  getSatisfiedDependencyCount(): number;
  getUnsatisfiedDependencyCount(): number;
}

/* -------------------------------------------------------------------------- */
/*                          Historical Source snapshots                       */
/* -------------------------------------------------------------------------- */

export interface MilestoneSourceSnapshotDocument {
  getLinkId(): ArtifactLinkId;

  getArtifactId(): ArtifactId;

  getArtifactVersionId(): ArtifactVersionId | undefined;

  getSubjectType(): MilestoneSourceSubjectType;

  getSubjectId(): string;

  getRole(): MilestoneSourceRole;

  getNote(): TextDocument;

  hasNote(): boolean;

  getMetadata(): ArtifactMetadata | undefined;

  isPinned(): boolean;
}

/* -------------------------------------------------------------------------- */
/*                             Challenge target                               */
/* -------------------------------------------------------------------------- */

export interface ChallengeTargetDocument {
  getType(): ChallengeTarget["type"];

  getCriterionId(): CriterionId | undefined;

  getDeliverableRequirementId():
    | DeliverableRequirementId
    | undefined;

  getReviewId(): ReviewId | undefined;

  getArtifactId(): ArtifactId | undefined;

  getArtifactVersionId():
    | ArtifactVersionId
    | undefined;

  getReference(): string | undefined;
}

/* -------------------------------------------------------------------------- */
/*                         Challenge evidence Sources                         */
/* -------------------------------------------------------------------------- */

export interface ChallengeEvidenceSourceDocument {
  getLinkId(): ArtifactLinkId;

  getRole():
    | "challenge_evidence"
    | "response_evidence";

  getArtifactId(): ArtifactId;

  getArtifactVersionId(): ArtifactVersionId;
}

export interface ChallengeEvidenceSourceIssueDocument {
  getCode(): ChallengeEvidenceSourceIssueCode;

  getLinkId(): ArtifactLinkId;

  getMessage(): string;
}

export interface ChallengeEvidenceSourcesDocument {
  getStatus():
    | "pending"
    | "resolved"
    | "invalid";

  isPending(): boolean;

  isResolved(): boolean;

  isInvalid(): boolean;

  getCount(): number;

  list(): readonly ChallengeEvidenceSourceDocument[];

  getIssues():
    readonly ChallengeEvidenceSourceIssueDocument[];
}

/* -------------------------------------------------------------------------- */
/*                              Challenge evidence                            */
/* -------------------------------------------------------------------------- */

export interface ChallengeEvidenceOverviewDocument {
  getId(): ChallengeEvidenceId;

  getKind(): ChallengeEvidenceKind;

  getTitle(): string;

  getState(): ChallengeEvidenceState;

  getDescription(): TextDocument;
}

export interface ChallengeEvidenceDocument {
  getId(): ChallengeEvidenceId;

  getOverview(): ChallengeEvidenceOverviewDocument;

  getKind(): ChallengeEvidenceKind;

  getTitle(): string;

  getDescription(): TextDocument;

  getState(): ChallengeEvidenceState;

  getSupersedesEvidenceId():
    | ChallengeEvidenceId
    | undefined;

  getCreatedBy(): ActorRef | undefined;

  getCreatedAt(): string;

  getWithdrawnBy(): ActorRef | undefined;

  getWithdrawnAt(): string | undefined;

  getWithdrawalReason(): TextDocument;

  isWithdrawn(): boolean;

  /**
   * Canonical Artifact-backed evidence Sources.
   *
   * These are NOT MilestoneSourceLinks.
   */
  getSources(): ChallengeEvidenceSourcesDocument;
}

export interface ChallengeEvidenceCollectionDocument
  extends DocumentCollection<
    ChallengeEvidenceId,
    ChallengeEvidenceOverviewDocument,
    ChallengeEvidenceDocument
  > {
  getActive(): readonly ChallengeEvidenceDocument[];

  getSupporting(): readonly ChallengeEvidenceDocument[];

  getResponses(): readonly ChallengeEvidenceDocument[];
}

/* -------------------------------------------------------------------------- */
/*                                 Challenges                                 */
/* -------------------------------------------------------------------------- */

export interface ChallengeOverviewDocument {
  getId(): ChallengeId;

  getRevisionId(): MilestoneRevisionId;

  getTarget(): ChallengeTargetDocument;

  getState(): ChallengeState;

  getSeverity(): "non_blocking" | "blocking";

  getReason(): TextDocument;

  /**
   * Current semantic blocking state, not merely severity.
   */
  isBlocking(): boolean;

  isOpen(): boolean;

  isCurrentRevision(): boolean;
}

export interface ChallengeResolutionDocument {
  getOutcome(): ChallengeResolutionOutcome;

  getSummary(): TextDocument;

  getResolvedBy(): ActorRef | undefined;

  getResolvedAt(): string;

  /**
   * Historical Sources captured with the resolution.
   */
  getSourceSnapshots():
    readonly MilestoneSourceSnapshotDocument[];
}

export interface ChallengeDocument {
  getId(): ChallengeId;

  getOverview(): ChallengeOverviewDocument;

  getRevisionId(): MilestoneRevisionId;

  getTarget(): ChallengeTargetDocument;

  getReason(): TextDocument;

  getState(): ChallengeState;

  getSeverity(): "non_blocking" | "blocking";

  /**
   * Whether this Challenge is actually blocking current acceptance.
   */
  isBlocking(): boolean;

  isOpen(): boolean;

  isCurrentRevision(): boolean;

  getRaisedBy(): ActorRef | undefined;

  getCreatedAt(): string;

  getResolution():
    | ChallengeResolutionDocument
    | undefined;

  getEvidence(): ChallengeEvidenceCollectionDocument;

  /**
   * Ordinary Milestone Sources attached to the Challenge itself.
   */
  getSources(): MilestoneSourcesDocument;
}

export interface ChallengesDocument
  extends DocumentCollection<
    ChallengeId,
    ChallengeOverviewDocument,
    ChallengeDocument
  > {
  getOpen(): readonly ChallengeDocument[];

  /**
   * Challenges actually blocking current acceptance.
   */
  getBlocking(): readonly ChallengeDocument[];

  getResolved(): readonly ChallengeDocument[];

  getByState(
    state: ChallengeState,
  ): readonly ChallengeDocument[];

  getForRevision(
    revisionId: MilestoneRevisionId,
  ): readonly ChallengeDocument[];

  getCurrentRevision():
    readonly ChallengeDocument[];
}

/* -------------------------------------------------------------------------- */
/*                                   Reviews                                  */
/* -------------------------------------------------------------------------- */

export interface ReviewOverviewDocument {
  getId(): ReviewId;

  getRevisionId(): MilestoneRevisionId;

  getState(): ReviewState;

  getResult(): ReviewResult | undefined;

  getSummary(): TextDocument;

  isCompleted(): boolean;

  /**
   * Whether the Review itself concluded successfully.
   *
   * This does not imply that it belongs to the current revision.
   */
  isAccepted(): boolean;

  isCurrentRevision(): boolean;

  /**
   * Whether this Review currently satisfies the milestone's review
   * requirement for acceptance.
   */
  satisfiesCurrentAcceptance(): boolean;
}

export interface ReviewDocument {
  getId(): ReviewId;

  getOverview(): ReviewOverviewDocument;

  getRevisionId(): MilestoneRevisionId;

  getState(): ReviewState;

  getResult(): ReviewResult | undefined;

  getSummary(): TextDocument;

  getRequestedBy(): ActorRef | undefined;

  getAssignedReviewer(): ActorRef | undefined;

  getCompletedBy(): ActorRef | undefined;

  getCreatedAt(): string;

  getCompletedAt(): string | undefined;

  getArtifactVersionIds(): readonly ArtifactVersionId[];

  /**
   * Current/live Sources attached directly to the Review.
   */
  getSources(): MilestoneSourcesDocument;

  /**
   * Historical Source state captured by the Review.
   */
  getSourceSnapshots():
    readonly MilestoneSourceSnapshotDocument[];

  isCompleted(): boolean;

  isAccepted(): boolean;

  isCurrentRevision(): boolean;

  satisfiesCurrentAcceptance(): boolean;
}

export interface ReviewsDocument
  extends DocumentCollection<
    ReviewId,
    ReviewOverviewDocument,
    ReviewDocument
  > {
  getPending(): readonly ReviewDocument[];

  getCompleted(): readonly ReviewDocument[];

  getAccepted(): readonly ReviewDocument[];

  getChangesRequested(): readonly ReviewDocument[];

  getRejected(): readonly ReviewDocument[];

  getByState(
    state: ReviewState,
  ): readonly ReviewDocument[];

  getForRevision(
    revisionId: MilestoneRevisionId,
  ): readonly ReviewDocument[];

  getCurrentRevision(): readonly ReviewDocument[];

  /**
   * Current-revision Reviews that actually satisfy the acceptance
   * review requirement.
   */
  getSatisfyingCurrentAcceptance():
    readonly ReviewDocument[];
}

/* -------------------------------------------------------------------------- */
/*                                  Approvals                                 */
/* -------------------------------------------------------------------------- */

export interface ApprovalStageOverviewDocument {
  getId(): ApprovalStageId;
  getLabel(): string;
  isRequired(): boolean;
  getRequiredApprovalCount(): number;
  getEffectiveApprovalCount(): number;
  isSatisfied(): boolean;
  isWaived(): boolean;
}

export interface ApprovalStageDocument {
  getId(): ApprovalStageId;
  getOverview(): ApprovalStageOverviewDocument;
  getLabel(): string;
  isRequired(): boolean;
  getOrder(): number | undefined;
  getRequiredApprovalCount(): number;
  getScope(): "milestone" | "criteria" | "deliverables";
  getCriterionIds(): readonly CriterionId[];
  getDeliverableRequirementIds(): readonly DeliverableRequirementId[];
  getAuthorityRef(): string | undefined;
  getEffectiveApprovalCount(): number;
  getEffectiveActorIds(): readonly string[];
  isSatisfied(): boolean;
  isWaived(): boolean;
}

export interface ApprovalRecordOverviewDocument {
  getId(): ApprovalRecordId;
  getStageId(): ApprovalStageId;
  getRevisionId(): MilestoneRevisionId;
  getType(): "granted" | "rejected" | "revoked" | "waived";
  getActor(): ActorRef;
  getCreatedAt(): string;
}

export interface ApprovalRecordDocument
  extends ApprovalRecordOverviewDocument {
  getReason(): TextDocument;
  getRevokedApprovalId(): ApprovalRecordId | undefined;
}

export interface ApprovalStagesDocument
  extends DocumentCollection<
    ApprovalStageId,
    ApprovalStageOverviewDocument,
    ApprovalStageDocument
  > {
  getRequired(): readonly ApprovalStageDocument[];
  getPending(): readonly ApprovalStageDocument[];
  getSatisfied(): readonly ApprovalStageDocument[];
}

export interface ApprovalRecordsDocument
  extends DocumentCollection<
    ApprovalRecordId,
    ApprovalRecordOverviewDocument,
    ApprovalRecordDocument
  > {
  getForStage(stageId: ApprovalStageId): readonly ApprovalRecordDocument[];
  getForRevision(
    revisionId: MilestoneRevisionId,
  ): readonly ApprovalRecordDocument[];
}

export interface ApprovalsDocument {
  isEnabled(): boolean;
  isRequired(): boolean;
  isSatisfied(): boolean;
  getStages(): ApprovalStagesDocument;
  getRecords(): ApprovalRecordsDocument;
}

/* -------------------------------------------------------------------------- */
/*                                  Revisions                                 */
/* -------------------------------------------------------------------------- */

export interface MilestoneEvaluationPolicyDocument {
  requiredCriteriaMustBeVerified(): boolean;
  requiredDeliverablesMustBeSatisfied(): boolean;
  waivedCriteriaSatisfyRequired(): boolean;
  waivedDeliverablesSatisfyRequired(): boolean;
  blockingChallengesPreventAcceptance(): boolean;
  getRequiredReviewResult(): "accepted";
  requireReviewWhenProfileRequires(): boolean;
  requireApprovalsWhenProfileRequires(): boolean;
  completionRequiresCurrentAcceptance(): boolean;
  closeImmediatelyOnAcceptance(): boolean;
}

export interface CriterionDefinitionDocument {
  getId(): CriterionId;
  getTitle(): string;
  getDescription(): TextDocument;
  isRequired(): boolean;
  getWeight(): number;
  getArtifactRequirementIds(): readonly ArtifactRequirementId[];

  /**
   * Historical, resolved Source snapshots belonging to this Criterion.
   */
  getSources(): readonly MilestoneSourceSnapshotDocument[];
}

export interface DeliverableDefinitionDocument {
  getId(): DeliverableRequirementId;
  getTitle(): string;
  getDescription(): TextDocument;
  isRequired(): boolean;
  getArtifactRequirementIds(): readonly ArtifactRequirementId[];

  getSources(): readonly MilestoneSourceSnapshotDocument[];
}

export interface DependencyDefinitionDocument {
  getId(): DependencyId;
  getMilestoneId(): MilestoneId;
  getDependsOnMilestoneId(): MilestoneId;
  getGate(): MilestoneDependencyGate;
  isBlocking(): boolean;
}

export interface ApprovalStageDefinitionDocument {
  getId(): ApprovalStageId;
  getLabel(): string;
  isRequired(): boolean;
  getOrder(): number | undefined;
  getRequiredApprovalCount(): number;
  getScope(): "milestone" | "criteria" | "deliverables";
  getCriterionIds(): readonly CriterionId[];
  getDeliverableRequirementIds():
    readonly DeliverableRequirementId[];
  getAuthorityRef(): string | undefined;
}

export interface ApprovalPolicySnapshotDocument {
  hasPolicy(): boolean;

  getStages():
    readonly ApprovalStageDefinitionDocument[];

  getStage(
    id: ApprovalStageId,
  ): ApprovalStageDefinitionDocument | undefined;

  requireStage(
    id: ApprovalStageId,
  ): ApprovalStageDefinitionDocument;
}

export interface MilestoneRevisionSnapshotDocument {
  getProfileId(): MilestoneProfileId;
  getProfileVersion(): number;

  getEvaluationPolicy():
    MilestoneEvaluationPolicyDocument;

  getDefinition():
    MilestoneDefinitionDocument;

  getCriteria():
    readonly CriterionDefinitionDocument[];

  getCriterion(
    id: CriterionId,
  ): CriterionDefinitionDocument | undefined;

  getDeliverables():
    readonly DeliverableDefinitionDocument[];

  getDeliverable(
    id: DeliverableRequirementId,
  ): DeliverableDefinitionDocument | undefined;

  getDependencies():
    readonly DependencyDefinitionDocument[];

  /**
   * Historical resolved Source state captured for this revision.
   */
  getSources():
    readonly MilestoneSourceSnapshotDocument[];

  getApprovalPolicy():
    ApprovalPolicySnapshotDocument;
}

export interface RevisionOverviewDocument {
  getId(): MilestoneRevisionId;

  getNumber(): number;

  getPreviousRevisionId():
    | MilestoneRevisionId
    | undefined;

  getReason(): TextDocument;

  getCreatedAt(): string;

  isCurrent(): boolean;
}

export interface RevisionDocument {
  getId(): MilestoneRevisionId;

  getOverview(): RevisionOverviewDocument;

  getNumber(): number;

  getPreviousRevisionId():
    | MilestoneRevisionId
    | undefined;

  getReason(): TextDocument;

  getActor(): ActorRef | undefined;

  getCreatedAt(): string;

  isCurrent(): boolean;

  getSnapshot():
    MilestoneRevisionSnapshotDocument;

  /**
   * Source links attached to the Revision aggregate itself.
   *
   * Distinct from snapshot.getSources(), which is historical resolved state.
   */
  getSources(): MilestoneSourcesDocument;
}

export interface RevisionsDocument
  extends DocumentCollection<
    MilestoneRevisionId,
    RevisionOverviewDocument,
    RevisionDocument
  > {
  getCurrent(): RevisionDocument;

  getPrevious(): RevisionDocument | undefined;

  getByNumber(
    number: number,
  ): RevisionDocument | undefined;

  getLatest(
    count?: number,
  ): readonly RevisionDocument[];
}

/* -------------------------------------------------------------------------- */
/*                                  Issues                                    */
/* -------------------------------------------------------------------------- */

export type MilestoneIssueCategory =
  | "criteria"
  | "deliverables"
  | "acceptance"
  | "dependencies"
  | "challenges"
  | "reviews"
  | "approvals"
  | "artifacts"
  | "profile";

export interface MilestoneIssueDocument {
  getCode(): EvaluationReasonCode;

  /**
   * Domain subject that caused the evaluation issue.
   *
   * The exact subject type depends on the reason code.
   */
  getSubjectId(): string;

  getMessage(): string;

  getCategory(): MilestoneIssueCategory;

  isArtifactRelated(): boolean;
}

export interface MilestoneIssuesDocument {
  getCount(): number;

  isEmpty(): boolean;

  list(
    options?: DocumentListOptions,
  ): readonly MilestoneIssueDocument[];

  getByCode(
    code: EvaluationReasonCode,
  ): readonly MilestoneIssueDocument[];

  getByCategory(
    category: MilestoneIssueCategory,
  ): readonly MilestoneIssueDocument[];

  getBySubjectId(
    subjectId: string,
  ): readonly MilestoneIssueDocument[];

  hasCode(
    code: EvaluationReasonCode,
  ): boolean;

  hasCategory(
    category: MilestoneIssueCategory,
  ): boolean;

  getArtifactIssues():
    readonly MilestoneIssueDocument[];
}

/* -------------------------------------------------------------------------- */
/*                                 Acceptance                                 */
/* -------------------------------------------------------------------------- */

export interface CriterionAcceptanceSnapshotDocument {
  getId(): CriterionId;
  getState(): CriterionState;
  isSatisfied(): boolean;
}

export interface DeliverableAcceptanceSnapshotDocument {
  getId(): DeliverableRequirementId;
  getState(): DeliverableRequirementState;
  isSatisfied(): boolean;
}

export interface DependencyAcceptanceSnapshotDocument {
  getId(): DependencyId;
  getDependsOnMilestoneId(): MilestoneId;

  getDependsOnRevisionId():
    | MilestoneRevisionId
    | undefined;

  getGate(): MilestoneDependencyGate;

  isBlocking(): boolean;
  isSatisfied(): boolean;
}

export interface ChallengeEvidenceAcceptanceSnapshotDocument {
  getId(): ChallengeEvidenceId;

  getKind(): ChallengeEvidenceKind;

  getTitle(): string;

  getDescription(): TextDocument;

  getState(): ChallengeEvidenceState;

  getSupersedesEvidenceId():
    | ChallengeEvidenceId
    | undefined;

  getSourceStatus():
    | "pending"
    | "resolved"
    | "invalid";

  getSources():
    readonly ChallengeEvidenceSourceDocument[];
}

export interface ChallengeAcceptanceSnapshotDocument {
  getId(): ChallengeId;

  getTarget(): ChallengeTargetDocument;

  getSeverity():
    | "non_blocking"
    | "blocking";

  getState(): ChallengeState;

  isBlocking(): boolean;

  getResolution():
    | ChallengeResolutionDocument
    | undefined;

  getEvidence():
    readonly ChallengeEvidenceAcceptanceSnapshotDocument[];
}

export interface ReviewAcceptanceSnapshotDocument {
  getId(): ReviewId;

  getRevisionId(): MilestoneRevisionId;

  getState(): ReviewState;

  getResult(): ReviewResult | undefined;

  getArtifactVersionIds():
    readonly ArtifactVersionId[];

  isSatisfied(): boolean;
}

export interface ApprovalAcceptanceSnapshotDocument {
  getStageId(): ApprovalStageId;

  getRevisionId(): MilestoneRevisionId;

  getEffectiveApprovalCount(): number;

  getRequiredApprovalCount(): number;

  isSatisfied(): boolean;

  isWaived(): boolean;

  getActorIds(): readonly string[];
}

export interface ArtifactAcceptanceSnapshotDocument {
  getArtifactRequirementId(): ArtifactRequirementId;

  getArtifactId(): ArtifactId;

  getArtifactVersionId():
    | ArtifactVersionId
    | undefined;

  getSubmissionId():
    | ArtifactSubmissionId
    | undefined;

  getVerificationId():
    | ArtifactVerificationId
    | undefined;

  getOutcome():
    | "satisfied"
    | "failed"
    | "waived";
}

export interface MilestoneAcceptanceSnapshotDocument {
  getRevisionId(): MilestoneRevisionId;

  getCriteria():
    readonly CriterionAcceptanceSnapshotDocument[];

  getDeliverables():
    readonly DeliverableAcceptanceSnapshotDocument[];

  getDependencies():
    readonly DependencyAcceptanceSnapshotDocument[];

  getChallenges():
    readonly ChallengeAcceptanceSnapshotDocument[];

  getReviews():
    readonly ReviewAcceptanceSnapshotDocument[];

  getApprovals():
    readonly ApprovalAcceptanceSnapshotDocument[];

  getArtifacts():
    readonly ArtifactAcceptanceSnapshotDocument[];

  /**
   * Historical/resolved Source state captured by evaluation/acceptance.
   */
  getSources():
    readonly MilestoneSourceSnapshotDocument[];
}

export interface AcceptanceOverviewDocument {
  getId(): AcceptanceId;

  getRevisionId(): MilestoneRevisionId;

  getAcceptedAt(): string;

  isCurrent(): boolean;
}

export interface AcceptanceDocument {
  getId(): AcceptanceId;

  getOverview(): AcceptanceOverviewDocument;

  getRevisionId(): MilestoneRevisionId;

  getAcceptedAt(): string;

  getActor(): ActorRef | undefined;

  isCurrent(): boolean;

  getSnapshot():
    MilestoneAcceptanceSnapshotDocument;
}

export interface AcceptanceHistoryDocument
  extends DocumentCollection<
    AcceptanceId,
    AcceptanceOverviewDocument,
    AcceptanceDocument
  > {
  getForRevision(
    revisionId: MilestoneRevisionId,
  ): readonly AcceptanceDocument[];

  getLatest(): AcceptanceDocument | undefined;
}

export interface AcceptanceStatusDocument {
  /**
   * Whether the milestone ALREADY has a current Acceptance record.
   */
  isAccepted(): boolean;

  /**
   * Whether evaluateAcceptance() says an Acceptance could be created now.
   */
  canAccept(): boolean;

  getIssues(): MilestoneIssuesDocument;

  /**
   * The fresh snapshot produced by current evaluation.
   *
   * This is not yet a historical Acceptance record unless the Editor actually
   * creates an Acceptance.
   */
  getEvaluationSnapshot():
    MilestoneAcceptanceSnapshotDocument;

  getCurrent():
    AcceptanceDocument | undefined;

  getHistory():
    AcceptanceHistoryDocument;
}

/* -------------------------------------------------------------------------- */
/*                                 Completion                                 */
/* -------------------------------------------------------------------------- */

export interface MilestoneCompletionOverviewDocument {
  getId(): CompletionId;
  getRevisionId(): MilestoneRevisionId;
  getAcceptanceId(): AcceptanceId;
  getCompletedAt(): string;
  getActor(): ActorRef | undefined;
  getReason(): TextDocument;
  isCurrent(): boolean;
}

export interface MilestoneCompletionDocument {
  getId(): CompletionId;
  getOverview(): MilestoneCompletionOverviewDocument;
  getRevisionId(): MilestoneRevisionId;
  getAcceptanceId(): AcceptanceId;
  getCompletedAt(): string;
  getActor(): ActorRef | undefined;
  getReason(): TextDocument;
  isCurrent(): boolean;
}

export interface MilestoneCompletionsDocument
  extends DocumentCollection<
    CompletionId,
    MilestoneCompletionOverviewDocument,
    MilestoneCompletionDocument
  > {
  getCurrent(): MilestoneCompletionDocument | undefined;
  hasCurrent(): boolean;
}

export interface MilestoneCompletionStatusDocument {
  canComplete(): boolean;
  getIssues(): MilestoneIssuesDocument;
}

/* -------------------------------------------------------------------------- */
/*                                  Overview                                  */
/* -------------------------------------------------------------------------- */

/**
 * Compact semantic view of a milestone.
 *
 * The overview deliberately does not embed large narrative or collection
 * payloads. Instead, it exposes navigable child Documents.
 */
export interface MilestoneOverviewDocument {
  getId(): MilestoneId;
  getTitle(): string;
  getKey(): string | undefined;
  getState(): DerivedMilestoneState;

  /**
   * Explicit navigation to potentially large narrative content.
   *
   * Calling getOverview() itself should not require consumers to render or
   * serialize the entire description.
   */
  getDescription(): TextDocument;
  getProgress(): MilestoneProgressDocument;
  getCurrentRevisionId(): MilestoneRevisionId;
  isBlocked(): boolean;
  isAccepted(): boolean;
  isCompleted(): boolean;
  getCriterionCount(): number;
  getRequiredCriterionCount(): number;
  getSatisfiedCriterionCount(): number;
  getDeliverableCount(): number;
  getRequiredDeliverableCount(): number;
  getSatisfiedDeliverableCount(): number;
  getDependencyCount(): number;
  getBlockingDependencyCount(): number;
  getChallengeCount(): number;
  getOpenChallengeCount(): number;
  getBlockingChallengeCount(): number;
  getReviewCount(): number;
  getPendingReviewCount(): number;

  /**
   * Sources attached directly to the milestone.
   */
  getSourceCount(): number;

  /**
   * Sources anywhere in the milestone document tree.
   */
  getTotalSourceCount(): number;
  getCreatedAt(): string;
  getUpdatedAt(): string | undefined;
}

/* -------------------------------------------------------------------------- */
/*                              Milestone Document                            */
/* -------------------------------------------------------------------------- */

/**
 * Public contract implemented by MilestoneDocument in document.ts.
 *
 * This is the root of the milestone document object graph.
 *
 * Domain records are not the primary read API. Callers navigate through
 * semantic child Documents instead.
 */
export interface MilestoneDocumentContract {
  getId(): MilestoneId;
  getTitle(): string;
  getKey(): string | undefined;
  getDefinition(): MilestoneDefinitionDocument;

  /**
   * First-class direct access because milestone descriptions may be large.
   */
  getDescription(): TextDocument;
  getOverview(): MilestoneOverviewDocument;
  getProfile(): MilestoneProfileDocument;
  getState(): DerivedMilestoneState;
  getCurrentRevisionId(): MilestoneRevisionId;

  /* ---------------------------------------------------------------------- */
  /* Progress / readiness                                                   */
  /* ---------------------------------------------------------------------- */

  getProgress(): MilestoneProgressDocument;
  getReadiness(): MilestoneReadinessDocument;
  isBlocked(): boolean;
  getBlockers(): readonly DependencyDocument[];

  /* ---------------------------------------------------------------------- */
  /* Criteria / deliverables / dependencies                                 */
  /* ---------------------------------------------------------------------- */

  getCriteria(): CriteriaDocument;
  getCriterion(id: CriterionId): CriterionDocument | undefined;
  getDeliverables(): DeliverablesDocument;
  getDeliverable(
    id: DeliverableRequirementId,
  ): DeliverableDocument | undefined;
  getDependencies(): DependenciesDocument;
  getDependency(id: DependencyId): DependencyDocument | undefined;

  /* ---------------------------------------------------------------------- */
  /* Sources                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Sources attached directly to this milestone.
   */
  getSources(): MilestoneSourcesDocument;

  /**
   * Sources attached anywhere in the milestone document tree:
   *
   * - milestone
   * - current/historical revisions
   * - criteria
   * - deliverable requirements
   * - challenges
   * - reviews
   */
  getAllSources(): MilestoneSourcesDocument;

  /* ---------------------------------------------------------------------- */
  /* Challenges                                                             */
  /* ---------------------------------------------------------------------- */

  getChallenges(): ChallengesDocument;
  getChallenge(id: ChallengeId): ChallengeDocument | undefined;

  /* ---------------------------------------------------------------------- */
  /* Reviews                                                                */
  /* ---------------------------------------------------------------------- */

  getReviews(): ReviewsDocument;
  getReview(id: ReviewId): ReviewDocument | undefined;

  /* ---------------------------------------------------------------------- */
  /* Approvals                                                              */
  /* ---------------------------------------------------------------------- */

  getApprovals(): ApprovalsDocument;

  /* ---------------------------------------------------------------------- */
  /* Revisions                                                              */
  /* ---------------------------------------------------------------------- */

  getRevisions(): RevisionsDocument;
  getCurrentRevision(): RevisionDocument;
  getRevision(
    id: MilestoneRevisionId,
  ): RevisionDocument | undefined;

  /* ---------------------------------------------------------------------- */
  /* Acceptance                                                             */
  /* ---------------------------------------------------------------------- */

  getAcceptanceStatus(): AcceptanceStatusDocument;
  canAccept(): boolean;
  getAcceptanceIssues(): MilestoneIssuesDocument;
  getAcceptances(): AcceptanceHistoryDocument;
  getCurrentAcceptance(): AcceptanceDocument | undefined;

  /* ---------------------------------------------------------------------- */
  /* Completion                                                             */
  /* ---------------------------------------------------------------------- */

  getCompletionStatus(): MilestoneCompletionStatusDocument;
  canComplete(): boolean;
  getCompletionIssues(): MilestoneIssuesDocument;
  getCompletions(): MilestoneCompletionsDocument;
  getCurrentCompletion(): MilestoneCompletionDocument | undefined;
}

