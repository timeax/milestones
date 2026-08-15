import { describe, expect, it } from "vitest";
import { calculateProgress, type CriterionState, type DeliverableRequirementState } from "../src/index.js";
import { create } from "./helpers.js";

describe("generated domain properties", () => {
  it("keeps progress finite and bounded for generated valid requirement sets", () => {
    const criterionStates: readonly CriterionState[] = ["not_started", "in_progress", "submitted", "verified", "failed", "waived"];
    const deliverableStates: readonly DeliverableRequirementState[] = ["missing", "submitted", "satisfied", "rejected", "waived"];
    for (let seed = 0; seed < 100; seed += 1) {
      const criteria = Array.from({ length: seed % 7 }, (_, index) => ({
        title: `C${index}`,
        required: index % 2 === 0,
        weight: (seed * (index + 3)) % 11,
        state: criterionStates[(seed + index) % criterionStates.length]!,
      }));
      const deliverables = Array.from({ length: seed % 5 }, (_, index) => ({
        title: `D${index}`,
        required: index % 2 === 0,
        state: deliverableStates[(seed * 2 + index) % deliverableStates.length]!,
      }));
      const progress = calculateProgress(create({ criteria, deliverables }, `progress-property-${seed}`).milestone);
      expect(Number.isFinite(progress.percentage)).toBe(true);
      expect(progress.percentage).toBeGreaterThanOrEqual(0);
      expect(progress.percentage).toBeLessThanOrEqual(100);
      expect(progress.completedWeight).toBeLessThanOrEqual(progress.totalWeight);
    }
  });
});
