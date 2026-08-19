import type {
  ArtifactId,
  ArtifactLinkId,
  ArtifactMetadata,
  ArtifactRequirementId,
  ArtifactVersionId,
} from "@elqora/artifacts";

import type {
  AcceptanceId,
  ActorRef,
  ApprovalRecordId,
  ApprovalStageId,
  ChallengeEvidenceId,
  ChallengeEvidenceKind,
  ChallengeEvidenceState,
  ChallengeId,
  ChallengeState,
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
  getSupersedesEvidenceId(): ChallengeEvidenceId | undefined;
  getCreatedBy(): ActorRef | undefined;
  getCreatedAt(): string;
  getWithdrawnBy(): ActorRef | undefined;
  getWithdrawnAt(): string | undefined;
  getWithdrawalReason(): TextDocument;
  isWithdrawn(): boolean;

  /**
   * Artifact links that provide the canonical evidence payload are resolved
   * through the milestone artifact context rather than embedded into the
   * ChallengeEvidence domain record.
   */
  getSourceLinkIds(): readonly ArtifactLinkId[];
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
  getState(): ChallengeState;
  getSeverity(): "non_blocking" | "blocking";
  getReason(): TextDocument;
  isBlocking(): boolean;
  isOpen(): boolean;
}

export interface ChallengeResolutionDocument {
  getOutcome():
    | "no_effect"
    | "target_invalidated"
    | "acceptance_invalidated"
    | "requirements_invalidated";
  getSummary(): TextDocument;
  getResolvedBy(): ActorRef | undefined;
  getResolvedAt(): string;
  getSources(): MilestoneSourcesDocument;
}

export interface ChallengeDocument {
  getId(): ChallengeId;
  getOverview(): ChallengeOverviewDocument;
  getRevisionId(): MilestoneRevisionId;
  getReason(): TextDocument;
  getState(): ChallengeState;
  getSeverity(): "non_blocking" | "blocking";
  isBlocking(): boolean;
  isOpen(): boolean;
  getRaisedBy(): ActorRef | undefined;
  getCreatedAt(): string;
  getResolution(): ChallengeResolutionDocument | undefined;
  getEvidence(): ChallengeEvidenceCollectionDocument;
  getSources(): MilestoneSourcesDocument;
}

export interface ChallengesDocument
  extends DocumentCollection<
    ChallengeId,
    ChallengeOverviewDocument,
    ChallengeDocument
  > {
  getOpen(): readonly ChallengeDocument[];
  getBlocking(): readonly ChallengeDocument[];
  getResolved(): readonly ChallengeDocument[];
  getByState(state: ChallengeState): readonly ChallengeDocument[];
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
  isAccepted(): boolean;
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
  getSources(): MilestoneSourcesDocument;
  isCompleted(): boolean;
  isAccepted(): boolean;
}

