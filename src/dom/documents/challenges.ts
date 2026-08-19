import type {
  ArtifactId,
  ArtifactLinkId,
  ArtifactVersionId,
} from "@elqora/artifacts";

import type {
  ActorRef,
  ChallengeEvidence,
  ChallengeEvidenceId,
  ChallengeEvidenceKind,
  ChallengeEvidenceSource,
  ChallengeEvidenceSourceIssue,
  ChallengeEvidenceSourceResolution,
  ChallengeEvidenceState,
  ChallengeId,
  ChallengeResolution,
  ChallengeResolutionOutcome,
  ChallengeState,
  ChallengeTarget,
  CriterionId,
  DeliverableRequirementId,
  MilestoneChallenge,
  MilestoneRevisionId,
  ReviewId,
} from "../../model/domain.js";

import {
  currentPolicy,
} from "../../services/evaluation.js";

import {
  resolveChallengeEvidenceSources,
} from "../../services/challenge-evidence.js";

import type {
  ChallengeDocument,
  ChallengeEvidenceCollectionDocument,
  ChallengeEvidenceDocument,
  ChallengeEvidenceOverviewDocument,
  ChallengeEvidenceSourceDocument,
  ChallengeEvidenceSourceIssueDocument,
  ChallengeEvidenceSourcesDocument,
  ChallengeOverviewDocument,
  ChallengeResolutionDocument,
  ChallengesDocument,
  ChallengeTargetDocument,
  DocumentListOptions,
  MilestoneDocumentContext,
  MilestoneSourceSnapshotDocument,
  MilestoneSourcesDocument,
  TextDocument,
} from "../types.js";

import {
  indexById,
  requireFromMap,
  sliceCollection,
} from "../internal/collection.js";

import {
  createSourcesDocument,
  MilestoneSourceSnapshotDocumentImpl,
} from "./sources.js";

import {
  createTextDocument,
} from "./text.js";

/* -------------------------------------------------------------------------- */
/*                              Shared helpers                                */
/* -------------------------------------------------------------------------- */

/**
 * Challenge states that represent an unresolved/open challenge.
 *
 * This matches the states considered unresolved by acceptance evaluation.
 */
const OPEN_CHALLENGE_STATES:
  ReadonlySet<ChallengeState> =
    new Set<ChallengeState>([
      "open",
      "under_review",
      "reopened",
    ]);

function challengeIsOpen(
  challenge: MilestoneChallenge,
): boolean {
  return OPEN_CHALLENGE_STATES.has(
    challenge.state,
  );
}

/**
 * Mirrors the challenge-blocking semantics used by evaluateAcceptance().
 *
 * A Challenge blocks current acceptance only when:
 *
 * - it belongs to the current revision,
 * - its severity is blocking,
 * - it remains unresolved,
 * - and the current evaluation policy says blocking Challenges prevent
 *   acceptance.
 */
function challengeIsCurrentlyBlocking(
  challenge: MilestoneChallenge,
  context: MilestoneDocumentContext,
): boolean {
  if (
    challenge.milestoneRevisionId !==
    context.milestone.currentRevisionId
  ) {
    return false;
  }

  if (challenge.severity !== "blocking") {
    return false;
  }

  if (!challengeIsOpen(challenge)) {
    return false;
  }

  return currentPolicy(
    context.milestone,
  ).blockingChallengesPreventAcceptance;
}

/* -------------------------------------------------------------------------- */
/*                             Challenge target                               */
/* -------------------------------------------------------------------------- */

/**
 * DOM wrapper around a Challenge target.
 *
 * ChallengeTarget is a compact discriminated union, but wrapping it keeps
 * callers inside the DOM API rather than requiring them to switch directly
 * over raw domain records.
 */
