import type {
  DerivedMilestoneState,
  MilestoneId,
  MilestoneRevisionId,
} from "../../model/domain.js";

import {
  invariant,
} from "../../model/errors.js";

import {
  calculateProgress,
  deriveMilestoneState,
} from "../../services/evaluation.js";

import {
  sourceLinksForRevision,
} from "../../services/sources.js";

import type {
  ChallengesDocument,
  MilestoneDefinitionDocument,
  MilestoneDocumentContext,
  MilestoneOverviewDocument,
  MilestoneProgressDocument,
  MilestoneReadinessDocument,
  ReviewsDocument,
  TextDocument,
} from "../types.js";

import {
  createChallengesDocument,
} from "./challenges.js";

import {
  createDefinitionDocument,
} from "./definition.js";

import {
  createProgressDocument,
} from "./progress.js";

import {
  createReadinessDocument,
} from "./readiness.js";

import {
  createReviewsDocument,
} from "./reviews.js";

/* -------------------------------------------------------------------------- */
/*                            Milestone overview                              */
/* -------------------------------------------------------------------------- */

/**
 * Compact semantic overview of one Milestone.
 *
 * The Overview is intended to be the first document queried by:
 *
 * - application UI,
 * - CLI consumers,
 * - AI agents,
 * - ProjectDocument,
 * - search/indexing layers.
 *
 * It deliberately does NOT expand every child collection or large narrative.
 *
 * Think:
 *
 *   overview
 *      ↓
 *   enough information to understand the Milestone
 *      ↓
 *   navigate into specialized DOM Documents when more detail is needed
 */
