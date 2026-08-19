import type {
  MilestoneId,
  MilestoneProfile,
  MilestoneProfileId,
} from "../model/domain.js";

import {
  calculateProgress,
} from "../services/evaluation.js";

import {
  sourceLinksForRevision,
} from "../services/sources.js";

import type {
  AcceptanceStatusDocument,
  ApprovalsDocument,
  ChallengesDocument,
  CompletionStatusDocument,
  CriteriaDocument,
  DeliverablesDocument,
  DependenciesDocument,
  MilestoneDefinitionDocument,
  MilestoneDocumentContext,
  MilestoneDocumentContract,
  MilestoneOverviewDocument,
  MilestoneProfileDocument,
  MilestoneProgressDocument,
  MilestoneReadinessDocument,
  MilestoneSourcesDocument,
  ReviewsDocument,
  RevisionsDocument,
  TextDocument,
} from "./types.js";

import {
  createAcceptanceStatusDocument,
  createApprovalsDocument,
  createChallengesDocument,
  createCompletionStatusDocument,
  createCriteriaDocument,
  createDefinitionDocument,
  createDeliverablesDocument,
  createDependenciesDocument,
  createOverviewDocument,
  createProgressDocument,
  createReadinessDocument,
  createReviewsDocument,
  createRevisionsDocument,
  createSourcesDocument,
} from "./documents/index.js";

/* -------------------------------------------------------------------------- */
/*                              Profile document                              */
/* -------------------------------------------------------------------------- */

/**
 * Small semantic view over the loaded Milestone Profile.
 *
 * A separate implementation file would add more structural noise than value
 * at this point, so it lives alongside the root MilestoneDocument.
 */
class MilestoneProfileDocumentImpl
  implements MilestoneProfileDocument
{
  readonly #profile: MilestoneProfile;

  constructor(
    profile: MilestoneProfile,
  ) {
    this.#profile = profile;
  }

  getId(): MilestoneProfileId {
    return this.#profile.ref.id;
  }

  getVersion(): number {
    return this.#profile.ref.version;
  }

  hasCriteria(): boolean {
    return this.#profile.criteria.enabled;
  }

  hasDeliverables(): boolean {
    return this.#profile.deliverables.enabled;
  }

  hasDependencies(): boolean {
    return this.#profile.dependencies.enabled;
  }

  participatesInGraph(): boolean {
    return this.#profile.dependencies
      .participatesInGraph;
  }

  hasRevisions(): boolean {
    return this.#profile.revisions.enabled;
  }

  hasChallenges(): boolean {
    return this.#profile.challenges.enabled;
  }

  hasReviews(): boolean {
    return this.#profile.reviews.enabled;
  }

  requiresReviews(): boolean {
    return (
      this.#profile.reviews.enabled &&
      this.#profile.reviews.required
    );
  }

  hasApprovals(): boolean {
    return this.#profile.approvals.enabled;
  }

  requiresApprovals(): boolean {
    return (
      this.#profile.approvals.enabled &&
      this.#profile.approvals.required
    );
  }

  hasCompletion(): boolean {
    return this.#profile.completion.enabled;
  }

  closeImmediatelyOnAcceptance(): boolean {
    return this.#profile.completion
      .closeImmediatelyOnAcceptance;
  }
}

/* -------------------------------------------------------------------------- */
/*                            Milestone document                              */
/* -------------------------------------------------------------------------- */

/**
 * Root read-only Document Object Model for one Milestone.
 *
 * MilestoneDocument is primarily a semantic navigator.
 *
 * It does not:
 *
 * - mutate Milestones,
 * - persist data,
 * - read/write .pm files,
 * - talk to GitHub,
 * - maintain SQLite,
 * - perform synchronization,
 * - interpret UI concerns.
 *
 * Mutation belongs to MilestoneEditor.
 *
 * Storage and synchronization belong to the host.
 *
 * The DOM is responsible for turning the immutable Milestone aggregate plus
 * optional graph/artifact context into a navigable read model.
 */
