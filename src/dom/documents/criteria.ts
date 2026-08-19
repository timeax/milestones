import type {Criterion, CriterionId, CriterionState,} from "../../model/domain.js";

import {currentPolicy, evaluateArtifacts,} from "../../services/evaluation.js";

import type {
    CriteriaDocument,
    CriterionDocument,
    CriterionOverviewDocument,
    DocumentListOptions,
    MilestoneDocumentContext,
    MilestoneSourcesDocument,
    TextDocument,
} from "../types.js";

import {indexById, requireFromMap, sliceCollection,} from "../internal/collection.js";

import {createSourcesDocument,} from "./sources.js";

import {createTextDocument,} from "./text.js";

/* -------------------------------------------------------------------------- */
/*                            Criterion overview                              */

/* -------------------------------------------------------------------------- */

/**
 * Lightweight DOM representation of a Criterion.
 *
 * The overview exposes enough information for listings and navigation while
 * keeping potentially large narrative content behind TextDocument.
 */
export class CriterionOverviewDocumentImpl
    implements CriterionOverviewDocument {
    readonly #criterion: Criterion;
    readonly #description: TextDocument;

    constructor(
        criterion: Criterion,
    ) {
        this.#criterion = criterion;
        this.#description = createTextDocument(
            criterion.description,
        );
    }

    getId(): CriterionId {
        return this.#criterion.id;
    }

    getTitle(): string {
        return this.#criterion.title;
    }

    getState(): CriterionState {
        return this.#criterion.state;
    }

    isRequired(): boolean {
        return this.#criterion.required;
    }

    /**
     * Criteria without an explicit weight use the same default weight as the
     * authoritative progress evaluator.
     */
    getWeight(): number {
        return this.#criterion.weight ?? 1;
    }

    getDescription(): TextDocument {
        return this.#description;
    }

    hasDescription(): boolean {
        return !this.#description.isEmpty();
    }
}

/* -------------------------------------------------------------------------- */
/*                            Criterion document                              */

/* -------------------------------------------------------------------------- */

/**
 * Full semantic DOM representation of one milestone Criterion.
 *
 * The Criterion domain record remains immutable. This Document only exposes
 * semantic queries and child navigation.
 */