export class MilestoneOverviewDocumentImpl
  implements MilestoneOverviewDocument
{
  readonly #context:
    MilestoneDocumentContext;

  readonly #definition:
    MilestoneDefinitionDocument;

  readonly #progress:
    MilestoneProgressDocument;

  readonly #readiness:
    MilestoneReadinessDocument;

  readonly #challenges:
    ChallengesDocument;

  readonly #reviews:
    ReviewsDocument;

  constructor(
    context: MilestoneDocumentContext,
  ) {
    this.#context = context;

    this.#definition =
      createDefinitionDocument(
        context.milestone.definition,
      );

    /**
     * Progress calculation is delegated to the package's canonical progress
     * service rather than recalculated inside the DOM.
     */
    this.#progress =
      createProgressDocument(
        calculateProgress(
          context.milestone,
        ),
      );

    /**
     * Readiness delegates graph semantics to the existing graph services.
     */
    this.#readiness =
      createReadinessDocument(
        context,
      );

    this.#challenges =
      createChallengesDocument(
        context,
      );

    this.#reviews =
      createReviewsDocument(
        context,
      );
  }

  /* ---------------------------------------------------------------------- */
  /* Identity                                                               */
  /* ---------------------------------------------------------------------- */

  getId(): MilestoneId {
    return this.#context.milestone.id;
  }

  getTitle(): string {
    return this.#definition.getTitle();
  }

  getKey(): string | undefined {
    return this.#definition.getKey();
  }

  getSequence(): number {
    return this.#context.milestone.sequence;
  }

  /* ---------------------------------------------------------------------- */
  /* Definition                                                             */
  /* ---------------------------------------------------------------------- */

  getDefinition():
    MilestoneDefinitionDocument {
    return this.#definition;
  }

  /**
   * Description is navigable independently.
   *
   * Calling getOverview() therefore does not imply that a CLI/AI consumer
   * needs to serialize or read the complete description.
   */
  getDescription(): TextDocument {
    return this.#definition
      .getDescription();
  }

  /* ---------------------------------------------------------------------- */
  /* Lifecycle                                                              */
  /* ---------------------------------------------------------------------- */

  getState(): DerivedMilestoneState {
    return deriveMilestoneState(
      this.#context.milestone,
    );
  }

  /**
   * Whether the Milestone currently has an effective Acceptance pointer.
   *
   * This is deliberately a lifecycle fact rather than fresh acceptance
   * evaluation.
   *
   * For:
   *
   *   "Could it be accepted now?"
   *
   * callers should navigate to AcceptanceStatusDocument.canAccept().
   */
  isAccepted(): boolean {
    return (
      this.#context.milestone
        .currentAcceptanceId !== undefined
    );
  }

  /**
   * Whether the Milestone currently has an effective Completion pointer.
   *
   * For:
   *
   *   "Could it be completed now?"
   *
   * callers should use CompletionStatusDocument.canComplete().
   */
  isCompleted(): boolean {
    return (
      this.#context.milestone
        .currentCompletionId !== undefined
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Revision                                                               */
  /* ---------------------------------------------------------------------- */

  getCurrentRevisionId():
    MilestoneRevisionId {
    return this.#context.milestone
      .currentRevisionId;
  }

  getCurrentRevisionNumber(): number {
    const revision =
      this.#context.milestone
        .revisions
        .find(
          (candidate) =>
            candidate.id ===
            this.#context.milestone
              .currentRevisionId,
        );

    invariant(
      revision !== undefined,
      "NOT_FOUND",
      `Current revision ${this.#context.milestone.currentRevisionId} was not found`,
      {
        milestoneId:
          this.#context.milestone.id,
        revisionId:
          this.#context.milestone
            .currentRevisionId,
      },
    );

    return revision.number;
  }

  getRevisionCount(): number {
    return this.#context.milestone
      .revisions.length;
  }

  /* ---------------------------------------------------------------------- */
  /* Progress                                                               */
  /* ---------------------------------------------------------------------- */

  getProgress():
    MilestoneProgressDocument {
    return this.#progress;
  }

  /* ---------------------------------------------------------------------- */
  /* Readiness                                                              */
  /* ---------------------------------------------------------------------- */

  getReadiness():
    MilestoneReadinessDocument {
    return this.#readiness;
  }

  isBlocked(): boolean | undefined {
    return this.#readiness.isBlocked();
  }

  isReady(): boolean | undefined {
    return this.#readiness.isReady();
  }

  /* ---------------------------------------------------------------------- */
  /* Counts                                                                 */
  /* ---------------------------------------------------------------------- */

  getCriterionCount(): number {
    return this.#context.milestone
      .criteria.length;
  }

  getDeliverableCount(): number {
    return this.#context.milestone
      .deliverables.length;
  }

  getDependencyCount(): number {
    return this.#context.milestone
      .dependencies.length;
  }

  /**
   * Challenge count is intentionally current-revision scoped.
   *
   * Historical Challenges remain available through ChallengesDocument.
   */
  getChallengeCount(): number {
    return this.#challenges
      .getCurrentRevision()
      .length;
  }

  getOpenChallengeCount(): number {
    return this.#challenges
      .getCurrentRevision()
      .filter(
        (challenge) =>
          challenge.isOpen(),
      )
      .length;
  }

  /**
   * This is narrower than:
   *
   *   challenge.severity === "blocking"
   *
   * because ChallengeDocument.isBlocking() also respects revision, state and
   * current evaluation policy.
   */
  getBlockingChallengeCount(): number {
    return this.#challenges
      .getBlocking()
      .length;
  }

  /**
   * Reviews are revision-bound, so Overview reports only current-revision
   * Reviews rather than the complete historical review count.
   */
  getReviewCount(): number {
    return this.#reviews
      .getCurrentRevision()
      .length;
  }

  /**
   * All Source links participating in the current revision.
   *
   * This intentionally uses the domain Source traversal service rather than
   * simply counting milestone.sourceLinks.
   *
   * It therefore includes Sources belonging to:
   *
   * - Milestone
   * - current Milestone Revision
   * - Criteria
   * - Deliverable Requirements
   * - current-revision Challenges
   * - current-revision Reviews
   */
  getSourceCount(): number {
    return sourceLinksForRevision(
      this.#context.milestone,
      this.#context.milestone
        .currentRevisionId,
    ).length;
  }

  /* ---------------------------------------------------------------------- */
  /* Audit metadata                                                         */
  /* ---------------------------------------------------------------------- */

  getCreatedAt(): string {
    return this.#context.milestone
      .createdAt;
  }

  getUpdatedAt(): string | undefined {
    return this.#context.milestone
      .updatedAt;
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Factory                                   */
/* -------------------------------------------------------------------------- */

export function createOverviewDocument(
  context: MilestoneDocumentContext,
): MilestoneOverviewDocument {
  return new MilestoneOverviewDocumentImpl(
    context,
  );
}
