import type { DeliverableRequirementState } from "../../model/domain.js";
import { invariant } from "../../model/errors.js";

export const DELIVERABLE_TRANSITIONS: Readonly<Record<DeliverableRequirementState, readonly DeliverableRequirementState[]>> = {
  missing: ["submitted", "waived"],
  submitted: ["missing", "satisfied", "rejected", "waived"],
  satisfied: ["missing"],
  rejected: ["missing", "submitted", "waived"],
  waived: ["missing"],
};

export function assertDeliverableTransition(
  from: DeliverableRequirementState,
  to: DeliverableRequirementState,
): void {
  invariant(
    DELIVERABLE_TRANSITIONS[from].includes(to),
    "INVALID_STATE_TRANSITION",
    `Deliverable cannot transition from ${from} to ${to}`,
    { from, to },
  );
}
