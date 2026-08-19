import type {
    CriterionGateState,
    DeliverableGateState,
    Milestone,
    MilestoneArtifactContext,
    MilestoneGraphNode,
    MilestoneGraphSnapshot,
    MilestoneProfile,
} from "../model/domain.js";

import {invariant,} from "../model/errors.js";

import {graphDependencyIdentityKey,} from "../services/dependency-identity.js";

import {assertValidGraph, graphNodeFromMilestone,} from "../services/graph.js";

import {assertValidMilestone,} from "../services/validation.js";

import {MilestoneDocument,} from "./document.js";

import type {MilestoneDocumentContext,} from "./types.js";

/* -------------------------------------------------------------------------- */
/*                              Build input                                   */

/* -------------------------------------------------------------------------- */

/**
 * Complete input required to construct a Milestone DOM.
 *
 * Milestone and Profile are mandatory because evaluation semantics depend on
 * both.
 *
 * Graph and Artifact contexts are optional because callers may legitimately
 * open a Milestone without having loaded those projections yet.
 */
export interface MilestoneDocumentBuildInput {
    readonly milestone: Milestone;

    readonly profile: MilestoneProfile;

    readonly graph?: MilestoneGraphSnapshot;

    readonly artifacts?: MilestoneArtifactContext;
}

/* -------------------------------------------------------------------------- */
/*                         Public factory                                     */

/* -------------------------------------------------------------------------- */

/**
 * Preferred functional constructor for the Milestone DOM.
 *
 * This validates the supplied domain/context relationship before exposing the
 * document tree.
 */
export function createMilestoneDocument(
    input: MilestoneDocumentBuildInput,
): MilestoneDocument {
    return new MilestoneDocument(
        createMilestoneDocumentContext(input),
    );
}

/**
 * Creates the validated immutable context used by all Milestone DOM child
 * documents.
 *
 * This is useful when another package wants to compose a MilestoneDocument
 * while retaining the context separately.
 */
export function createMilestoneDocumentContext(
    input: MilestoneDocumentBuildInput,
): MilestoneDocumentContext {
    const {
        milestone,
        profile,
        graph,
        artifacts,
    } = input;

    /*
     * Authoritative domain validation.
     *
     * Do not reproduce:
     *
     * - Revision validation
     * - Approval validation
     * - Challenge validation
     * - Acceptance history validation
     * - Completion validation
     * - Source ownership validation
     * - Profile feature validation
     *
     * here.
     */
    assertValidMilestone(
        milestone,
        profile,
    );

    if (graph !== undefined) {
        assertGraphContextCoherent(
            milestone,
            graph,
        );
    }

    /*
     * Artifact context is deliberately not eagerly "completed" or resolved.
     *
     * It may be partial:
     *
     * - an Artifact Requirement may be missing,
     * - a Submission may not exist yet,
     * - Verification may still be pending,
     * - an unpinned Source may not currently resolve.
     *
     * Those are useful evaluation/query states, not necessarily construction
     * failures.
     *
     * Individual Artifact/Source services validate the records they actually
     * consume.
     */
    return {
        milestone,
        profile,

        ...(graph === undefined
            ? {}
            : {graph}),

        ...(artifacts === undefined
            ? {}
            : {artifacts}),
    };
}

/* -------------------------------------------------------------------------- */
/*                              Builder API                                   */

/* -------------------------------------------------------------------------- */

/**
 * Fluent construction API.
 *
 * The function createMilestoneDocument(...) should remain the simplest
 * default API; this builder exists for hosts that naturally assemble context
 * incrementally.
 */
export class MilestoneDocumentBuilder {
    readonly #milestone: Milestone;
    readonly #profile: MilestoneProfile;

    #graph:
        | MilestoneGraphSnapshot
        | undefined;

    #artifacts:
        | MilestoneArtifactContext
        | undefined;

    constructor(
        milestone: Milestone,
        profile: MilestoneProfile,
    ) {
        this.#milestone = milestone;
        this.#profile = profile;
    }

    withGraph(
        graph:
            | MilestoneGraphSnapshot
            | undefined,
    ): this {
        this.#graph = graph;

        return this;
    }

    withoutGraph(): this {
        this.#graph = undefined;

        return this;
    }

    withArtifacts(
        artifacts:
            | MilestoneArtifactContext
            | undefined,
    ): this {
        this.#artifacts = artifacts;

        return this;
    }

