import {blockedMilestoneIds, readyMilestoneIds,} from "../../services/graph.js";

import type {
    DependenciesDocument,
    DependencyDocument,
    MilestoneDocumentContext,
    MilestoneReadinessDocument,
} from "../types.js";

import {createDependenciesDocument,} from "./dependencies.js";

/**
 * Semantic DOM representation of a Milestone's dependency readiness.
 *
 * Readiness is intentionally concerned with graph/dependency execution state.
 *
 * It does NOT answer:
 *
 * - whether the Milestone can be accepted,
 * - whether all Criteria are satisfied,
 * - whether Deliverables are satisfied,
 * - whether Reviews are complete,
 * - whether Approvals are complete,
 * - whether Completion may occur.
 *
 * Those questions belong to their respective DOM Documents.
 *
 * In other words:
 *
 *   readiness
 *     -> "Can this Milestone currently run with respect to dependencies?"
 *
 *   acceptance
 *     -> "Does this Milestone currently satisfy acceptance requirements?"
 */
export class MilestoneReadinessDocumentImpl
    implements MilestoneReadinessDocument {
    readonly #context: MilestoneDocumentContext;
    readonly #dependencies: DependenciesDocument;

    constructor(
        context: MilestoneDocumentContext,
    ) {
        this.#context = context;

        this.#dependencies =
            createDependenciesDocument(context);
    }

    /**
     * Whether this DOM has enough graph context to evaluate dependency
     * readiness.
     */
    canEvaluate(): boolean {
        return this.#context.graph !== undefined;
    }

    /**
     * Whether this Milestone is currently blocked by an unsatisfied blocking
     * dependency.
     *
     * Returns undefined when graph context is unavailable.
     *
     * Once graph context exists, the answer comes from the authoritative graph
     * service rather than being independently recalculated by the DOM.
     */
    isBlocked(): boolean | undefined {
        const graph = this.#context.graph;

        if (graph === undefined) {
            return undefined;
        }

        return blockedMilestoneIds(
            graph,
        ).includes(
            this.#context.milestone.id,
        );
    }

    /**
     * Whether the Milestone is currently runnable according to the graph.
     *
     * This follows the graph service's definition of readiness:
     *
     * - no unsatisfied blocking dependency, and
     * - the Milestone is not already completed.
     *
     * Returns undefined when graph context is unavailable.
     */
    isReady(): boolean | undefined {
        const graph = this.#context.graph;

        if (graph === undefined) {
            return undefined;
        }

        return readyMilestoneIds(
            graph,
        ).includes(
            this.#context.milestone.id,
        );
    }

    /**
     * Returns blocking dependencies that are conclusively unsatisfied.
     *
     * If graph context is unavailable this returns an empty collection rather
     * than pretending the configured blocking dependencies are known blockers.
     *
     * Call getUnknownBlockingDependencies() to inspect those separately.
     */
    getBlockers():
        readonly DependencyDocument[] {
        return this.#dependencies
            .getBlocking()
            .filter(
                (dependency) =>
                    dependency.isSatisfied() === false,
            );
    }

    /**
     * Blocking dependencies whose current satisfaction cannot be determined.
     *
     * In the normal case this happens because MilestoneGraphSnapshot was not
     * supplied to the DOM.
     */
    getUnknownBlockingDependencies():
        readonly DependencyDocument[] {
        return this.#dependencies
            .getBlocking()
            .filter(
                (dependency) =>
                    dependency.isSatisfied() === undefined,
            );
    }

    /**
     * Navigates to the complete Dependency collection.
     */
    getDependencies(): DependenciesDocument {
        return this.#dependencies;
    }

    getSatisfiedDependencyCount(): number {
        return this.#dependencies
            .getSatisfied()
            .length;
    }

    getUnsatisfiedDependencyCount(): number {
        return this.#dependencies
            .getUnsatisfied()
            .length;
    }

    getUnknownDependencyCount(): number {
        return this.#dependencies
            .getUnknown()
            .length;
    }
}

/* -------------------------------------------------------------------------- */
/*                                  Factory                                   */

/* -------------------------------------------------------------------------- */

/**
 * Creates the readiness DOM for one Milestone.
 */
export function createReadinessDocument(
    context: MilestoneDocumentContext,
): MilestoneReadinessDocument {
    return new MilestoneReadinessDocumentImpl(
        context,
    );
}