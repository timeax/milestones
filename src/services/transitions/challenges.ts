import type { ChallengeState } from "../../model/domain.js";
import { invariant } from "../../model/errors.js";

export const CHALLENGE_TRANSITIONS: Readonly<Record<ChallengeState, readonly ChallengeState[]>> = {
  open: ["under_review", "resolved", "rejected", "withdrawn"],
  under_review: ["resolved", "rejected", "withdrawn"],
  resolved: ["reopened"],
  rejected: ["reopened"],
  withdrawn: ["reopened"],
  reopened: ["under_review", "resolved", "rejected", "withdrawn"],
};

export function assertChallengeTransition(from: ChallengeState, to: ChallengeState): void {
  invariant(
    CHALLENGE_TRANSITIONS[from].includes(to),
    "INVALID_STATE_TRANSITION",
    `Challenge cannot transition from ${from} to ${to}`,
    { from, to },
  );
}