export class ChallengeTargetDocumentImpl
  implements ChallengeTargetDocument
{
  readonly #target: ChallengeTarget;

  constructor(
    target: ChallengeTarget,
  ) {
    this.#target = target;
  }

  getType(): ChallengeTarget["type"] {
    return this.#target.type;
  }

  getCriterionId(): CriterionId | undefined {
    return this.#target.type === "criterion"
      ? this.#target.criterionId
      : undefined;
  }

  getDeliverableRequirementId():
    | DeliverableRequirementId
    | undefined {
    return this.#target.type ===
      "deliverable_requirement"
      ? this.#target.deliverableRequirementId
      : undefined;
  }

  getReviewId(): ReviewId | undefined {
    return this.#target.type === "review"
      ? this.#target.reviewId
      : undefined;
  }

  getArtifactId(): ArtifactId | undefined {
    return this.#target.type === "artifact"
      ? this.#target.artifactId
      : undefined;
  }

  getArtifactVersionId():
    | ArtifactVersionId
    | undefined {
    return this.#target.type === "artifact"
      ? this.#target.artifactVersionId
      : undefined;
  }

  getReference(): string | undefined {
    return this.#target.type === "evidence"
      ? this.#target.ref
      : undefined;
  }
}


/* -------------------------------------------------------------------------- */
/*                      Challenge evidence Source DOM                         */
/* -------------------------------------------------------------------------- */

/**
 * One successfully resolved canonical Artifact Link backing Challenge
 * evidence.
 */
export class ChallengeEvidenceSourceDocumentImpl
  implements ChallengeEvidenceSourceDocument
{
  readonly #source: ChallengeEvidenceSource;

  constructor(
    source: ChallengeEvidenceSource,
  ) {
    this.#source = source;
  }

  getLinkId(): ArtifactLinkId {
    return this.#source.linkId;
  }

  getRole():
    | "challenge_evidence"
    | "response_evidence" {
    return this.#source.role;
  }

  getArtifactId(): ArtifactId {
    return this.#source.artifactId;
  }

  getArtifactVersionId(): ArtifactVersionId {
    return this.#source.artifactVersionId;
  }
}

/**
 * One resolution problem encountered while resolving canonical Artifact
 * Sources for Challenge evidence.
 */
export class ChallengeEvidenceSourceIssueDocumentImpl
  implements ChallengeEvidenceSourceIssueDocument
{
  readonly #issue: ChallengeEvidenceSourceIssue;

  constructor(
    issue: ChallengeEvidenceSourceIssue,
  ) {
    this.#issue = issue;
  }

  getCode() {
    return this.#issue.code;
  }

  getLinkId(): ArtifactLinkId {
    return this.#issue.linkId;
  }

  getMessage(): string {
    return this.#issue.message;
  }
}

/**
 * Semantic result of resolving Artifact-backed Sources for one evidence
 * record.
 *
 * Status meanings come directly from resolveChallengeEvidenceSources():
 *
 * pending
 *   no usable resolution is available yet, including when Artifact context
 *   was not supplied
 *
 * resolved
 *   all discovered canonical links resolved correctly
 *
 * invalid
 *   one or more canonical evidence links were invalid
 */
