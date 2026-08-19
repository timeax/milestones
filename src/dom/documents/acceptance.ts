import type {
  ArtifactId,
  ArtifactRequirementId,
  ArtifactSubmissionId,
  ArtifactVerificationId,
  ArtifactVersionId,
} from "@elqora/artifacts";

import type {
  AcceptanceId,
  AcceptanceEvaluation,
  ActorRef,
  ApprovalAcceptanceSnapshot,
  ApprovalStageId,
  ArtifactEvaluationSnapshot,
  ChallengeAcceptanceSnapshot,
  ChallengeEvidenceAcceptanceSnapshot,
  ChallengeEvidenceId,
  ChallengeEvidenceKind,
  ChallengeEvidenceState,
  ChallengeId,
  ChallengeState,
  CriterionAcceptanceSnapshot,
  CriterionId,
  CriterionState,
  DeliverableAcceptanceSnapshot,
  DeliverableRequirementId,
  DeliverableRequirementState,
  DependencyAcceptanceSnapshot,
  DependencyId,
  MilestoneAcceptance,
  MilestoneAcceptanceSnapshot,
  MilestoneDependencyGate,
  MilestoneId,
  MilestoneRevisionId,
  ReviewAcceptanceSnapshot,
  ReviewId,
  ReviewResult,
  ReviewState,
} from "../../model/domain.js";

import {
  evaluateAcceptance,
} from "../../services/evaluation.js";

import type {
  AcceptanceDocument,
  AcceptanceHistoryDocument,
  AcceptanceOverviewDocument,
  AcceptanceStatusDocument,
  ApprovalAcceptanceSnapshotDocument,
  ArtifactAcceptanceSnapshotDocument,
  ChallengeAcceptanceSnapshotDocument,
  ChallengeEvidenceAcceptanceSnapshotDocument,
  ChallengeEvidenceSourceDocument,
  ChallengeResolutionDocument,
  ChallengeTargetDocument,
  CriterionAcceptanceSnapshotDocument,
  DeliverableAcceptanceSnapshotDocument,
  DependencyAcceptanceSnapshotDocument,
  DocumentListOptions,
  MilestoneAcceptanceSnapshotDocument,
  MilestoneDocumentContext,
  MilestoneIssuesDocument,
  MilestoneSourceSnapshotDocument,
  ReviewAcceptanceSnapshotDocument,
  TextDocument,
} from "../types.js";

import {
  indexById,
  requireFromMap,
  sliceCollection,
} from "../internal/collection.js";

import {
  ChallengeEvidenceSourceDocumentImpl,
  ChallengeResolutionDocumentImpl,
  ChallengeTargetDocumentImpl,
} from "./challenges.js";

import {
  createIssuesDocument,
} from "./issues.js";

import {
  MilestoneSourceSnapshotDocumentImpl,
} from "./sources.js";

import {
  createTextDocument,
} from "./text.js";

/* -------------------------------------------------------------------------- */
/*                       Criterion acceptance snapshot                        */
/* -------------------------------------------------------------------------- */

export class CriterionAcceptanceSnapshotDocumentImpl
  implements CriterionAcceptanceSnapshotDocument
{
  readonly #snapshot:
    CriterionAcceptanceSnapshot;

  constructor(
    snapshot: CriterionAcceptanceSnapshot,
  ) {
    this.#snapshot = snapshot;
  }

  getId(): CriterionId {
    return this.#snapshot.id;
  }

  getState(): CriterionState {
    return this.#snapshot.state;
  }

  isSatisfied(): boolean {
    return this.#snapshot.satisfied;
  }
}

/* -------------------------------------------------------------------------- */
/*                     Deliverable acceptance snapshot                        */
/* -------------------------------------------------------------------------- */

export class DeliverableAcceptanceSnapshotDocumentImpl
  implements DeliverableAcceptanceSnapshotDocument
{
  readonly #snapshot:
    DeliverableAcceptanceSnapshot;

  constructor(
    snapshot: DeliverableAcceptanceSnapshot,
  ) {
    this.#snapshot = snapshot;
  }

  getId(): DeliverableRequirementId {
    return this.#snapshot.id;
  }

  getState():
    DeliverableRequirementState {
    return this.#snapshot.state;
  }

  isSatisfied(): boolean {
    return this.#snapshot.satisfied;
  }
}

/* -------------------------------------------------------------------------- */
/*                     Dependency acceptance snapshot                         */
/* -------------------------------------------------------------------------- */

