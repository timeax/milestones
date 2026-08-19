import type {ArtifactRequirementId,} from "@elqora/artifacts";

import type {
    DeliverableRequirement,
    DeliverableRequirementId,
    DeliverableRequirementState,
} from "../../model/domain.js";

import {currentPolicy, evaluateArtifacts,} from "../../services/evaluation.js";

import type {
    DeliverableDocument,
    DeliverableOverviewDocument,
    DeliverablesDocument,
    DocumentListOptions,
    MilestoneDocumentContext,
    MilestoneSourcesDocument,
    TextDocument,
} from "../types.js";

import {indexById, requireFromMap, sliceCollection,} from "../internal/collection.js";

import {createSourcesDocument,} from "./sources.js";

import {createTextDocument,} from "./text.js";

/* -------------------------------------------------------------------------- */
/*                          Deliverable overview                              */

/* -------------------------------------------------------------------------- */

/**
 * Lightweight DOM representation of a Deliverable Requirement.
 *
 * This is suitable for collection listings and other places where callers
 * need identity and state without traversing the complete child document.
 *
 * Potentially large narrative content remains behind TextDocument.
 */
export class DeliverableOverviewDocumentImpl
    implements DeliverableOverviewDocument {
    readonly #deliverable: DeliverableRequirement;
    readonly #description: TextDocument;

    constructor(
        deliverable: DeliverableRequirement,
    ) {
        this.#deliverable = deliverable;

        this.#description = createTextDocument(
            deliverable.description,
        );
    }

    getId(): DeliverableRequirementId {
        return this.#deliverable.id;
    }

    getTitle(): string {
        return this.#deliverable.title;
    }

    getState(): DeliverableRequirementState {
        return this.#deliverable.state;
    }

    isRequired(): boolean {
        return this.#deliverable.required;
    }

    getDescription(): TextDocument {
        return this.#description;
    }

    hasDescription(): boolean {
        return !this.#description.isEmpty();
    }
}

/* -------------------------------------------------------------------------- */
/*                          Deliverable document                              */

/* -------------------------------------------------------------------------- */

/**
 * Full semantic DOM representation of one Deliverable Requirement.
 *
 * This class does not mutate the underlying Deliverable Requirement.
 *
 * State transitions and other changes continue to belong to MilestoneEditor.
 */
