import type {
  AcceptanceId,
  ActorRef,
  CompletionEvaluation,
  CompletionId,
  MilestoneCompletion,
  MilestoneRevisionId,
} from "../../model/domain.js";

import {
  evaluateCompletion,
} from "../../services/evaluation.js";

import type {
  CompletionDocument,
  CompletionHistoryDocument,
  CompletionOverviewDocument,
  CompletionStatusDocument,
  DocumentListOptions,
  MilestoneDocumentContext,
  MilestoneIssuesDocument,
  TextDocument,
} from "../types.js";

import {
  indexById,
  requireFromMap,
  sliceCollection,
} from "../internal/collection.js";

import {
  createIssuesDocument,
} from "./issues.js";

import {
  createTextDocument,
} from "./text.js";

/* -------------------------------------------------------------------------- */
/*                          Completion overview                               */
/* -------------------------------------------------------------------------- */

/**
 * Lightweight historical representation of one Completion record.
 */
export class CompletionOverviewDocumentImpl
  implements CompletionOverviewDocument
{
  readonly #completion: MilestoneCompletion;
  readonly #context: MilestoneDocumentContext;

  constructor(
    completion: MilestoneCompletion,
    context: MilestoneDocumentContext,
  ) {
    this.#completion = completion;
    this.#context = context;
  }

  getId(): CompletionId {
    return this.#completion.id;
  }

  getRevisionId(): MilestoneRevisionId {
    return this.#completion
      .milestoneRevisionId;
  }

  /**
   * Acceptance record on which this Completion was based.
   */
  getAcceptanceId(): AcceptanceId {
    return this.#completion.acceptanceId;
  }

  getCompletedAt(): string {
    return this.#completion.completedAt;
  }

  /**
   * Current means the Milestone currently points at this exact Completion
   * record.
   */
  isCurrent(): boolean {
    return (
      this.#context.milestone
        .currentCompletionId ===
      this.#completion.id
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                           Completion document                              */
/* -------------------------------------------------------------------------- */

/**
 * Full read-only DOM representation of one historical Completion record.
 *
 * Completion records are immutable history. This document never attempts to
 * re-evaluate whether the milestone should have been completable when the
 * record was created.
 */
export class CompletionDocumentImpl
  extends CompletionOverviewDocumentImpl
  implements CompletionDocument
{
  readonly #completion: MilestoneCompletion;
  readonly #context: MilestoneDocumentContext;
  readonly #reason: TextDocument;

  constructor(
    completion: MilestoneCompletion,
    context: MilestoneDocumentContext,
  ) {
    super(
      completion,
      context,
    );

    this.#completion = completion;
    this.#context = context;

    this.#reason = createTextDocument(
      completion.reason,
    );
  }

  getOverview():
    CompletionOverviewDocument {
    return new CompletionOverviewDocumentImpl(
      this.#completion,
      this.#context,
    );
  }

  override getRevisionId(): MilestoneRevisionId {
    return this.#completion
      .milestoneRevisionId;
  }

  override getAcceptanceId(): AcceptanceId {
    return this.#completion.acceptanceId;
  }

  override getCompletedAt(): string {
    return this.#completion.completedAt;
  }

  getActor(): ActorRef | undefined {
    return this.#completion.actor;
  }

  /**
   * Optional narrative explaining why/how the milestone was completed.
   *
   * It remains behind TextDocument so a large handover/completion reason does
   * not get embedded into lightweight responses.
   */
  getReason(): TextDocument {
    return this.#reason;
  }

  hasReason(): boolean {
    return !this.#reason.isEmpty();
  }

  override isCurrent(): boolean {
    return (
      this.#context.milestone
        .currentCompletionId ===
      this.#completion.id
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                         Completion history                                 */
/* -------------------------------------------------------------------------- */

/**
 * Complete historical Completion collection.
 *
 * Reopened milestones may retain older Completion records even though none of
 * them is currently effective. History is therefore deliberately distinct
 * from CompletionStatusDocument.getCurrent().
 */
export class CompletionHistoryDocumentImpl
  implements CompletionHistoryDocument
{
  readonly #context: MilestoneDocumentContext;

  readonly #records:
    readonly MilestoneCompletion[];

  readonly #byId: ReadonlyMap<
    CompletionId,
    MilestoneCompletion
  >;

  constructor(
    context: MilestoneDocumentContext,
  ) {
    this.#context = context;

    this.#records = [
      ...context.milestone
        .completionRecords,
    ];

    this.#byId = indexById(
      this.#records,
      (record) => record.id,
      "Completion",
    );
  }

  getCount(): number {
    return this.#records.length;
  }

  isEmpty(): boolean {
    return this.#records.length === 0;
  }

  has(
    id: CompletionId,
  ): boolean {
    return this.#byId.has(id);
  }

  /**
   * Completion history is listed newest first.
   */
  list(
    options: DocumentListOptions = {},
  ): readonly CompletionOverviewDocument[] {
    return sliceCollection(
      this.#orderedNewestFirst(),
      options,
    ).map(
      (record) =>
        new CompletionOverviewDocumentImpl(
          record,
          this.#context,
        ),
    );
  }

  get(
    id: CompletionId,
  ): CompletionDocument | undefined {
    const record = this.#byId.get(id);

    if (record === undefined) {
      return undefined;
    }

    return this.#createDocument(
      record,
    );
  }

  require(
    id: CompletionId,
  ): CompletionDocument {
    return this.#createDocument(
      requireFromMap(
        this.#byId,
        id,
        "Completion",
      ),
    );
  }

  /**
   * All historical Completion records for a particular Milestone revision.
   */
  getForRevision(
    revisionId: MilestoneRevisionId,
  ): readonly CompletionDocument[] {
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

  /**
   * Completion records based on one particular Acceptance.
   *
   * Usually this will be zero or one under normal lifecycle rules, but the DOM
   * does not invent that cardinality constraint.
   */
  getForAcceptance(
    acceptanceId: AcceptanceId,
  ): readonly CompletionDocument[] {
    return this.#orderedNewestFirst()
      .filter(
        (record) =>
          record.acceptanceId ===
          acceptanceId,
      )
      .map(
        (record) =>
          this.#createDocument(record),
      );
  }

  getLatest():
    CompletionDocument | undefined {
    const latest =
      this.#orderedNewestFirst()[0];

    if (latest === undefined) {
      return undefined;
    }

    return this.#createDocument(
      latest,
    );
  }

  #orderedNewestFirst():
    readonly MilestoneCompletion[] {
    return this.#records
      .slice()
      .sort(
        (left, right) =>
          right.completedAt.localeCompare(
            left.completedAt,
          ) ||
          right.id.localeCompare(left.id),
      );
  }

  #createDocument(
    completion: MilestoneCompletion,
  ): CompletionDocument {
    return new CompletionDocumentImpl(
      completion,
      this.#context,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                           Completion status                                */
/* -------------------------------------------------------------------------- */

/**
 * Current semantic Completion status.
 *
 * There are deliberately two separate questions:
 *
 *   isCompleted()
 *      -> does a current Completion record exist?
 *
 *   canComplete()
 *      -> does fresh authoritative completion evaluation pass?
 */
export class CompletionStatusDocumentImpl
  implements CompletionStatusDocument
{
  readonly #context: MilestoneDocumentContext;

  readonly #evaluation:
    CompletionEvaluation;

  readonly #history:
    CompletionHistoryDocument;

  constructor(
    context: MilestoneDocumentContext,
  ) {
    this.#context = context;

    /**
     * The package's authoritative Completion evaluator is called exactly
     * once for this status document.
     */
    this.#evaluation = evaluateCompletion(
      context.milestone,
      context.profile,
    );

    this.#history =
      new CompletionHistoryDocumentImpl(
        context,
      );
  }

  /**
   * Whether an effective current Completion record exists.
   *
   * This follows currentCompletionId rather than merely checking whether
   * completionRecords is non-empty.
   */
  isCompleted(): boolean {
    return this.getCurrent() !== undefined;
  }

  /**
   * Whether current authoritative Completion evaluation passes.
   *
   * At present the evaluator requires:
   *
   * - Completion enabled in the profile, and
   * - a current Acceptance record belonging to the current revision.
   */
  canComplete(): boolean {
    return this.#evaluation.completable;
  }

  getIssues(): MilestoneIssuesDocument {
    return createIssuesDocument(
      this.#evaluation.reasons,
    );
  }

  getCurrent():
    CompletionDocument | undefined {
    const id =
      this.#context.milestone
        .currentCompletionId;

    if (id === undefined) {
      return undefined;
    }

    return this.#history.get(id);
  }

  getHistory():
    CompletionHistoryDocument {
    return this.#history;
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Factories                                 */
/* -------------------------------------------------------------------------- */

export function createCompletionStatusDocument(
  context: MilestoneDocumentContext,
): CompletionStatusDocument {
  return new CompletionStatusDocumentImpl(
    context,
  );
}

export function createCompletionDocument(
  completion: MilestoneCompletion,
  context: MilestoneDocumentContext,
): CompletionDocument {
  return new CompletionDocumentImpl(
    completion,
    context,
  );
}
