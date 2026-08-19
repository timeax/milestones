import type {
  ArtifactVersionId,
} from "@elqora/artifacts";

import type {
  ActorRef,
  MilestoneReview,
  MilestoneRevisionId,
  ReviewId,
  ReviewResult,
  ReviewState,
} from "../../model/domain.js";

import {
  currentPolicy,
} from "../../services/evaluation.js";

import type {
  DocumentListOptions,
  MilestoneDocumentContext,
  MilestoneSourceSnapshotDocument,
  MilestoneSourcesDocument,
  ReviewDocument,
  ReviewOverviewDocument,
  ReviewsDocument,
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
/*                              Review helpers                                */
/* -------------------------------------------------------------------------- */

/**
 * Whether the Review itself reached a successful conclusion.
 *
 * This says nothing about whether the Review belongs to the current
 * Milestone revision.
 */
function reviewIsAccepted(
  review: MilestoneReview,
  context: MilestoneDocumentContext,
): boolean {
  const policy = currentPolicy(
    context.milestone,
  );

  return (
    review.state === "completed" &&
    review.result ===
      policy.requiredReviewResult
  );
}

/**
 * Whether this Review satisfies the Review portion of CURRENT milestone
 * acceptance.
 *
 * A historically accepted Review does not satisfy a later revision.
 */
function reviewSatisfiesCurrentAcceptance(
  review: MilestoneReview,
  context: MilestoneDocumentContext,
): boolean {
  return (
    review.milestoneRevisionId ===
      context.milestone.currentRevisionId &&
    reviewIsAccepted(
      review,
      context,
    )
  );
}

/**
 * Review states that still represent unfinished work.
 *
 * Cancelled Reviews are intentionally not pending.
 */
function reviewIsPending(
  review: MilestoneReview,
): boolean {
  return (
    review.state === "requested" ||
    review.state === "in_progress"
  );
}

/* -------------------------------------------------------------------------- */
/*                              Review overview                               */
/* -------------------------------------------------------------------------- */

/**
 * Lightweight semantic view of a Review.
 *
 * Even here, Summary remains a TextDocument because review summaries may
 * contain substantial feedback and should not be forced into collection
 * listings.
 */
export class ReviewOverviewDocumentImpl
  implements ReviewOverviewDocument
{
  readonly #review: MilestoneReview;
  readonly #context: MilestoneDocumentContext;
  readonly #summary: TextDocument;

  constructor(
    review: MilestoneReview,
    context: MilestoneDocumentContext,
  ) {
    this.#review = review;
    this.#context = context;

    this.#summary = createTextDocument(
      review.summary,
    );
  }

  getId(): ReviewId {
    return this.#review.id;
  }

  getRevisionId(): MilestoneRevisionId {
    return this.#review.milestoneRevisionId;
  }

  getState(): ReviewState {
    return this.#review.state;
  }

  getResult(): ReviewResult | undefined {
    return this.#review.result;
  }

  getSummary(): TextDocument {
    return this.#summary;
  }

  isCompleted(): boolean {
    return this.#review.state === "completed";
  }

  /**
   * Whether this Review itself concluded with the result required by the
   * current evaluation policy.
   *
   * Historical Reviews can therefore still be "accepted" Reviews even though
   * they no longer satisfy current milestone acceptance.
   */
  isAccepted(): boolean {
    return reviewIsAccepted(
      this.#review,
      this.#context,
    );
  }

  isCurrentRevision(): boolean {
    return (
      this.#review.milestoneRevisionId ===
      this.#context.milestone.currentRevisionId
    );
  }

  satisfiesCurrentAcceptance(): boolean {
    return reviewSatisfiesCurrentAcceptance(
      this.#review,
      this.#context,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                               Review document                              */
/* -------------------------------------------------------------------------- */

/**
 * Complete read-only DOM representation of one Milestone Review.
 */
export class ReviewDocumentImpl
  extends ReviewOverviewDocumentImpl
  implements ReviewDocument
{
  readonly #review: MilestoneReview;
  readonly #context: MilestoneDocumentContext;
  readonly #summary: TextDocument;

  constructor(
    review: MilestoneReview,
    context: MilestoneDocumentContext,
  ) {
    super(
      review,
      context,
    );

    this.#review = review;
    this.#context = context;

    this.#summary = createTextDocument(
      review.summary,
    );
  }

  getOverview(): ReviewOverviewDocument {
    return new ReviewOverviewDocumentImpl(
      this.#review,
      this.#context,
    );
  }

  override getRevisionId(): MilestoneRevisionId {
    return this.#review.milestoneRevisionId;
  }

  override getState(): ReviewState {
    return this.#review.state;
  }

  override getResult(): ReviewResult | undefined {
    return this.#review.result;
  }

  /**
   * Potentially large Review narrative.
   */
  override getSummary(): TextDocument {
    return this.#summary;
  }

  getRequestedBy(): ActorRef | undefined {
    return this.#review.requestedBy;
  }

  getAssignedReviewer():
    | ActorRef
    | undefined {
    return this.#review.assignedReviewer;
  }

  getCompletedBy(): ActorRef | undefined {
    return this.#review.completedBy;
  }

  getCreatedAt(): string {
    return this.#review.createdAt;
  }

  getCompletedAt(): string | undefined {
    return this.#review.completedAt;
  }

  /**
   * Artifact Versions explicitly associated with this Review.
   *
   * A fresh array is returned so DOM consumers cannot mutate the underlying
   * domain collection.
   */
  getArtifactVersionIds():
    readonly ArtifactVersionId[] {
    return [
      ...(this.#review.artifactVersionIds ?? []),
    ];
  }

  /**
   * Current/live Milestone Sources attached directly to this Review.
   */
  getSources(): MilestoneSourcesDocument {
    return createSourcesDocument(
      this.#review.sourceLinks,
      this.#context.artifacts,
    );
  }

  /**
   * Historical Source state captured with the Review.
   *
   * These snapshots must not be confused with getSources(), which exposes
   * current Source links.
   */
  getSourceSnapshots():
    readonly MilestoneSourceSnapshotDocument[] {
    return (
      this.#review.sourceSnapshot ?? []
    ).map(
      (snapshot) =>
        new MilestoneSourceSnapshotDocumentImpl(
          snapshot,
        ),
    );
  }

  override isCompleted(): boolean {
    return this.#review.state === "completed";
  }

  override isAccepted(): boolean {
    return reviewIsAccepted(
      this.#review,
      this.#context,
    );
  }

  override isCurrentRevision(): boolean {
    return (
      this.#review.milestoneRevisionId ===
      this.#context.milestone.currentRevisionId
    );
  }

  override satisfiesCurrentAcceptance(): boolean {
    return reviewSatisfiesCurrentAcceptance(
      this.#review,
      this.#context,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                              Reviews collection                            */
/* -------------------------------------------------------------------------- */

/**
 * Read-only collection of all Reviews recorded on a Milestone.
 *
 * Historical Reviews remain queryable; current-revision filtering is explicit
 * rather than silently hiding previous review history.
 */
export class ReviewsDocumentImpl
  implements ReviewsDocument
{
  readonly #context: MilestoneDocumentContext;

  readonly #reviews:
    readonly MilestoneReview[];

  readonly #byId: ReadonlyMap<
    ReviewId,
    MilestoneReview
  >;

  constructor(
    context: MilestoneDocumentContext,
  ) {
    this.#context = context;

    this.#reviews = [
      ...context.milestone.reviews,
    ];

    this.#byId = indexById(
      this.#reviews,
      (review) => review.id,
      "Review",
    );
  }

  getCount(): number {
    return this.#reviews.length;
  }

  isEmpty(): boolean {
    return this.#reviews.length === 0;
  }

  has(
    id: ReviewId,
  ): boolean {
    return this.#byId.has(id);
  }

  /**
   * Lightweight bounded Review listing.
   */
  list(
    options: DocumentListOptions = {},
  ): readonly ReviewOverviewDocument[] {
    return sliceCollection(
      this.#reviews,
      options,
    ).map(
      (review) =>
        new ReviewOverviewDocumentImpl(
          review,
          this.#context,
        ),
    );
  }

  get(
    id: ReviewId,
  ): ReviewDocument | undefined {
    const review = this.#byId.get(id);

    if (review === undefined) {
      return undefined;
    }

    return this.#createDocument(
      review,
    );
  }

  require(
    id: ReviewId,
  ): ReviewDocument {
    return this.#createDocument(
      requireFromMap(
        this.#byId,
        id,
        "Review",
      ),
    );
  }

  /**
   * Reviews that still require a conclusion.
   *
   * cancelled is deliberately excluded.
   */
  getPending(): readonly ReviewDocument[] {
    return this.#reviews
      .filter(reviewIsPending)
      .map(
        (review) =>
          this.#createDocument(review),
      );
  }

  getCompleted():
    readonly ReviewDocument[] {
    return this.#reviews
      .filter(
        (review) =>
          review.state === "completed",
      )
      .map(
        (review) =>
          this.#createDocument(review),
      );
  }

  /**
   * All Reviews that concluded successfully, including historical revisions.
   */
  getAccepted():
    readonly ReviewDocument[] {
    return this.#reviews
      .filter(
        (review) =>
          reviewIsAccepted(
            review,
            this.#context,
          ),
      )
      .map(
        (review) =>
          this.#createDocument(review),
      );
  }

  getChangesRequested():
    readonly ReviewDocument[] {
    return this.#reviews
      .filter(
        (review) =>
          review.state === "completed" &&
          review.result ===
            "changes_requested",
      )
      .map(
        (review) =>
          this.#createDocument(review),
      );
  }

  getRejected():
    readonly ReviewDocument[] {
    return this.#reviews
      .filter(
        (review) =>
          review.state === "completed" &&
          review.result === "rejected",
      )
      .map(
        (review) =>
          this.#createDocument(review),
      );
  }

  getByState(
    state: ReviewState,
  ): readonly ReviewDocument[] {
    return this.#reviews
      .filter(
        (review) =>
          review.state === state,
      )
      .map(
        (review) =>
          this.#createDocument(review),
      );
  }

  getForRevision(
    revisionId: MilestoneRevisionId,
  ): readonly ReviewDocument[] {
    return this.#reviews
      .filter(
        (review) =>
          review.milestoneRevisionId ===
          revisionId,
      )
      .map(
        (review) =>
          this.#createDocument(review),
      );
  }

  getCurrentRevision():
    readonly ReviewDocument[] {
    return this.getForRevision(
      this.#context.milestone.currentRevisionId,
    );
  }

  /**
   * Reviews that currently satisfy the Review portion of milestone
   * acceptance.
   *
   * This is deliberately narrower than getAccepted():
   *
   *   getAccepted()
   *     -> accepted Reviews across history
   *
   *   getSatisfyingCurrentAcceptance()
   *     -> accepted Reviews for the current revision
   */
  getSatisfyingCurrentAcceptance():
    readonly ReviewDocument[] {
    return this.#reviews
      .filter(
        (review) =>
          reviewSatisfiesCurrentAcceptance(
            review,
            this.#context,
          ),
      )
      .map(
        (review) =>
          this.#createDocument(review),
      );
  }

  #createDocument(
    review: MilestoneReview,
  ): ReviewDocument {
    return new ReviewDocumentImpl(
      review,
      this.#context,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Factories                                 */
/* -------------------------------------------------------------------------- */

export function createReviewsDocument(
  context: MilestoneDocumentContext,
): ReviewsDocument {
  return new ReviewsDocumentImpl(
    context,
  );
}

export function createReviewDocument(
  review: MilestoneReview,
  context: MilestoneDocumentContext,
): ReviewDocument {
  return new ReviewDocumentImpl(
    review,
    context,
  );
}