export class DependencyAcceptanceSnapshotDocumentImpl
  implements DependencyAcceptanceSnapshotDocument
{
  readonly #snapshot:
    DependencyAcceptanceSnapshot;

  constructor(
    snapshot: DependencyAcceptanceSnapshot,
  ) {
    this.#snapshot = snapshot;
  }

  getId(): DependencyId {
    return this.#snapshot.id;
  }

  getDependsOnMilestoneId(): MilestoneId {
    return this.#snapshot.dependsOnMilestoneId;
  }

  getDependsOnRevisionId():
    | MilestoneRevisionId
    | undefined {
    return this.#snapshot.dependsOnRevisionId;
  }

  getGate(): MilestoneDependencyGate {
    return structuredClone(
      this.#snapshot.gate,
    );
  }

  isBlocking(): boolean {
    return this.#snapshot.blocking;
  }

  isSatisfied(): boolean {
    return this.#snapshot.satisfied;
  }
}

/* -------------------------------------------------------------------------- */
/*                  Challenge evidence acceptance snapshot                    */
/* -------------------------------------------------------------------------- */

export class ChallengeEvidenceAcceptanceSnapshotDocumentImpl
  implements ChallengeEvidenceAcceptanceSnapshotDocument
{
  readonly #snapshot:
    ChallengeEvidenceAcceptanceSnapshot;

  readonly #description: TextDocument;

  constructor(
    snapshot:
      ChallengeEvidenceAcceptanceSnapshot,
  ) {
    this.#snapshot = snapshot;

    this.#description = createTextDocument(
      snapshot.description,
    );
  }

  getId(): ChallengeEvidenceId {
    return this.#snapshot.id;
  }

  getKind(): ChallengeEvidenceKind {
    return this.#snapshot.kind;
  }

  getTitle(): string {
    return this.#snapshot.title;
  }

  getDescription(): TextDocument {
    return this.#description;
  }

  getState(): ChallengeEvidenceState {
    return this.#snapshot.state;
  }

  getSupersedesEvidenceId():
    | ChallengeEvidenceId
    | undefined {
    return this.#snapshot
      .supersedesEvidenceId;
  }

  getSourceStatus():
    | "pending"
    | "resolved"
    | "invalid" {
    return this.#snapshot.sourceStatus;
  }

  getSources():
    readonly ChallengeEvidenceSourceDocument[] {
    return this.#snapshot.sources.map(
      (source) =>
        new ChallengeEvidenceSourceDocumentImpl(
          source,
        ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                     Challenge acceptance snapshot                          */
/* -------------------------------------------------------------------------- */

export class ChallengeAcceptanceSnapshotDocumentImpl
  implements ChallengeAcceptanceSnapshotDocument
{
  readonly #snapshot:
    ChallengeAcceptanceSnapshot;

  constructor(
    snapshot: ChallengeAcceptanceSnapshot,
  ) {
    this.#snapshot = snapshot;
  }

  getId(): ChallengeId {
    return this.#snapshot.id;
  }

  getTarget(): ChallengeTargetDocument {
    return new ChallengeTargetDocumentImpl(
      this.#snapshot.target,
    );
  }

  getSeverity():
    | "non_blocking"
    | "blocking" {
    return this.#snapshot.severity;
  }

  getState(): ChallengeState {
    return this.#snapshot.state;
  }

  isBlocking(): boolean {
    return this.#snapshot.blocking;
  }

  getResolution():
    | ChallengeResolutionDocument
    | undefined {
    if (
      this.#snapshot.resolution === undefined
    ) {
      return undefined;
    }

    return new ChallengeResolutionDocumentImpl(
      this.#snapshot.resolution,
    );
  }

  getEvidence():
    readonly ChallengeEvidenceAcceptanceSnapshotDocument[] {
    return this.#snapshot.evidence.map(
      (evidence) =>
        new ChallengeEvidenceAcceptanceSnapshotDocumentImpl(
          evidence,
        ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                       Review acceptance snapshot                           */
/* -------------------------------------------------------------------------- */

export class ReviewAcceptanceSnapshotDocumentImpl
  implements ReviewAcceptanceSnapshotDocument
{
  readonly #snapshot:
    ReviewAcceptanceSnapshot;

  constructor(
    snapshot: ReviewAcceptanceSnapshot,
  ) {
    this.#snapshot = snapshot;
  }

  getId(): ReviewId {
    return this.#snapshot.id;
  }

  getRevisionId(): MilestoneRevisionId {
    return this.#snapshot
      .milestoneRevisionId;
  }

  getState(): ReviewState {
    return this.#snapshot.state;
  }

  getResult(): ReviewResult | undefined {
    return this.#snapshot.result;
  }

  getArtifactVersionIds():
    readonly ArtifactVersionId[] {
    return [
      ...this.#snapshot.artifactVersionIds,
    ];
  }

  isSatisfied(): boolean {
    return this.#snapshot.satisfied;
  }
}

/* -------------------------------------------------------------------------- */
/*                      Approval acceptance snapshot                          */
/* -------------------------------------------------------------------------- */

export class ApprovalAcceptanceSnapshotDocumentImpl
  implements ApprovalAcceptanceSnapshotDocument
{
  readonly #snapshot:
    ApprovalAcceptanceSnapshot;

  constructor(
    snapshot: ApprovalAcceptanceSnapshot,
  ) {
    this.#snapshot = snapshot;
  }

  getStageId(): ApprovalStageId {
    return this.#snapshot.stageId;
  }

  getRevisionId(): MilestoneRevisionId {
    return this.#snapshot
      .milestoneRevisionId;
  }

  getEffectiveApprovalCount(): number {
    return this.#snapshot
      .effectiveApprovalCount;
  }

  getRequiredApprovalCount(): number {
    return this.#snapshot
      .requiredApprovalCount;
  }

  isSatisfied(): boolean {
    return this.#snapshot.satisfied;
  }

  isWaived(): boolean {
    return this.#snapshot.waived;
  }

  getActorIds(): readonly string[] {
    return [
      ...this.#snapshot.actorIds,
    ];
  }
}

/* -------------------------------------------------------------------------- */
/*                      Artifact acceptance snapshot                          */
/* -------------------------------------------------------------------------- */

export class ArtifactAcceptanceSnapshotDocumentImpl
  implements ArtifactAcceptanceSnapshotDocument
{
  readonly #snapshot:
    ArtifactEvaluationSnapshot;

  constructor(
    snapshot: ArtifactEvaluationSnapshot,
  ) {
    this.#snapshot = snapshot;
  }

  getArtifactRequirementId():
    ArtifactRequirementId {
    return this.#snapshot
      .artifactRequirementId;
  }

  getArtifactId(): ArtifactId {
    return this.#snapshot.artifactId;
  }

  getArtifactVersionId():
    | ArtifactVersionId
    | undefined {
    return this.#snapshot
      .artifactVersionId;
  }

  getSubmissionId():
    | ArtifactSubmissionId
    | undefined {
    return this.#snapshot.submissionId;
  }

  getVerificationId():
    | ArtifactVerificationId
    | undefined {
    return this.#snapshot.verificationId;
  }

  getOutcome():
    | "satisfied"
    | "failed"
    | "waived" {
    return this.#snapshot.outcome;
  }
}

/* -------------------------------------------------------------------------- */
/*                       Acceptance snapshot document                         */
/* -------------------------------------------------------------------------- */

/**
 * Immutable semantic representation of an Acceptance snapshot.
 *
 * This class never re-evaluates anything.
 *
 * It works equally well for:
 *
 * - the prospective snapshot returned by evaluateAcceptance(), and
 * - a historical snapshot stored inside MilestoneAcceptance.
 */
export class MilestoneAcceptanceSnapshotDocumentImpl
  implements MilestoneAcceptanceSnapshotDocument
{
  readonly #snapshot:
    MilestoneAcceptanceSnapshot;

  constructor(
    snapshot: MilestoneAcceptanceSnapshot,
  ) {
    this.#snapshot = snapshot;
  }

  getRevisionId(): MilestoneRevisionId {
    return this.#snapshot.revisionId;
  }

  getCriteria():
    readonly CriterionAcceptanceSnapshotDocument[] {
    return this.#snapshot.criteria.map(
      (snapshot) =>
        new CriterionAcceptanceSnapshotDocumentImpl(
          snapshot,
        ),
    );
  }

  getDeliverables():
    readonly DeliverableAcceptanceSnapshotDocument[] {
    return this.#snapshot.deliverables.map(
      (snapshot) =>
        new DeliverableAcceptanceSnapshotDocumentImpl(
          snapshot,
        ),
    );
  }

  getDependencies():
    readonly DependencyAcceptanceSnapshotDocument[] {
    return this.#snapshot.dependencies.map(
      (snapshot) =>
        new DependencyAcceptanceSnapshotDocumentImpl(
          snapshot,
        ),
    );
  }

  getChallenges():
    readonly ChallengeAcceptanceSnapshotDocument[] {
    return this.#snapshot.challenges.map(
      (snapshot) =>
        new ChallengeAcceptanceSnapshotDocumentImpl(
          snapshot,
        ),
    );
  }

  getReviews():
    readonly ReviewAcceptanceSnapshotDocument[] {
    return this.#snapshot.reviews.map(
      (snapshot) =>
        new ReviewAcceptanceSnapshotDocumentImpl(
          snapshot,
        ),
    );
  }

  getApprovals():
    readonly ApprovalAcceptanceSnapshotDocument[] {
    return this.#snapshot.approvals.map(
      (snapshot) =>
        new ApprovalAcceptanceSnapshotDocumentImpl(
          snapshot,
        ),
    );
  }

  getArtifacts():
    readonly ArtifactAcceptanceSnapshotDocument[] {
    return this.#snapshot.artifacts.map(
      (snapshot) =>
        new ArtifactAcceptanceSnapshotDocumentImpl(
          snapshot,
        ),
    );
  }

  /**
   * Resolved Source state captured by the Acceptance snapshot.
   *
   * No current Artifact resolution occurs here.
   */
  getSources():
    readonly MilestoneSourceSnapshotDocument[] {
    return (
      this.#snapshot.sources ?? []
    ).map(
      (snapshot) =>
        new MilestoneSourceSnapshotDocumentImpl(
          snapshot,
        ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                          Acceptance overview                               */
/* -------------------------------------------------------------------------- */

export class AcceptanceOverviewDocumentImpl
  implements AcceptanceOverviewDocument
{
  readonly #acceptance: MilestoneAcceptance;
  readonly #context: MilestoneDocumentContext;

  constructor(
    acceptance: MilestoneAcceptance,
    context: MilestoneDocumentContext,
  ) {
    this.#acceptance = acceptance;
    this.#context = context;
  }

  getId(): AcceptanceId {
    return this.#acceptance.id;
  }

  getRevisionId(): MilestoneRevisionId {
    return this.#acceptance
      .milestoneRevisionId;
  }

  getAcceptedAt(): string {
    return this.#acceptance.acceptedAt;
  }

  /**
   * Current means the Milestone currently points to this Acceptance record,
   * not merely that this record happens to belong to the current revision.
   */
  isCurrent(): boolean {
    return (
      this.#context.milestone
        .currentAcceptanceId ===
      this.#acceptance.id
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                           Acceptance document                              */
/* -------------------------------------------------------------------------- */

export class AcceptanceDocumentImpl
  extends AcceptanceOverviewDocumentImpl
  implements AcceptanceDocument
{
  readonly #acceptance: MilestoneAcceptance;
  readonly #context: MilestoneDocumentContext;

  constructor(
    acceptance: MilestoneAcceptance,
    context: MilestoneDocumentContext,
  ) {
    super(
      acceptance,
      context,
    );

    this.#acceptance = acceptance;
    this.#context = context;
  }

  getOverview(): AcceptanceOverviewDocument {
    return new AcceptanceOverviewDocumentImpl(
      this.#acceptance,
      this.#context,
    );
  }

  override getRevisionId(): MilestoneRevisionId {
    return this.#acceptance
      .milestoneRevisionId;
  }

  override getAcceptedAt(): string {
    return this.#acceptance.acceptedAt;
  }

  getActor(): ActorRef | undefined {
    return this.#acceptance.actor;
  }

  override isCurrent(): boolean {
    return (
      this.#context.milestone
        .currentAcceptanceId ===
      this.#acceptance.id
    );
  }

  getSnapshot():
    MilestoneAcceptanceSnapshotDocument {
    return new MilestoneAcceptanceSnapshotDocumentImpl(
      this.#acceptance.snapshot,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                         Acceptance history                                 */
/* -------------------------------------------------------------------------- */

export class AcceptanceHistoryDocumentImpl
  implements AcceptanceHistoryDocument
{
  readonly #context: MilestoneDocumentContext;

  readonly #records:
    readonly MilestoneAcceptance[];

  readonly #byId: ReadonlyMap<
    AcceptanceId,
    MilestoneAcceptance
  >;

  constructor(
    context: MilestoneDocumentContext,
  ) {
    this.#context = context;

    this.#records = [
      ...context.milestone
        .acceptanceRecords,
    ];

    this.#byId = indexById(
      this.#records,
      (record) => record.id,
      "Acceptance",
    );
  }

  getCount(): number {
    return this.#records.length;
  }

  isEmpty(): boolean {
    return this.#records.length === 0;
  }

  has(
    id: AcceptanceId,
  ): boolean {
    return this.#byId.has(id);
  }

  /**
   * Acceptance history is returned newest-first.
   */
  list(
    options: DocumentListOptions = {},
  ): readonly AcceptanceOverviewDocument[] {
    return sliceCollection(
      this.#orderedNewestFirst(),
      options,
    ).map(
      (record) =>
        new AcceptanceOverviewDocumentImpl(
          record,
          this.#context,
        ),
    );
  }

  get(
    id: AcceptanceId,
  ): AcceptanceDocument | undefined {
    const record = this.#byId.get(id);

    return record === undefined
      ? undefined
      : this.#createDocument(record);
  }

  require(
    id: AcceptanceId,
  ): AcceptanceDocument {
    return this.#createDocument(
      requireFromMap(
        this.#byId,
        id,
        "Acceptance",
      ),
    );
  }

  getForRevision(
    revisionId: MilestoneRevisionId,
  ): readonly AcceptanceDocument[] {
    return this.#orderedNewestFirst()
      .filter(
        (record) =>
          record.milestoneRevisionId ===
          revisionId,
      )
      .map(
        (record) =>
          this.#createDocument(record),
      );
  }

  getLatest():
    AcceptanceDocument | undefined {
    const latest =
      this.#orderedNewestFirst()[0];

    return latest === undefined
      ? undefined
      : this.#createDocument(latest);
  }

  #orderedNewestFirst():
    readonly MilestoneAcceptance[] {
    return this.#records
      .slice()
      .sort(
        (left, right) =>
          right.acceptedAt.localeCompare(
            left.acceptedAt,
          ) ||
          right.id.localeCompare(left.id),
      );
  }

  #createDocument(
    record: MilestoneAcceptance,
  ): AcceptanceDocument {
    return new AcceptanceDocumentImpl(
      record,
      this.#context,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                          Acceptance status                                 */
/* -------------------------------------------------------------------------- */

/**
 * Current semantic Acceptance status for one Milestone.
 *
 * This is the one place in the Acceptance DOM that runs evaluateAcceptance().
 *
 * Historical AcceptanceDocument instances never do.
 */
export class AcceptanceStatusDocumentImpl
  implements AcceptanceStatusDocument
{
  readonly #context: MilestoneDocumentContext;

  readonly #evaluation:
    AcceptanceEvaluation;

  readonly #history:
    AcceptanceHistoryDocument;

  constructor(
    context: MilestoneDocumentContext,
  ) {
    this.#context = context;

    this.#evaluation = evaluateAcceptance(
      context.milestone,
      context.profile,
      context.graph,
      context.artifacts,
    );

    this.#history =
      new AcceptanceHistoryDocumentImpl(
        context,
      );
  }

  /**
   * Whether the Milestone currently HAS an effective Acceptance record.
   *
   * This deliberately does not mean "would evaluation pass right now?"
   */
  isAccepted(): boolean {
    return this.getCurrent() !== undefined;
  }

  /**
   * Whether current authoritative evaluation would allow Acceptance now.
   */
  canAccept(): boolean {
    return this.#evaluation.accepted;
  }

  getIssues(): MilestoneIssuesDocument {
    return createIssuesDocument(
      this.#evaluation.reasons,
    );
  }

  /**
   * Prospective snapshot generated by current evaluation.
   *
   * It becomes an immutable historical Acceptance snapshot only if an Editor
   * actually creates an Acceptance record using it.
   */
  getEvaluationSnapshot():
    MilestoneAcceptanceSnapshotDocument {
    return new MilestoneAcceptanceSnapshotDocumentImpl(
      this.#evaluation.snapshot,
    );
  }

  getCurrent():
    AcceptanceDocument | undefined {
    const id =
      this.#context.milestone
        .currentAcceptanceId;

    if (id === undefined) {
      return undefined;
    }

    return this.#history.get(id);
  }

  getHistory():
    AcceptanceHistoryDocument {
    return this.#history;
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Factories                                 */
/* -------------------------------------------------------------------------- */

export function createAcceptanceStatusDocument(
  context: MilestoneDocumentContext,
): AcceptanceStatusDocument {
  return new AcceptanceStatusDocumentImpl(
    context,
  );
}

export function createAcceptanceDocument(
  acceptance: MilestoneAcceptance,
  context: MilestoneDocumentContext,
): AcceptanceDocument {
  return new AcceptanceDocumentImpl(
    acceptance,
    context,
  );
}

export function createAcceptanceSnapshotDocument(
  snapshot: MilestoneAcceptanceSnapshot,
): MilestoneAcceptanceSnapshotDocument {
  return new MilestoneAcceptanceSnapshotDocumentImpl(
    snapshot,
  );
}
