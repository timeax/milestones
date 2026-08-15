export type MilestoneErrorCode =
  | "CONCURRENCY_CONFLICT"
  | "FEATURE_DISABLED"
  | "INVALID_ARGUMENT"
  | "INVALID_STATE_TRANSITION"
  | "NOT_FOUND"
  | "DUPLICATE_ID"
  | "DUPLICATE_DEPENDENCY"
  | "SELF_DEPENDENCY"
  | "DEPENDENCY_CYCLE"
  | "MISSING_GRAPH_NODE"
  | "MISSING_GATE_TARGET"
  | "EVALUATION_FAILED"
  | "LIFECYCLE_CONFLICT"
  | "REVISION_REQUIRED"
  | "PROFILE_MISMATCH"
  | "ARTIFACT_CONTEXT_INVALID"
  | "AUTHORIZATION_DENIED"
  | "SERIALIZATION_INVALID"
  | "MIGRATION_UNSUPPORTED"
  | "EDITOR_CLOSED";

export class MilestoneDomainError extends Error {
  public constructor(
    public readonly code: MilestoneErrorCode,
    message: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "MilestoneDomainError";
  }
}

export class MilestoneValidationError extends MilestoneDomainError {
  public constructor(public readonly issues: readonly ValidationIssue[]) {
    super("INVALID_ARGUMENT", `Milestone validation failed with ${issues.length} issue(s)`, { issues });
    this.name = "MilestoneValidationError";
  }
}

export interface ValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export function invariant(condition: unknown, code: MilestoneErrorCode, message: string, details: Readonly<Record<string, unknown>> = {}): asserts condition {
  if (!condition) throw new MilestoneDomainError(code, message, details);
}
