import type {ProgressResult,} from "../../model/domain.js";

import type {MilestoneProgressDocument,} from "../types.js";

/**
 * Read-only DOM representation of milestone progress.
 *
 * This class does not calculate progress.
 *
 * Progress calculation remains authoritative in the milestone domain/service
 * layer (for example calculateProgress()). The DOM only gives consumers a
 * semantic, navigable representation of that result.
 */
export class MilestoneProgressDocumentImpl
    implements MilestoneProgressDocument {
    readonly #progress: ProgressResult;

    constructor(progress: ProgressResult) {
        this.#progress = progress;
    }

    /**
     * Total satisfied/completed weight currently contributing to progress.
     */
    getCompletedWeight(): number {
        return this.#progress.completedWeight;
    }

    /**
     * Total possible weight contributing to progress.
     */
    getTotalWeight(): number {
        return this.#progress.totalWeight;
    }

    /**
     * Current progress percentage.
     *
     * The value is returned exactly as calculated by the milestone evaluation
     * service. The DOM does not round or otherwise reinterpret it.
     */
    getPercentage(): number {
        return this.#progress.percentage;
    }

    /**
     * Whether progress has reached its calculated maximum.
     *
     * A milestone with no progress-bearing criteria or deliverables may already
     * have a 100% ProgressResult according to the authoritative progress
     * evaluator, so this deliberately follows that result.
     */
    isComplete(): boolean {
        return this.#progress.percentage >= 100;
    }
}

/**
 * Creates a DOM representation of an already-calculated ProgressResult.
 *
 * Keeping calculation outside this factory is intentional:
 *
 *   Milestone
 *      ↓
 *   calculateProgress(...)
 *      ↓
 *   ProgressResult
 *      ↓
 *   createProgressDocument(...)
 *      ↓
 *   MilestoneProgressDocument
 */
export function createProgressDocument(
    progress: ProgressResult,
): MilestoneProgressDocument {
    return new MilestoneProgressDocumentImpl(progress);
}