export class DeliverableDocumentImpl
    extends DeliverableOverviewDocumentImpl
    implements DeliverableDocument {
    readonly #deliverable: DeliverableRequirement;
    readonly #context: MilestoneDocumentContext;
    readonly #description: TextDocument;

    constructor(
        deliverable: DeliverableRequirement,
        context: MilestoneDocumentContext,
    ) {
        super(deliverable);

        this.#deliverable = deliverable;
        this.#context = context;

        this.#description = createTextDocument(
            deliverable.description,
        );
    }

    getOverview(): DeliverableOverviewDocument {
        return new DeliverableOverviewDocumentImpl(
            this.#deliverable,
        );
    }

    override getTitle(): string {
        return this.#deliverable.title;
    }

    override getDescription(): TextDocument {
        return this.#description;
    }

    override hasDescription(): boolean {
        return !this.#description.isEmpty();
    }

    override getState(): DeliverableRequirementState {
        return this.#deliverable.state;
    }

    override isRequired(): boolean {
        return this.#deliverable.required;
    }

    /**
     * Whether this Deliverable is currently semantically satisfied.
     *
     * Satisfaction follows the same rules used by milestone acceptance:
     *
     *   1. its state must satisfy the current revision evaluation policy, and
     *   2. all Artifact requirements attached to the Deliverable must be
     *      satisfied.
     *
     * This deliberately does not reduce satisfaction to:
     *
     *   deliverable.state === "satisfied"
     */
    isSatisfied(): boolean {
        const policy = currentPolicy(
            this.#context.milestone,
        );

        const stateSatisfied =
            this.#deliverable.state === "satisfied" ||
            (
                this.#deliverable.state === "waived" &&
                policy.waivedDeliverablesSatisfyRequired
            );

        if (!stateSatisfied) {
            return false;
        }

        const artifacts = evaluateArtifacts(
            {
                type: "deliverable_requirement",
                id: this.#deliverable.id,
                requirementIds:
                    this.#deliverable.artifactRequirementIds ?? [],
            },
            this.#context.artifacts,
        );

        return artifacts.satisfied;
    }

    isWaived(): boolean {
        return this.#deliverable.state === "waived";
    }

    getArtifactRequirementIds():
        readonly ArtifactRequirementId[] {
        return [
            ...(this.#deliverable.artifactRequirementIds ?? []),
        ];
    }

    /**
     * Sources attached specifically to this Deliverable Requirement.
     */
    getSources(): MilestoneSourcesDocument {
        return createSourcesDocument(
            this.#deliverable.sourceLinks,
            this.#context.artifacts,
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                           Deliverables collection                          */

/* -------------------------------------------------------------------------- */

/**
 * Collection DOM for the Deliverable Requirements belonging to one Milestone.
 */
export class DeliverablesDocumentImpl
    implements DeliverablesDocument {
    readonly #context: MilestoneDocumentContext;

    readonly #deliverables:
        readonly DeliverableRequirement[];

    readonly #byId: ReadonlyMap<
        DeliverableRequirementId,
        DeliverableRequirement
    >;

    constructor(
        context: MilestoneDocumentContext,
    ) {
        this.#context = context;

        this.#deliverables = [
            ...context.milestone.deliverables,
        ];

        this.#byId = indexById(
            this.#deliverables,
            (deliverable) => deliverable.id,
            "Deliverable Requirement",
        );
    }

    getCount(): number {
        return this.#deliverables.length;
    }

    isEmpty(): boolean {
        return this.#deliverables.length === 0;
    }

    has(
        id: DeliverableRequirementId,
    ): boolean {
        return this.#byId.has(id);
    }

    /**
     * Returns a bounded lightweight listing.
     *
     * No Artifact evaluation or Source resolution is required simply to list
     * Deliverables.
     */
    list(
        options: DocumentListOptions = {},
    ): readonly DeliverableOverviewDocument[] {
        return sliceCollection(
            this.#deliverables,
            options,
        ).map(
            (deliverable) =>
                new DeliverableOverviewDocumentImpl(
                    deliverable,
                ),
        );
    }

    get(
        id: DeliverableRequirementId,
    ): DeliverableDocument | undefined {
        const deliverable = this.#byId.get(id);

        if (deliverable === undefined) {
            return undefined;
        }

        return this.#createDocument(
            deliverable,
        );
    }

    require(
        id: DeliverableRequirementId,
    ): DeliverableDocument {
        const deliverable = requireFromMap(
            this.#byId,
            id,
            "Deliverable Requirement",
        );

        return this.#createDocument(
            deliverable,
        );
    }

    getRequired():
        readonly DeliverableDocument[] {
        return this.#deliverables
            .filter(
                (deliverable) =>
                    deliverable.required,
            )
            .map(
                (deliverable) =>
                    this.#createDocument(
                        deliverable,
                    ),
            );
    }

    getOptional():
        readonly DeliverableDocument[] {
        return this.#deliverables
            .filter(
                (deliverable) =>
                    !deliverable.required,
            )
            .map(
                (deliverable) =>
                    this.#createDocument(
                        deliverable,
                    ),
            );
    }

    /**
     * Returns semantically satisfied Deliverables.
     *
     * This intentionally uses DeliverableDocument.isSatisfied() rather than
     * filtering only by raw state.
     */
    getSatisfied():
        readonly DeliverableDocument[] {
        return this.#deliverables
            .map(
                (deliverable) =>
                    this.#createDocument(
                        deliverable,
                    ),
            )
            .filter(
                (deliverable) =>
                    deliverable.isSatisfied(),
            );
    }

    /**
     * Returns Deliverables that are not currently semantically satisfied.
     *
     * Artifact requirements and waiver policy are therefore respected.
     */
    getUnsatisfied():
        readonly DeliverableDocument[] {
        return this.#deliverables
            .map(
                (deliverable) =>
                    this.#createDocument(
                        deliverable,
                    ),
            )
            .filter(
                (deliverable) =>
                    !deliverable.isSatisfied(),
            );
    }

    getByState(
        state: DeliverableRequirementState,
    ): readonly DeliverableDocument[] {
        return this.#deliverables
            .filter(
                (deliverable) =>
                    deliverable.state === state,
            )
            .map(
                (deliverable) =>
                    this.#createDocument(
                        deliverable,
                    ),
            );
    }

    #createDocument(
        deliverable: DeliverableRequirement,
    ): DeliverableDocument {
        return new DeliverableDocumentImpl(
            deliverable,
            this.#context,
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                                 Factories                                  */

/* -------------------------------------------------------------------------- */

/**
 * Creates the Deliverables collection for a Milestone DOM.
 */
export function createDeliverablesDocument(
    context: MilestoneDocumentContext,
): DeliverablesDocument {
    return new DeliverablesDocumentImpl(
        context,
    );
}

/**
 * Creates a Deliverable Document from an already-resolved domain record.
 */
export function createDeliverableDocument(
    deliverable: DeliverableRequirement,
    context: MilestoneDocumentContext,
): DeliverableDocument {
    return new DeliverableDocumentImpl(
        deliverable,
        context,
    );
}