export interface ReviewsDocument
  extends DocumentCollection<ReviewId, ReviewOverviewDocument, ReviewDocument> {
  getPending(): readonly ReviewDocument[];
  getCompleted(): readonly ReviewDocument[];
  getAccepted(): readonly ReviewDocument[];
  getChangesRequested(): readonly ReviewDocument[];
  getRejected(): readonly ReviewDocument[];
  getByState(state: ReviewState): readonly ReviewDocument[];
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

export interface CriterionDefinitionDocument {
  getId(): CriterionId;
  getTitle(): string;
  getDescription(): TextDocument;
  isRequired(): boolean;
  getWeight(): number;
  getArtifactRequirementIds(): readonly ArtifactRequirementId[];
  getSources(): MilestoneSourcesDocument;
}

export interface DeliverableDefinitionDocument {
  getId(): DeliverableRequirementId;
  getTitle(): string;
  getDescription(): TextDocument;
  isRequired(): boolean;
  getArtifactRequirementIds(): readonly ArtifactRequirementId[];
  getSources(): MilestoneSourcesDocument;
}

export interface MilestoneRevisionSnapshotDocument {
  getProfile(): MilestoneProfileDocument;
  getDefinition(): MilestoneDefinitionDocument;
  getCriteria(): readonly CriterionDefinitionDocument[];
  getDeliverables(): readonly DeliverableDefinitionDocument[];
  getDependencies(): readonly DependencyDocument[];
  getSources(): MilestoneSourcesDocument;
  getApprovalStages(): ApprovalStagesDocument;
}

export interface MilestoneRevisionOverviewDocument {
  getId(): MilestoneRevisionId;
  getNumber(): number;
  getPreviousRevisionId(): MilestoneRevisionId | undefined;
  getReason(): TextDocument;
  getActor(): ActorRef | undefined;
  getCreatedAt(): string;
  isCurrent(): boolean;
}

export interface MilestoneRevisionDocument {
  getId(): MilestoneRevisionId;
  getOverview(): MilestoneRevisionOverviewDocument;
  getNumber(): number;
  getPreviousRevisionId(): MilestoneRevisionId | undefined;
  getReason(): TextDocument;
  getActor(): ActorRef | undefined;
  getCreatedAt(): string;
  getSources(): MilestoneSourcesDocument;
  getSnapshot(): MilestoneRevisionSnapshotDocument;
  isCurrent(): boolean;
}

export interface MilestoneRevisionsDocument
  extends DocumentCollection<
    MilestoneRevisionId,
    MilestoneRevisionOverviewDocument,
    MilestoneRevisionDocument
  > {
  getCurrent(): MilestoneRevisionDocument;
  getLatest(): MilestoneRevisionDocument;
}

/* -------------------------------------------------------------------------- */
/*                                  Issues                                    */
/* -------------------------------------------------------------------------- */

/**
 * Semantic evaluation issue.
 *
 * These correspond to the existing milestone evaluation reason vocabulary,
 * but are exposed as DOM nodes rather than raw evaluation records.
 */
export interface MilestoneIssueDocument {
  getCode(): EvaluationReasonCode;
  getSubjectId(): string;
  getMessage(): string;
}

export interface MilestoneIssuesDocument {
  getCount(): number;
  isEmpty(): boolean;
  list(options?: DocumentListOptions): readonly MilestoneIssueDocument[];
  hasCode(code: EvaluationReasonCode): boolean;
  getByCode(code: EvaluationReasonCode): readonly MilestoneIssueDocument[];
  getForSubject(subjectId: string): readonly MilestoneIssueDocument[];
}

/* -------------------------------------------------------------------------- */
/*                                 Acceptance                                 */
/* -------------------------------------------------------------------------- */

export interface MilestoneAcceptanceOverviewDocument {
  getId(): AcceptanceId;
  getRevisionId(): MilestoneRevisionId;
  getAcceptedAt(): string;
  getActor(): ActorRef | undefined;
  isCurrent(): boolean;
}

export interface MilestoneAcceptanceSnapshotDocument {
  getRevisionId(): MilestoneRevisionId;
  getSatisfiedCriterionCount(): number;
  getCriterionCount(): number;
  getSatisfiedDeliverableCount(): number;
  getDeliverableCount(): number;
  getBlockingChallengeCount(): number;
  getSatisfiedReviewCount(): number;
  getReviewCount(): number;
  getSatisfiedApprovalCount(): number;
  getApprovalCount(): number;
  getSources(): MilestoneSourcesDocument;
}

export interface MilestoneAcceptanceDocument {
  getId(): AcceptanceId;
  getOverview(): MilestoneAcceptanceOverviewDocument;
  getRevisionId(): MilestoneRevisionId;
  getAcceptedAt(): string;
  getActor(): ActorRef | undefined;
  getSnapshot(): MilestoneAcceptanceSnapshotDocument;
  isCurrent(): boolean;
}

export interface MilestoneAcceptancesDocument
  extends DocumentCollection<
    AcceptanceId,
    MilestoneAcceptanceOverviewDocument,
    MilestoneAcceptanceDocument
  > {
  getCurrent(): MilestoneAcceptanceDocument | undefined;
  hasCurrent(): boolean;
}

/**
 * Evaluation of whether a new/current acceptance may be created.
 */
export interface MilestoneAcceptanceStatusDocument {
  canAccept(): boolean;
  getIssues(): MilestoneIssuesDocument;
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

  getRevisions(): MilestoneRevisionsDocument;
  getCurrentRevision(): MilestoneRevisionDocument;
  getRevision(
    id: MilestoneRevisionId,
  ): MilestoneRevisionDocument | undefined;

  /* ---------------------------------------------------------------------- */
  /* Acceptance                                                             */
  /* ---------------------------------------------------------------------- */

  getAcceptanceStatus(): MilestoneAcceptanceStatusDocument;
  canAccept(): boolean;
  getAcceptanceIssues(): MilestoneIssuesDocument;
  getAcceptances(): MilestoneAcceptancesDocument;
  getCurrentAcceptance(): MilestoneAcceptanceDocument | undefined;

  /* ---------------------------------------------------------------------- */
  /* Completion                                                             */
  /* ---------------------------------------------------------------------- */

  getCompletionStatus(): MilestoneCompletionStatusDocument;
  canComplete(): boolean;
  getCompletionIssues(): MilestoneIssuesDocument;
  getCompletions(): MilestoneCompletionsDocument;
  getCurrentCompletion(): MilestoneCompletionDocument | undefined;
}