export class ChallengeEvidenceSourcesDocumentImpl
  implements ChallengeEvidenceSourcesDocument
{
  readonly #resolution:
    ChallengeEvidenceSourceResolution;

  constructor(
    resolution: ChallengeEvidenceSourceResolution,
  ) {
    this.#resolution = resolution;
  }

  getStatus():
    | "pending"
    | "resolved"
    | "invalid" {
    return this.#resolution.status;
  }

  isPending(): boolean {
    return this.#resolution.status === "pending";
  }

  isResolved(): boolean {
    return this.#resolution.status === "resolved";
  }

  isInvalid(): boolean {
    return this.#resolution.status === "invalid";
  }

  getCount(): number {
    return this.#resolution.sources.length;
  }

  list():
    readonly ChallengeEvidenceSourceDocument[] {
    return this.#resolution.sources.map(
      (source) =>
        new ChallengeEvidenceSourceDocumentImpl(
          source,
        ),
    );
  }

  getIssues():
    readonly ChallengeEvidenceSourceIssueDocument[] {
    return this.#resolution.issues.map(
      (issue) =>
        new ChallengeEvidenceSourceIssueDocumentImpl(
          issue,
        ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                         Challenge evidence overview                        */
/* -------------------------------------------------------------------------- */

export class ChallengeEvidenceOverviewDocumentImpl
  implements ChallengeEvidenceOverviewDocument
{
  readonly #evidence: ChallengeEvidence;
  readonly #description: TextDocument;

  constructor(
    evidence: ChallengeEvidence,
  ) {
    this.#evidence = evidence;

    this.#description = createTextDocument(
      evidence.description,
    );
  }

  getId(): ChallengeEvidenceId {
    return this.#evidence.id;
  }

  getKind(): ChallengeEvidenceKind {
    return this.#evidence.kind;
  }

  getTitle(): string {
    return this.#evidence.title;
  }

  getState(): ChallengeEvidenceState {
    return this.#evidence.state;
  }

  getDescription(): TextDocument {
    return this.#description;
  }
}

/* -------------------------------------------------------------------------- */
/*                         Challenge evidence document                        */
/* -------------------------------------------------------------------------- */

export class ChallengeEvidenceDocumentImpl
  extends ChallengeEvidenceOverviewDocumentImpl
  implements ChallengeEvidenceDocument
{
  readonly #evidence: ChallengeEvidence;
  readonly #context: MilestoneDocumentContext;
  readonly #description: TextDocument;
  readonly #withdrawalReason: TextDocument;

  constructor(
    evidence: ChallengeEvidence,
    context: MilestoneDocumentContext,
  ) {
    super(evidence);

    this.#evidence = evidence;
    this.#context = context;

    this.#description = createTextDocument(
      evidence.description,
    );

    this.#withdrawalReason = createTextDocument(
      evidence.withdrawalReason,
    );
  }

  getOverview():
    ChallengeEvidenceOverviewDocument {
    return new ChallengeEvidenceOverviewDocumentImpl(
      this.#evidence,
    );
  }

  override getKind(): ChallengeEvidenceKind {
    return this.#evidence.kind;
  }

  override getTitle(): string {
    return this.#evidence.title;
  }

  override getDescription(): TextDocument {
    return this.#description;
  }

  override getState(): ChallengeEvidenceState {
    return this.#evidence.state;
  }

  getSupersedesEvidenceId():
    | ChallengeEvidenceId
    | undefined {
    return this.#evidence.supersedesEvidenceId;
  }

  getCreatedBy(): ActorRef | undefined {
    return this.#evidence.createdBy;
  }

  getCreatedAt(): string {
    return this.#evidence.createdAt;
  }

  getWithdrawnBy(): ActorRef | undefined {
    return this.#evidence.withdrawnBy;
  }

  getWithdrawnAt(): string | undefined {
    return this.#evidence.withdrawnAt;
  }

  getWithdrawalReason(): TextDocument {
    return this.#withdrawalReason;
  }

  isWithdrawn(): boolean {
    return this.#evidence.state === "withdrawn";
  }

  /**
   * Resolves canonical Artifact Links backing this evidence through the
   * package's existing evidence resolver.
   *
   * Importantly, this is audit/evidence information and must not itself
   * become a new acceptance gate.
   */
  getSources(): ChallengeEvidenceSourcesDocument {
    return new ChallengeEvidenceSourcesDocumentImpl(
      resolveChallengeEvidenceSources(
        this.#evidence,
        this.#context.artifacts,
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                        Challenge evidence collection                       */
/* -------------------------------------------------------------------------- */

export class ChallengeEvidenceCollectionDocumentImpl
  implements ChallengeEvidenceCollectionDocument
{
  readonly #evidence: readonly ChallengeEvidence[];
  readonly #context: MilestoneDocumentContext;

  readonly #byId: ReadonlyMap<
    ChallengeEvidenceId,
    ChallengeEvidence
  >;

  constructor(
    evidence: readonly ChallengeEvidence[],
    context: MilestoneDocumentContext,
  ) {
    this.#context = context;
    this.#evidence = [...evidence];

    this.#byId = indexById(
      this.#evidence,
      (item) => item.id,
      "Challenge Evidence",
    );
  }

  getCount(): number {
    return this.#evidence.length;
  }

  isEmpty(): boolean {
    return this.#evidence.length === 0;
  }

  has(
    id: ChallengeEvidenceId,
  ): boolean {
    return this.#byId.has(id);
  }

  list(
    options: DocumentListOptions = {},
  ): readonly ChallengeEvidenceOverviewDocument[] {
    return sliceCollection(
      this.#evidence,
      options,
    ).map(
      (evidence) =>
        new ChallengeEvidenceOverviewDocumentImpl(
          evidence,
        ),
    );
  }

  get(
    id: ChallengeEvidenceId,
  ): ChallengeEvidenceDocument | undefined {
    const evidence = this.#byId.get(id);

    if (evidence === undefined) {
      return undefined;
    }

    return this.#createDocument(
      evidence,
    );
  }

  require(
    id: ChallengeEvidenceId,
  ): ChallengeEvidenceDocument {
    return this.#createDocument(
      requireFromMap(
        this.#byId,
        id,
        "Challenge Evidence",
      ),
    );
  }

  getActive():
    readonly ChallengeEvidenceDocument[] {
    return this.#evidence
      .filter(
        (evidence) =>
          evidence.state === "active",
      )
      .map(
        (evidence) =>
          this.#createDocument(evidence),
      );
  }

  getSupporting():
    readonly ChallengeEvidenceDocument[] {
    return this.#evidence
      .filter(
        (evidence) =>
          evidence.kind === "supporting",
      )
      .map(
        (evidence) =>
          this.#createDocument(evidence),
      );
  }

  getResponses():
    readonly ChallengeEvidenceDocument[] {
    return this.#evidence
      .filter(
        (evidence) =>
          evidence.kind === "response",
      )
      .map(
        (evidence) =>
          this.#createDocument(evidence),
      );
  }

  #createDocument(
    evidence: ChallengeEvidence,
  ): ChallengeEvidenceDocument {
    return new ChallengeEvidenceDocumentImpl(
      evidence,
      this.#context,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                         Challenge resolution                               */
/* -------------------------------------------------------------------------- */

export class ChallengeResolutionDocumentImpl
  implements ChallengeResolutionDocument
{
  readonly #resolution: ChallengeResolution;
  readonly #summary: TextDocument;

  constructor(
    resolution: ChallengeResolution,
  ) {
    this.#resolution = resolution;

    this.#summary = createTextDocument(
      resolution.summary,
    );
  }

  getOutcome(): ChallengeResolutionOutcome {
    return this.#resolution.outcome;
  }

  getSummary(): TextDocument {
    return this.#summary;
  }

  getResolvedBy(): ActorRef | undefined {
    return this.#resolution.resolvedBy;
  }

  getResolvedAt(): string {
    return this.#resolution.resolvedAt;
  }

  /**
   * Historical Source state captured at resolution time.
   *
   * We deliberately expose snapshot Documents rather than pretending these
   * are current/live MilestoneSourceLinks.
   */
  getSourceSnapshots():
    readonly MilestoneSourceSnapshotDocument[] {
    return (
      this.#resolution.sourceSnapshot ?? []
    ).map(
      (snapshot) =>
        new MilestoneSourceSnapshotDocumentImpl(
          snapshot,
        ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                           Challenge overview                               */
/* -------------------------------------------------------------------------- */

export class ChallengeOverviewDocumentImpl
  implements ChallengeOverviewDocument
{
  readonly #challenge: MilestoneChallenge;
  readonly #context: MilestoneDocumentContext;
  readonly #reason: TextDocument;

  constructor(
    challenge: MilestoneChallenge,
    context: MilestoneDocumentContext,
  ) {
    this.#challenge = challenge;
    this.#context = context;

    this.#reason = createTextDocument(
      challenge.reason,
    );
  }

  getId(): ChallengeId {
    return this.#challenge.id;
  }

  getRevisionId(): MilestoneRevisionId {
    return this.#challenge.milestoneRevisionId;
  }

  getTarget(): ChallengeTargetDocument {
    return new ChallengeTargetDocumentImpl(
      this.#challenge.target,
    );
  }

  getState(): ChallengeState {
    return this.#challenge.state;
  }

  getSeverity():
    | "non_blocking"
    | "blocking" {
    return this.#challenge.severity;
  }

  getReason(): TextDocument {
    return this.#reason;
  }

  /**
   * Semantic blocking status for the CURRENT milestone revision.
   *
   * This is stronger than:
   *
   *   severity === "blocking"
   */
  isBlocking(): boolean {
    return challengeIsCurrentlyBlocking(
      this.#challenge,
      this.#context,
    );
  }

  isOpen(): boolean {
    return challengeIsOpen(
      this.#challenge,
    );
  }

  isCurrentRevision(): boolean {
    return (
      this.#challenge.milestoneRevisionId ===
      this.#context.milestone.currentRevisionId
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                           Challenge document                               */
/* -------------------------------------------------------------------------- */

export class ChallengeDocumentImpl
  extends ChallengeOverviewDocumentImpl
  implements ChallengeDocument
{
  readonly #challenge: MilestoneChallenge;
  readonly #context: MilestoneDocumentContext;
  readonly #reason: TextDocument;

  constructor(
    challenge: MilestoneChallenge,
    context: MilestoneDocumentContext,
  ) {
    super(
      challenge,
      context,
    );

    this.#challenge = challenge;
    this.#context = context;

    this.#reason = createTextDocument(
      challenge.reason,
    );
  }

  getOverview(): ChallengeOverviewDocument {
    return new ChallengeOverviewDocumentImpl(
      this.#challenge,
      this.#context,
    );
  }

  override getRevisionId(): MilestoneRevisionId {
    return this.#challenge.milestoneRevisionId;
  }

  override getTarget(): ChallengeTargetDocument {
    return new ChallengeTargetDocumentImpl(
      this.#challenge.target,
    );
  }

  override getReason(): TextDocument {
    return this.#reason;
  }

  override getState(): ChallengeState {
    return this.#challenge.state;
  }

  override getSeverity():
    | "non_blocking"
    | "blocking" {
    return this.#challenge.severity;
  }

  override isBlocking(): boolean {
    return challengeIsCurrentlyBlocking(
      this.#challenge,
      this.#context,
    );
  }

  override isOpen(): boolean {
    return challengeIsOpen(
      this.#challenge,
    );
  }

  override isCurrentRevision(): boolean {
    return (
      this.#challenge.milestoneRevisionId ===
      this.#context.milestone.currentRevisionId
    );
  }

  getRaisedBy(): ActorRef | undefined {
    return this.#challenge.raisedBy;
  }

  getCreatedAt(): string {
    return this.#challenge.createdAt;
  }

  getResolution():
    | ChallengeResolutionDocument
    | undefined {
    if (
      this.#challenge.resolution === undefined
    ) {
      return undefined;
    }

    return new ChallengeResolutionDocumentImpl(
      this.#challenge.resolution,
    );
  }

  getEvidence():
    ChallengeEvidenceCollectionDocument {
    return new ChallengeEvidenceCollectionDocumentImpl(
      this.#challenge.evidence,
      this.#context,
    );
  }

  /**
   * Ordinary Milestone Sources attached directly to this Challenge.
   *
   * These are intentionally separate from Challenge Evidence Artifact Links.
   */
  getSources(): MilestoneSourcesDocument {
    return createSourcesDocument(
      this.#challenge.sourceLinks,
      this.#context.artifacts,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                           Challenges collection                            */
/* -------------------------------------------------------------------------- */

export class ChallengesDocumentImpl
  implements ChallengesDocument
{
  readonly #context: MilestoneDocumentContext;

  readonly #challenges:
    readonly MilestoneChallenge[];

  readonly #byId: ReadonlyMap<
    ChallengeId,
    MilestoneChallenge
  >;

  constructor(
    context: MilestoneDocumentContext,
  ) {
    this.#context = context;

    this.#challenges = [
      ...context.milestone.challenges,
    ];

    this.#byId = indexById(
      this.#challenges,
      (challenge) => challenge.id,
      "Challenge",
    );
  }

  getCount(): number {
    return this.#challenges.length;
  }

  isEmpty(): boolean {
    return this.#challenges.length === 0;
  }

  has(
    id: ChallengeId,
  ): boolean {
    return this.#byId.has(id);
  }

  list(
    options: DocumentListOptions = {},
  ): readonly ChallengeOverviewDocument[] {
    return sliceCollection(
      this.#challenges,
      options,
    ).map(
      (challenge) =>
        new ChallengeOverviewDocumentImpl(
          challenge,
          this.#context,
        ),
    );
  }

  get(
    id: ChallengeId,
  ): ChallengeDocument | undefined {
    const challenge = this.#byId.get(id);

    return challenge === undefined
      ? undefined
      : this.#createDocument(challenge);
  }

  require(
    id: ChallengeId,
  ): ChallengeDocument {
    return this.#createDocument(
      requireFromMap(
        this.#byId,
        id,
        "Challenge",
      ),
    );
  }

  getOpen(): readonly ChallengeDocument[] {
    return this.#challenges
      .filter(challengeIsOpen)
      .map(
        (challenge) =>
          this.#createDocument(challenge),
      );
  }

  /**
   * Returns only Challenges that actually block CURRENT acceptance.
   *
   * Historical blocking-severity Challenges do not appear here.
   */
  getBlocking():
    readonly ChallengeDocument[] {
    return this.#challenges
      .filter(
        (challenge) =>
          challengeIsCurrentlyBlocking(
            challenge,
            this.#context,
          ),
      )
      .map(
        (challenge) =>
          this.#createDocument(challenge),
      );
  }

  getResolved():
    readonly ChallengeDocument[] {
    return this.#challenges
      .filter(
        (challenge) =>
          challenge.state === "resolved",
      )
      .map(
        (challenge) =>
          this.#createDocument(challenge),
      );
  }

  getByState(
    state: ChallengeState,
  ): readonly ChallengeDocument[] {
    return this.#challenges
      .filter(
        (challenge) =>
          challenge.state === state,
      )
      .map(
        (challenge) =>
          this.#createDocument(challenge),
      );
  }

  getForRevision(
    revisionId: MilestoneRevisionId,
  ): readonly ChallengeDocument[] {
    return this.#challenges
      .filter(
        (challenge) =>
          challenge.milestoneRevisionId ===
          revisionId,
      )
      .map(
        (challenge) =>
          this.#createDocument(challenge),
      );
  }

  getCurrentRevision():
    readonly ChallengeDocument[] {
    return this.getForRevision(
      this.#context.milestone.currentRevisionId,
    );
  }

  #createDocument(
    challenge: MilestoneChallenge,
  ): ChallengeDocument {
    return new ChallengeDocumentImpl(
      challenge,
      this.#context,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                 Factories                                  */
/* -------------------------------------------------------------------------- */

export function createChallengesDocument(
  context: MilestoneDocumentContext,
): ChallengesDocument {
  return new ChallengesDocumentImpl(
    context,
  );
}

export function createChallengeDocument(
  challenge: MilestoneChallenge,
  context: MilestoneDocumentContext,
): ChallengeDocument {
  return new ChallengeDocumentImpl(
    challenge,
    context,
  );
}