    withoutArtifacts(): this {
        this.#artifacts = undefined;

        return this;
    }

    build(): MilestoneDocument {
        return createMilestoneDocument({
            milestone: this.#milestone,
            profile: this.#profile,

            ...(this.#graph === undefined
                ? {}
                : {
                    graph: this.#graph,
                }),

            ...(this.#artifacts === undefined
                ? {}
                : {
                    artifacts: this.#artifacts,
                }),
        });
    }
}

/* -------------------------------------------------------------------------- */
/*                         Graph context validation                           */

/* -------------------------------------------------------------------------- */

/**
 * Validates that the optional graph is not merely structurally valid, but is
 * coherent with the exact Milestone aggregate being wrapped by this DOM.
 *
 * This is a context-level invariant rather than a second graph rule engine.
 */
function assertGraphContextCoherent(
    milestone: Milestone,
    graph: MilestoneGraphSnapshot,
): void {
    /*
     * First validate the graph on its own terms:
     *
     * - missing nodes,
     * - missing gate targets,
     * - duplicate dependencies,
     * - cycles,
     * - self-dependencies.
     */
    assertValidGraph(graph);

    const actualNode =
        graph.milestones.get(
            milestone.id,
        );

    invariant(
        actualNode !== undefined,
        "MISSING_GRAPH_NODE",
        `Graph does not contain milestone ${milestone.id}`,
        {
            milestoneId: milestone.id,
        },
    );

    const expectedNode =
        graphNodeFromMilestone(
            milestone,
        );

    assertGraphNodeMatches(
        expectedNode,
        actualNode,
    );

    assertGraphDependenciesMatch(
        milestone,
        graph,
    );
}

/* -------------------------------------------------------------------------- */
/*                           Graph node coherence                             */

/* -------------------------------------------------------------------------- */

/**
 * Ensures the graph node represents the same current aggregate state as the
 * Milestone supplied to the DOM.
 *
 * Without this check a perfectly valid but stale graph could tell the DOM:
 *
 *   "revision 3 is ready"
 *
 * while the Milestone itself is already on revision 4.
 */
function assertGraphNodeMatches(
    expected: MilestoneGraphNode,
    actual: MilestoneGraphNode,
): void {
    invariant(
        actual.revisionId ===
        expected.revisionId,
        "INVALID_ARGUMENT",
        `Graph node ${actual.id} is stale for the supplied Milestone revision`,
        {
            milestoneId: actual.id,
            expectedRevisionId:
            expected.revisionId,
            actualRevisionId:
            actual.revisionId,
        },
    );

    invariant(
        actual.gates.accepted ===
        expected.gates.accepted,
        "INVALID_ARGUMENT",
        `Graph acceptance gate is stale for milestone ${actual.id}`,
        {
            milestoneId: actual.id,
            expected:
            expected.gates.accepted,
            actual:
            actual.gates.accepted,
        },
    );

    invariant(
        actual.gates.completed ===
        expected.gates.completed,
        "INVALID_ARGUMENT",
        `Graph completion gate is stale for milestone ${actual.id}`,
        {
            milestoneId: actual.id,
            expected:
            expected.gates.completed,
            actual:
            actual.gates.completed,
        },
    );

    assertCriterionGateMapsMatch(
        expected.gates.criteria,
        actual.gates.criteria,
        actual.id,
    );

    assertDeliverableGateMapsMatch(
        expected.gates.deliverables,
        actual.gates.deliverables,
        actual.id,
    );
}

/* -------------------------------------------------------------------------- */
/*                           Criterion gates                                  */

/* -------------------------------------------------------------------------- */