export class CriterionDocumentImpl
    extends CriterionOverviewDocumentImpl
    implements CriterionDocument {
    readonly #criterion: Criterion;
    readonly #context: MilestoneDocumentContext;
    readonly #description: TextDocument;

    constructor(
        criterion: Criterion,
        context: MilestoneDocumentContext,
    ) {
        super(criterion);

        this.#criterion = criterion;
        this.#context = context;
        this.#description = createTextDocument(
            criterion.description,
        );
    }

    getOverview(): CriterionOverviewDocument {
        return new CriterionOverviewDocumentImpl(
            this.#criterion,
        );
    }

    override getTitle(): string {
        return this.#criterion.title;
    }

    override getDescription(): TextDocument {
        return this.#description;
    }

    override hasDescription(): boolean {
        return !this.#description.isEmpty();
    }

    override getState(): CriterionState {
        return this.#criterion.state;
    }

    override isRequired(): boolean {
        return this.#criterion.required;
    }

    override getWeight(): number {
        return this.#criterion.weight ?? 1;
    }

    isVerified(): boolean {
        return this.#criterion.state === "verified";
    }

    isWaived(): boolean {
        return this.#criterion.state === "waived";
    }

    /**
     * Returns whether this Criterion is currently semantically satisfied.
     *
     * This deliberately reuses the same policy and Artifact evaluation rules
     * used by milestone acceptance.
     *
     * Satisfaction therefore means:
     *
     *   1. the Criterion's state satisfies the current evaluation policy, and
     *   2. every Artifact requirement attached to the Criterion is satisfied.
     *
     * It does not mean merely `state === "verified"`.
     */
    isSatisfied(): boolean {
        const policy = currentPolicy(
            this.#context.milestone,
        );

        const stateSatisfied =
            this.#criterion.state === "verified" ||
            (
                this.#criterion.state === "waived" &&
                policy.waivedCriteriaSatisfyRequired
            );

        if (!stateSatisfied) {
            return false;
        }

        const artifacts = evaluateArtifacts(
            {
                type: "criterion",
                id: this.#criterion.id,
                requirementIds:
                    this.#criterion.artifactRequirementIds ?? [],
            },
            this.#context.artifacts,
        );

        return artifacts.satisfied;
    }

    getArtifactRequirementIds() {
        return [
            ...(this.#criterion.artifactRequirementIds ?? []),
        ];
    }

    /**
     * Sources attached specifically to this Criterion.
     *
     * Source resolution remains delegated to the Sources DOM and existing
     * milestone Source services.
     */
    getSources(): MilestoneSourcesDocument {
        return createSourcesDocument(
            this.#criterion.sourceLinks,
            this.#context.artifacts,
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                             Criteria collection                            */

/* -------------------------------------------------------------------------- */

/**
 * Collection DOM for all Criteria in one Milestone.
 */
export class CriteriaDocumentImpl
    implements CriteriaDocument {
    readonly #context: MilestoneDocumentContext;
    readonly #criteria: readonly Criterion[];
    readonly #byId: ReadonlyMap<
        CriterionId,
        Criterion
    >;

    constructor(
        context: MilestoneDocumentContext,
    ) {
        this.#context = context;
        this.#criteria = [
            ...context.milestone.criteria,
        ];

        this.#byId = indexById(
            this.#criteria,
            (criterion) => criterion.id,
            "Criterion",
        );
    }

    getCount(): number {
        return this.#criteria.length;
    }

    isEmpty(): boolean {
        return this.#criteria.length === 0;
    }

    has(
        id: CriterionId,
    ): boolean {
        return this.#byId.has(id);
    }

    /**
     * Lightweight, bounded Criterion listing.
     *
     * This does not perform Artifact evaluation or Source resolution.
     */
    list(
        options: DocumentListOptions = {},
    ): readonly CriterionOverviewDocument[] {
        return sliceCollection(
            this.#criteria,
            options,
        ).map(
            (criterion) =>
                new CriterionOverviewDocumentImpl(
                    criterion,
                ),
        );
    }

    get(
        id: CriterionId,
    ): CriterionDocument | undefined {
        const criterion = this.#byId.get(id);

        if (criterion === undefined) {
            return undefined;
        }

        return this.#createDocument(
            criterion,
        );
    }

    require(
        id: CriterionId,
    ): CriterionDocument {
        const criterion = requireFromMap(
            this.#byId,
            id,
            "Criterion",
        );

        return this.#createDocument(
            criterion,
        );
    }

    getRequired(): readonly CriterionDocument[] {
        return this.#criteria
            .filter(
                (criterion) => criterion.required,
            )
            .map(
                (criterion) =>
                    this.#createDocument(criterion),
            );
    }

    getOptional(): readonly CriterionDocument[] {
        return this.#criteria
            .filter(
                (criterion) => !criterion.required,
            )
            .map(
                (criterion) =>
                    this.#createDocument(criterion),
            );
    }

    getVerified(): readonly CriterionDocument[] {
        return this.#criteria
            .filter(
                (criterion) =>
                    criterion.state === "verified",
            )
            .map(
                (criterion) =>
                    this.#createDocument(criterion),
            );
    }

    /**
     * Semantically unsatisfied Criteria.
     *
     * This intentionally uses CriterionDocument.isSatisfied() rather than
     * inspecting Criterion.state directly because Artifact requirements and
     * waiver policy affect satisfaction.
     */
    getUnsatisfied(): readonly CriterionDocument[] {
        return this.#criteria
            .map(
                (criterion) =>
                    this.#createDocument(criterion),
            )
            .filter(
                (criterion) =>
                    !criterion.isSatisfied(),
            );
    }

    getByState(
        state: CriterionState,
    ): readonly CriterionDocument[] {
        return this.#criteria
            .filter(
                (criterion) =>
                    criterion.state === state,
            )
            .map(
                (criterion) =>
                    this.#createDocument(criterion),
            );
    }

    #createDocument(
        criterion: Criterion,
    ): CriterionDocument {
        return new CriterionDocumentImpl(
            criterion,
            this.#context,
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                                 Factories                                  */

/* -------------------------------------------------------------------------- */

/**
 * Creates the Criteria collection for a Milestone DOM.
 */
export function createCriteriaDocument(
    context: MilestoneDocumentContext,
): CriteriaDocument {
    return new CriteriaDocumentImpl(
        context,
    );
}

/**
 * Creates a Criterion Document from one known Criterion.
 *
 * Useful for parent Documents that already resolved the Criterion and do not
 * need to traverse the collection again.
 */
export function createCriterionDocument(
    criterion: Criterion,
    context: MilestoneDocumentContext,
): CriterionDocument {
    return new CriterionDocumentImpl(
        criterion,
        context,
    );
}