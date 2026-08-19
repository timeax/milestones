import type {DependencyId, MilestoneDependency, MilestoneDependencyGate, MilestoneId,} from "../../model/domain.js";

import {evaluateDependency,} from "../../services/graph.js";

import type {
    DependenciesDocument,
    DependencyDocument,
    DependencyOverviewDocument,
    DocumentListOptions,
    MilestoneDocumentContext,
} from "../types.js";

import {indexById, requireFromMap, sliceCollection,} from "../internal/collection.js";

/* -------------------------------------------------------------------------- */
/*                           Dependency overview                              */

/* -------------------------------------------------------------------------- */

/**
 * Lightweight DOM representation of a Milestone Dependency.
 *
 * A Dependency describes:
 *
 *   this milestone
 *      ↓ depends on
 *   another milestone
 *      ↓ through
 *   a specific gate
 *
 * Satisfaction is evaluated only when graph context is available.
 */
export class DependencyOverviewDocumentImpl
    implements DependencyOverviewDocument {
    readonly #dependency: MilestoneDependency;
    readonly #context: MilestoneDocumentContext;

    constructor(
        dependency: MilestoneDependency,
        context: MilestoneDocumentContext,
    ) {
        this.#dependency = dependency;
        this.#context = context;
    }

    getId(): DependencyId {
        return this.#dependency.id;
    }

    /**
     * Milestone that owns this dependency.
     */
    getMilestoneId(): MilestoneId {
        return this.#dependency.milestoneId;
    }

    /**
     * Upstream Milestone that must satisfy this dependency's gate.
     */
    getDependsOnMilestoneId(): MilestoneId {
        return this.#dependency.dependsOnMilestoneId;
    }

    /**
     * Condition that must be satisfied by the upstream Milestone.
     *
     * Gates may require:
     *
     * - acceptance
     * - completion
     * - a Criterion reaching its required state
     * - a Deliverable reaching its required state
     */
    getGate(): MilestoneDependencyGate {
        return structuredClone(
            this.#dependency.gate,
        );
    }

    /**
     * Whether failure of this dependency blocks this Milestone.
     */
    isBlocking(): boolean {
        return this.#dependency.blocking;
    }

    /**
     * Current evaluated satisfaction.
     *
     * Returns:
     *
     *   true
     *     the graph exists and the dependency gate is satisfied
     *
     *   false
     *     the graph exists and the dependency gate is not satisfied
     *
     *   undefined
     *     no graph context was supplied, so the DOM cannot evaluate the
     *     dependency
     *
     * Once graph context exists, evaluation is delegated entirely to the
     * milestone graph service.
     */
    isSatisfied(): boolean | undefined {
        const graph = this.#context.graph;

        if (graph === undefined) {
            return undefined;
        }

        return evaluateDependency(
            this.#dependency,
            graph,
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                           Dependency document                              */

/* -------------------------------------------------------------------------- */

/**
 * Full semantic DOM representation of one Milestone Dependency.
 */
export class DependencyDocumentImpl
    extends DependencyOverviewDocumentImpl
    implements DependencyDocument {
    /**
     * Convenience inverse of isSatisfied().
     *
     * Unknown remains unknown:
     *
     *   isSatisfied()   → undefined
     *   isUnsatisfied() → undefined
     *
     * We deliberately do not collapse missing graph context into false/true.
     */
    isUnsatisfied(): boolean | undefined {
        const satisfied = this.isSatisfied();

        if (satisfied === undefined) {
            return undefined;
        }

        return !satisfied;
    }
}

/* -------------------------------------------------------------------------- */
/*                         Dependencies collection                            */

/* -------------------------------------------------------------------------- */

/**
 * Collection DOM for all Dependencies owned by one Milestone.
 *
 * The canonical dependency definitions come from:
 *
 *   context.milestone.dependencies
 *
 * The graph is used only to evaluate those definitions.
 */
export class DependenciesDocumentImpl
    implements DependenciesDocument {
    readonly #context: MilestoneDocumentContext;

    readonly #dependencies:
        readonly MilestoneDependency[];

    readonly #byId: ReadonlyMap<
        DependencyId,
        MilestoneDependency
    >;

    constructor(
        context: MilestoneDocumentContext,
    ) {
        this.#context = context;

        this.#dependencies = [
            ...context.milestone.dependencies,
        ];

        this.#byId = indexById(
            this.#dependencies,
            (dependency) => dependency.id,
            "Dependency",
        );
    }

    getCount(): number {
        return this.#dependencies.length;
    }

    isEmpty(): boolean {
        return this.#dependencies.length === 0;
    }

    has(
        id: DependencyId,
    ): boolean {
        return this.#byId.has(id);
    }

    /**
     * Returns a bounded lightweight Dependency listing.
     *
     * Individual overview nodes can report current satisfaction when graph
     * context exists, but no full graph evaluation is required simply to
     * enumerate the dependencies.
     */
    list(
        options: DocumentListOptions = {},
    ): readonly DependencyOverviewDocument[] {
        return sliceCollection(
            this.#dependencies,
            options,
        ).map(
            (dependency) =>
                new DependencyOverviewDocumentImpl(
                    dependency,
                    this.#context,
                ),
        );
    }

    get(
        id: DependencyId,
    ): DependencyDocument | undefined {
        const dependency = this.#byId.get(id);

        if (dependency === undefined) {
            return undefined;
        }

        return this.#createDocument(
            dependency,
        );
    }

    require(
        id: DependencyId,
    ): DependencyDocument {
        const dependency = requireFromMap(
            this.#byId,
            id,
            "Dependency",
        );

        return this.#createDocument(
            dependency,
        );
    }

    /**
     * Returns dependencies whose failure blocks this Milestone.
     *
     * This describes dependency configuration, not current satisfaction.
     *
     * A blocking Dependency may currently be satisfied.
     */
    getBlocking():
        readonly DependencyDocument[] {
        return this.#dependencies
            .filter(
                (dependency) =>
                    dependency.blocking,
            )
            .map(
                (dependency) =>
                    this.#createDocument(
                        dependency,
                    ),
            );
    }

    /**
     * Returns dependencies that do not themselves block this Milestone.
     */
    getNonBlocking():
        readonly DependencyDocument[] {
        return this.#dependencies
            .filter(
                (dependency) =>
                    !dependency.blocking,
            )
            .map(
                (dependency) =>
                    this.#createDocument(
                        dependency,
                    ),
            );
    }

    /**
     * Dependencies conclusively evaluated as satisfied.
     *
     * Unknown dependencies are deliberately excluded.
     */
    getSatisfied():
        readonly DependencyDocument[] {
        return this.#dependencies
            .map(
                (dependency) =>
                    this.#createDocument(
                        dependency,
                    ),
            )
            .filter(
                (dependency) =>
                    dependency.isSatisfied() === true,
            );
    }

    getUnknown(): readonly DependencyDocument[] {
        return this.#dependencies
            .map(
                (dependency) =>
                    this.#createDocument(dependency),
            )
            .filter(
                (dependency) =>
                    dependency.isSatisfied() === undefined,
            );
    }

    /**
     * Dependencies conclusively evaluated as unsatisfied.
     *
     * Unknown dependencies are deliberately excluded.
     *
     * This means:
     *
     *   no graph context
     *      ↓
     *   getSatisfied()   → []
     *   getUnsatisfied() → []
     *
     * rather than falsely classifying every dependency as unsatisfied.
     */
    getUnsatisfied():
        readonly DependencyDocument[] {
        return this.#dependencies
            .map(
                (dependency) =>
                    this.#createDocument(
                        dependency,
                    ),
            )
            .filter(
                (dependency) =>
                    dependency.isSatisfied() === false,
            );
    }

    #createDocument(
        dependency: MilestoneDependency,
    ): DependencyDocument {
        return new DependencyDocumentImpl(
            dependency,
            this.#context,
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                                 Factories                                  */

/* -------------------------------------------------------------------------- */

/**
 * Creates the Dependencies collection for the current Milestone.
 */
export function createDependenciesDocument(
    context: MilestoneDocumentContext,
): DependenciesDocument {
    return new DependenciesDocumentImpl(
        context,
    );
}

/**
 * Creates a Dependency Document from an already-resolved domain record.
 *
 * This is useful for revision snapshots and other parent DOM nodes that
 * already hold a MilestoneDependency.
 */
export function createDependencyDocument(
    dependency: MilestoneDependency,
    context: MilestoneDocumentContext,
): DependencyDocument {
    return new DependencyDocumentImpl(
        dependency,
        context,
    );
}