function assertCriterionGateMapsMatch(
    expected: ReadonlyMap<
        string,
        CriterionGateState
    >,
    actual: ReadonlyMap<
        string,
        CriterionGateState
    >,
    milestoneId: string,
): void {
    invariant(
        actual.size === expected.size,
        "INVALID_ARGUMENT",
        `Graph criterion gates are stale for milestone ${milestoneId}`,
        {
            milestoneId,
            expectedCount:
            expected.size,
            actualCount:
            actual.size,
        },
    );

    for (
        const [
            criterionId,
            expectedGate,
        ] of expected
        ) {
        const actualGate =
            actual.get(criterionId);

        invariant(
            actualGate !== undefined,
            "MISSING_GATE_TARGET",
            `Graph is missing criterion gate ${criterionId} for milestone ${milestoneId}`,
            {
                milestoneId,
                criterionId,
            },
        );

        invariant(
            actualGate.state ===
            expectedGate.state,
            "INVALID_ARGUMENT",
            `Graph criterion gate ${criterionId} is stale`,
            {
                milestoneId,
                criterionId,
                expectedState:
                expectedGate.state,
                actualState:
                actualGate.state,
            },
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                         Deliverable gates                                  */

/* -------------------------------------------------------------------------- */

function assertDeliverableGateMapsMatch(
    expected: ReadonlyMap<
        string,
        DeliverableGateState
    >,
    actual: ReadonlyMap<
        string,
        DeliverableGateState
    >,
    milestoneId: string,
): void {
    invariant(
        actual.size === expected.size,
        "INVALID_ARGUMENT",
        `Graph deliverable gates are stale for milestone ${milestoneId}`,
        {
            milestoneId,
            expectedCount:
            expected.size,
            actualCount:
            actual.size,
        },
    );

    for (
        const [
            deliverableId,
            expectedGate,
        ] of expected
        ) {
        const actualGate =
            actual.get(deliverableId);

        invariant(
            actualGate !== undefined,
            "MISSING_GATE_TARGET",
            `Graph is missing deliverable gate ${deliverableId} for milestone ${milestoneId}`,
            {
                milestoneId,
                deliverableRequirementId:
                deliverableId,
            },
        );

        invariant(
            actualGate.state ===
            expectedGate.state,
            "INVALID_ARGUMENT",
            `Graph deliverable gate ${deliverableId} is stale`,
            {
                milestoneId,
                deliverableRequirementId:
                deliverableId,
                expectedState:
                expectedGate.state,
                actualState:
                actualGate.state,
            },
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                         Dependency coherence                               */

/* -------------------------------------------------------------------------- */

/**
 * Ensures graph dependencies owned by this Milestone exactly correspond to
 * the aggregate's current Dependency definitions.
 *
 * This is essential because readiness is evaluated against graph.dependencies.
 *
 * If one Milestone dependency disappeared from the supplied graph, the DOM
 * could incorrectly report the milestone as runnable.
 */
function assertGraphDependenciesMatch(
    milestone: Milestone,
    graph: MilestoneGraphSnapshot,
): void {
    const graphDependencies =
        graph.dependencies.filter(
            (dependency) =>
                dependency.milestoneId ===
                milestone.id,
        );

    invariant(
        graphDependencies.length ===
        milestone.dependencies.length,
        "INVALID_ARGUMENT",
        `Graph dependencies are stale for milestone ${milestone.id}`,
        {
            milestoneId: milestone.id,
            expectedCount:
            milestone.dependencies.length,
            actualCount:
            graphDependencies.length,
        },
    );

    const graphById =
        new Map(
            graphDependencies.map(
                (dependency) => [
                    dependency.id,
                    dependency,
                ],
            ),
        );

    for (
        const expected of
        milestone.dependencies
        ) {
        const actual =
            graphById.get(expected.id);

        invariant(
            actual !== undefined,
            "INVALID_ARGUMENT",
            `Graph is missing dependency ${expected.id}`,
            {
                milestoneId:
                milestone.id,
                dependencyId:
                expected.id,
            },
        );

        /*
         * Use the package's canonical semantic dependency identity rather than
         * JSON.stringify() equality.
         */
        invariant(
            graphDependencyIdentityKey(
                actual,
            ) ===
            graphDependencyIdentityKey(
                expected,
            ),
            "INVALID_ARGUMENT",
            `Graph dependency ${expected.id} does not match the Milestone dependency`,
            {
                milestoneId:
                milestone.id,
                dependencyId:
                expected.id,
            },
        );

        /*
         * Blocking is deliberately excluded from dependency semantic identity by
         * the identity helper because it is mutable relationship behavior, so it
         * must be checked separately here.
         */
        invariant(
            actual.blocking ===
            expected.blocking,
            "INVALID_ARGUMENT",
            `Graph dependency ${expected.id} has stale blocking behavior`,
            {
                milestoneId:
                milestone.id,
                dependencyId:
                expected.id,
                expectedBlocking:
                expected.blocking,
                actualBlocking:
                actual.blocking,
            },
        );
    }
}