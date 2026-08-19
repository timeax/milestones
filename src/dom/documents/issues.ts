import type {
  EvaluationReason,
  EvaluationReasonCode,
} from "../../model/domain.js";

import type {
  DocumentListOptions,
  MilestoneIssueCategory,
  MilestoneIssueDocument,
  MilestoneIssuesDocument,
} from "../types.js";

import {
  sliceCollection,
} from "../internal/collection.js";

/* -------------------------------------------------------------------------- */
/*                            Issue classification                            */
/* -------------------------------------------------------------------------- */

/**
 * Maps authoritative EvaluationReasonCode values into coarse semantic
 * categories useful to DOM, CLI, UI and AI consumers.
 *
 * This mapping does not alter evaluation semantics. It only groups existing
 * reason codes for navigation.
 */
function issueCategory(
  code: EvaluationReasonCode,
): MilestoneIssueCategory {
  switch (code) {
    case "missing_criterion":
      return "criteria";

    case "missing_deliverable":
      return "deliverables";

    case "missing_acceptance":
      return "acceptance";

    case "unsatisfied_dependency":
      return "dependencies";

    case "blocking_challenge":
      return "challenges";

    case "incomplete_review":
      return "reviews";

    case "pending_approval":
      return "approvals";

    case "artifact_requirement_missing":
    case "artifact_submission_missing":
    case "artifact_verification_missing":
    case "artifact_verification_failed":
    case "artifact_version_missing":
      return "artifacts";

    case "profile_feature_disabled":
      return "profile";
  }
}

/* -------------------------------------------------------------------------- */
/*                               Issue document                               */
/* -------------------------------------------------------------------------- */

/**
 * Read-only semantic wrapper around one EvaluationReason.
 *
 * MilestoneIssueDocument deliberately contains no resolution logic.
 *
 * It explains WHY an authoritative evaluator failed. Fixing that problem
 * remains the responsibility of the appropriate Editor/domain operation.
 */
export class MilestoneIssueDocumentImpl
  implements MilestoneIssueDocument
{
  readonly #reason: EvaluationReason;

  constructor(
    reason: EvaluationReason,
  ) {
    this.#reason = reason;
  }

  getCode(): EvaluationReasonCode {
    return this.#reason.code;
  }

  getSubjectId(): string {
    return this.#reason.subjectId;
  }

  getMessage(): string {
    return this.#reason.message;
  }

  getCategory(): MilestoneIssueCategory {
    return issueCategory(
      this.#reason.code,
    );
  }

  isArtifactRelated(): boolean {
    return this.getCategory() === "artifacts";
  }
}

/* -------------------------------------------------------------------------- */
/*                              Issues document                               */
/* -------------------------------------------------------------------------- */

/**
 * Query document over a set of authoritative EvaluationReasons.
 *
 * The parent determines where the reasons came from:
 *
 *   evaluateAcceptance(...)
 *       ↓
 *   MilestoneIssuesDocument
 *
 * or
 *
 *   evaluateCompletion(...)
 *       ↓
 *   MilestoneIssuesDocument
 *
 * This document itself never runs evaluation.
 */
export class MilestoneIssuesDocumentImpl
  implements MilestoneIssuesDocument
{
  readonly #reasons:
    readonly EvaluationReason[];

  constructor(
    reasons: readonly EvaluationReason[],
  ) {
    this.#reasons = [
      ...reasons,
    ];
  }

  getCount(): number {
    return this.#reasons.length;
  }

  isEmpty(): boolean {
    return this.#reasons.length === 0;
  }

  /**
   * Returns a bounded ordered list of evaluation issues.
   *
   * Evaluation order is preserved exactly as supplied by the authoritative
   * evaluator.
   */
  list(
    options: DocumentListOptions = {},
  ): readonly MilestoneIssueDocument[] {
    return sliceCollection(
      this.#reasons,
      options,
    ).map(
      (reason) =>
        this.#createDocument(reason),
    );
  }

  getByCode(
    code: EvaluationReasonCode,
  ): readonly MilestoneIssueDocument[] {
    return this.#reasons
      .filter(
        (reason) =>
          reason.code === code,
      )
      .map(
        (reason) =>
          this.#createDocument(reason),
      );
  }

  getByCategory(
    category: MilestoneIssueCategory,
  ): readonly MilestoneIssueDocument[] {
    return this.#reasons
      .filter(
        (reason) =>
          issueCategory(
            reason.code,
          ) === category,
      )
      .map(
        (reason) =>
          this.#createDocument(reason),
      );
  }

  getBySubjectId(
    subjectId: string,
  ): readonly MilestoneIssueDocument[] {
    return this.#reasons
      .filter(
        (reason) =>
          reason.subjectId ===
          subjectId,
      )
      .map(
        (reason) =>
          this.#createDocument(reason),
      );
  }

  hasCode(
    code: EvaluationReasonCode,
  ): boolean {
    return this.#reasons.some(
      (reason) =>
        reason.code === code,
    );
  }

  hasCategory(
    category: MilestoneIssueCategory,
  ): boolean {
    return this.#reasons.some(
      (reason) =>
        issueCategory(
          reason.code,
        ) === category,
    );
  }

  getArtifactIssues():
    readonly MilestoneIssueDocument[] {
    return this.getByCategory(
      "artifacts",
    );
  }

  #createDocument(
    reason: EvaluationReason,
  ): MilestoneIssueDocument {
    return new MilestoneIssueDocumentImpl(
      reason,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Factories                                 */
/* -------------------------------------------------------------------------- */

export function createIssuesDocument(
  reasons:
    | readonly EvaluationReason[]
    | undefined,
): MilestoneIssuesDocument {
  return new MilestoneIssuesDocumentImpl(
    reasons ?? [],
  );
}

export function createIssueDocument(
  reason: EvaluationReason,
): MilestoneIssueDocument {
  return new MilestoneIssueDocumentImpl(
    reason,
  );
}
