import type { CriterionState } from "../../model/domain.js";
import { invariant } from "../../model/errors.js";

export const CRITERION_TRANSITIONS: Readonly<Record<CriterionState, readonly CriterionState[]>> = {
  not_started: ["in_progress", "waived"],
  in_progress: ["not_started", "submitted", "failed", "waived"],
  submitted: ["not_started", "verified", "failed", "waived"],
  verified: ["not_started"],
  failed: ["not_started", "in_progress", "waived"],
  waived: ["not_started"],
};

export function assertCriterionTransition(from: CriterionState, to: CriterionState): void {
  invariant(
    CRITERION_TRANSITIONS[from].includes(to),
    "INVALID_STATE_TRANSITION",
    `Criterion cannot transition from ${from} to ${to}`,
    { from, to },
  );
}
