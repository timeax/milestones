import type { ReviewState } from "../../model/domain.js";
import { invariant } from "../../model/errors.js";

export const REVIEW_TRANSITIONS: Readonly<Record<ReviewState, readonly ReviewState[]>> = {
  requested: ["in_progress", "completed", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function assertReviewTransition(from: ReviewState, to: ReviewState): void {
  invariant(
    REVIEW_TRANSITIONS[from].includes(to),
    "INVALID_STATE_TRANSITION",
    `Review cannot transition from ${from} to ${to}`,
    { from, to },
  );
}

export function assertReviewAssignable(state: ReviewState): void {
  invariant(
    state === "requested" || state === "in_progress",
    "INVALID_STATE_TRANSITION",
    `Review cannot be assigned while ${state}`,
    { state },
  );
}