export class MilestoneDocument
  implements MilestoneDocumentContract
{
  readonly #context:
    MilestoneDocumentContext;

  /*
   * Child Documents are lazily created and retained.
   *
   * This matters because some subtrees are materially more expensive than
   * others:
   *
   * - AcceptanceStatusDocument runs evaluateAcceptance().
   * - CompletionStatusDocument runs evaluateCompletion().
   * - Source documents may resolve Artifact versions.
   * - Readiness may inspect graph state.
   *
   * Merely creating a MilestoneDocument should therefore remain cheap.
   */

  #profile:
    MilestoneProfileDocument | undefined;

  #definition:
    MilestoneDefinitionDocument | undefined;

  #overview:
    MilestoneOverviewDocument | undefined;

  #progress:
    MilestoneProgressDocument | undefined;

  #criteria:
    CriteriaDocument | undefined;

  #deliverables:
    DeliverablesDocument | undefined;

  #dependencies:
    DependenciesDocument | undefined;

  #readiness:
    MilestoneReadinessDocument | undefined;

  #sources:
    MilestoneSourcesDocument | undefined;

  #allSources:
    MilestoneSourcesDocument | undefined;

  #challenges:
    ChallengesDocument | undefined;

  #reviews:
    ReviewsDocument | undefined;

  #approvals:
    ApprovalsDocument | undefined;

  #revisions:
    RevisionsDocument | undefined;

  #acceptance:
    AcceptanceStatusDocument | undefined;

  #completion:
    CompletionStatusDocument | undefined;

  constructor(
    context: MilestoneDocumentContext,
  ) {
    this.#context = context;
  }

  /* ---------------------------------------------------------------------- */
  /* Identity                                                               */
  /* ---------------------------------------------------------------------- */

  getId(): MilestoneId {
    return this.#context.milestone.id;
  }

  /* ---------------------------------------------------------------------- */
  /* Profile                                                                */
  /* ---------------------------------------------------------------------- */

  getProfile(): MilestoneProfileDocument {
    return (
      this.#profile ??=
        new MilestoneProfileDocumentImpl(
          this.#context.profile,
        )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Definition                                                             */
  /* ---------------------------------------------------------------------- */

  getDefinition():
    MilestoneDefinitionDocument {
    return (
      this.#definition ??=
        createDefinitionDocument(
          this.#context.milestone.definition,
        )
    );
  }

  /**
   * Description is deliberately first-class.
   *
   * AI/CLI consumers should not need to know that description currently
   * happens to live inside MilestoneDefinition.
   *
   * A future host could source this content from:
   *
   *   .pm/milestones/<id>/description.md
   *
   * SQLite, an object store, or another projection without changing the
   * calling pattern:
   *
   *   milestone.getDescription().read(...)
   */
  getDescription(): TextDocument {
    return this.getDefinition()
      .getDescription();
  }

  /* ---------------------------------------------------------------------- */
  /* Overview                                                               */
  /* ---------------------------------------------------------------------- */

  getOverview():
    MilestoneOverviewDocument {
    return (
      this.#overview ??=
        createOverviewDocument(
          this.#context,
        )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Progress                                                               */
  /* ---------------------------------------------------------------------- */

  getProgress():
    MilestoneProgressDocument {
    return (
      this.#progress ??=
        createProgressDocument(
          calculateProgress(
            this.#context.milestone,
          ),
        )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Criteria                                                               */
  /* ---------------------------------------------------------------------- */

  getCriteria(): CriteriaDocument {
    return (
      this.#criteria ??=
        createCriteriaDocument(
          this.#context,
        )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Deliverables                                                           */
  /* ---------------------------------------------------------------------- */

  getDeliverables():
    DeliverablesDocument {
    return (
      this.#deliverables ??=
        createDeliverablesDocument(
          this.#context,
        )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Dependencies                                                           */
  /* ---------------------------------------------------------------------- */

  getDependencies():
    DependenciesDocument {
    return (
      this.#dependencies ??=
        createDependenciesDocument(
          this.#context,
        )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Readiness                                                              */
  /* ---------------------------------------------------------------------- */

  getReadiness():
    MilestoneReadinessDocument {
    return (
      this.#readiness ??=
        createReadinessDocument(
          this.#context,
        )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Sources                                                                */
  /* ---------------------------------------------------------------------- */

  /**
   * Sources attached directly to the Milestone subject.
   *
   * This is deliberately narrow.
   *
   * To traverse every Source participating in the current revision, use
   * getAllSources().
   */
  getSources():
    MilestoneSourcesDocument {
    return (
      this.#sources ??=
        createSourcesDocument(
          this.#context.milestone
            .sourceLinks ?? [],
          this.#context.artifacts,
        )
    );
  }

  /**
   * Complete Source view for the current Milestone revision.
   *
   * Traversal semantics are delegated to sourceLinksForRevision(), which is
   * already the canonical package definition of Sources participating in a
   * revision.
   */
  getAllSources():
    MilestoneSourcesDocument {
    return (
      this.#allSources ??=
        createSourcesDocument(
          sourceLinksForRevision(
            this.#context.milestone,
            this.#context.milestone
              .currentRevisionId,
          ),
          this.#context.artifacts,
        )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Challenges                                                             */
  /* ---------------------------------------------------------------------- */

  getChallenges():
    ChallengesDocument {
    return (
      this.#challenges ??=
        createChallengesDocument(
          this.#context,
        )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Reviews                                                                */
  /* ---------------------------------------------------------------------- */

  getReviews(): ReviewsDocument {
    return (
      this.#reviews ??=
        createReviewsDocument(
          this.#context,
        )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Approvals                                                              */
  /* ---------------------------------------------------------------------- */

  getApprovals():
    ApprovalsDocument {
    return (
      this.#approvals ??=
        createApprovalsDocument(
          this.#context,
        )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Revisions                                                              */
  /* ---------------------------------------------------------------------- */

  getRevisions():
    RevisionsDocument {
    return (
      this.#revisions ??=
        createRevisionsDocument(
          this.#context,
        )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Acceptance                                                             */
  /* ---------------------------------------------------------------------- */

  /**
   * Fresh current-state Acceptance evaluation plus immutable Acceptance
   * history.
   *
   * Construction is lazy because evaluateAcceptance() can traverse most of
   * the Milestone domain.
   */
  getAcceptanceStatus():
    AcceptanceStatusDocument {
    return (
      this.#acceptance ??=
        createAcceptanceStatusDocument(
          this.#context,
        )
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Completion                                                             */
  /* ---------------------------------------------------------------------- */

  getCompletionStatus():
    CompletionStatusDocument {
    return (
      this.#completion ??=
        createCompletionStatusDocument(
          this.#context,
        )
    );
  }
}
