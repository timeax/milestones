import type {
    ActorRef,
    ApprovalAcceptanceSnapshot,
    ApprovalRecord,
    ApprovalRecordId,
    ApprovalStage,
    ApprovalStageId,
    CriterionId,
    DeliverableRequirementId,
    MilestoneRevisionId,
} from "../../model/domain.js";

import {currentPolicy, evaluateApprovalStage,} from "../../services/evaluation.js";

import type {
    ApprovalRecordDocument,
    ApprovalRecordOverviewDocument,
    ApprovalRecordsDocument,
    ApprovalsDocument,
    ApprovalStageDocument,
    ApprovalStageOverviewDocument,
    ApprovalStagesDocument,
    DocumentListOptions,
    MilestoneDocumentContext,
    TextDocument,
} from "../types.js";

import {indexById, requireFromMap, sliceCollection,} from "../internal/collection.js";

import {createTextDocument,} from "./text.js";

/* -------------------------------------------------------------------------- */
/*                              Stage helpers                                 */

/* -------------------------------------------------------------------------- */

/**
 * Evaluates one Approval Stage using the package's authoritative approval
 * evaluator.
 *
 * The result is always relative to the Milestone's CURRENT revision.
 */
function evaluateStage(
    stage: ApprovalStage,
    context: MilestoneDocumentContext,
): ApprovalAcceptanceSnapshot {
    return evaluateApprovalStage(
        context.milestone,
        stage,
    );
}

/* -------------------------------------------------------------------------- */
/*                         Approval stage overview                            */

/* -------------------------------------------------------------------------- */

/**
 * Lightweight semantic representation of one Approval Stage.
 *
 * Satisfaction information is evaluated against the current Milestone
 * revision.
 */
export class ApprovalStageOverviewDocumentImpl
    implements ApprovalStageOverviewDocument {
    readonly #stage: ApprovalStage;
    readonly #context: MilestoneDocumentContext;

    constructor(
        stage: ApprovalStage,
        context: MilestoneDocumentContext,
    ) {
        this.#stage = stage;
        this.#context = context;
    }

    getId(): ApprovalStageId {
        return this.#stage.id;
    }

    getLabel(): string {
        return this.#stage.label;
    }

    isRequired(): boolean {
        return this.#stage.required;
    }

    getRequiredApprovalCount(): number {
        return this.#stage.requiredApprovalCount;
    }

    /**
     * Number of distinct effective actors with non-revoked grants for this
     * stage on the current Milestone revision.
     */
    getEffectiveApprovalCount(): number {
        return this.#evaluation()
            .effectiveApprovalCount;
    }

    /**
     * Whether this Stage is satisfied for the current Milestone revision.
     *
     * The authoritative evaluator considers the Stage satisfied when:
     *
     * - the Stage is optional, or
     * - it has been waived, or
     * - enough effective approvals exist.
     */
    isSatisfied(): boolean {
        return this.#evaluation().satisfied;
    }

    isWaived(): boolean {
        return this.#evaluation().waived;
    }

    #evaluation(): ApprovalAcceptanceSnapshot {
        return evaluateStage(
            this.#stage,
            this.#context,
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                          Approval stage document                           */

/* -------------------------------------------------------------------------- */

export class ApprovalStageDocumentImpl
    extends ApprovalStageOverviewDocumentImpl
    implements ApprovalStageDocument {
    readonly #stage: ApprovalStage;
    readonly #context: MilestoneDocumentContext;

    constructor(
        stage: ApprovalStage,
        context: MilestoneDocumentContext,
    ) {
        super(
            stage,
            context,
        );

        this.#stage = stage;
        this.#context = context;
    }

    getOverview(): ApprovalStageOverviewDocument {
        return new ApprovalStageOverviewDocumentImpl(
            this.#stage,
            this.#context,
        );
    }

    override getLabel(): string {
        return this.#stage.label;
    }

    override isRequired(): boolean {
        return this.#stage.required;
    }

    getOrder(): number | undefined {
        return this.#stage.order;
    }

    override getRequiredApprovalCount(): number {
        return this.#stage.requiredApprovalCount;
    }

    getScope():
        | "milestone"
        | "criteria"
        | "deliverables" {
        return this.#stage.scope;
    }

    getCriterionIds(): readonly CriterionId[] {
        return [
            ...(this.#stage.criterionIds ?? []),
        ];
    }

    getDeliverableRequirementIds():
        readonly DeliverableRequirementId[] {
        return [
            ...(this.#stage.deliverableRequirementIds ?? []),
        ];
    }

    /**
     * Host-owned authority selector.
     *
     * The Milestone SDK does not resolve or interpret this value.
     */
    getAuthorityRef(): string | undefined {
        return this.#stage.authorityRef;
    }

    override getEffectiveApprovalCount(): number {
        return this.#evaluation()
            .effectiveApprovalCount;
    }

    /**
     * Canonical effective actor keys produced by the approval evaluator.
     *
     * These are intentionally strings rather than reconstructed ActorRef
     * objects because the evaluator's canonical identity includes actor type.
     */
    getEffectiveActorIds(): readonly string[] {
        return [
            ...this.#evaluation().actorIds,
        ];
    }

    override isSatisfied(): boolean {
        return this.#evaluation().satisfied;
    }

    override isWaived(): boolean {
        return this.#evaluation().waived;
    }

    #evaluation(): ApprovalAcceptanceSnapshot {
        return evaluateStage(
            this.#stage,
            this.#context,
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                         Approval record overview                           */

/* -------------------------------------------------------------------------- */

/**
 * Lightweight historical representation of an Approval Record.
 *
 * Unlike ApprovalStageDocument, records are historical facts and are not
 * limited to the current revision.
 */
export class ApprovalRecordOverviewDocumentImpl
    implements ApprovalRecordOverviewDocument {
    readonly #record: ApprovalRecord;

    constructor(
        record: ApprovalRecord,
    ) {
        this.#record = record;
    }

    getId(): ApprovalRecordId {
        return this.#record.id;
    }

    getStageId(): ApprovalStageId {
        return this.#record.stageId;
    }

    getRevisionId(): MilestoneRevisionId {
        return this.#record.milestoneRevisionId;
    }

    getType():
        | "granted"
        | "rejected"
        | "revoked"
        | "waived" {
        return this.#record.type;
    }

    getActor(): ActorRef {
        return this.#record.actor;
    }

    getCreatedAt(): string {
        return this.#record.createdAt;
    }
}

/* -------------------------------------------------------------------------- */
/*                          Approval record document                          */

/* -------------------------------------------------------------------------- */

export class ApprovalRecordDocumentImpl
    extends ApprovalRecordOverviewDocumentImpl
    implements ApprovalRecordDocument {
    readonly #record: ApprovalRecord;
    readonly #reason: TextDocument;

    constructor(
        record: ApprovalRecord,
    ) {
        super(record);

        this.#record = record;

        this.#reason = createTextDocument(
            approvalRecordReason(record),
        );
    }

    /**
     * Rejection, revocation and waiver records may contain narrative reasons.
     *
     * Granted records return an empty TextDocument.
     */
    getReason(): TextDocument {
        return this.#reason;
    }

    /**
     * ID of the previously granted Approval invalidated by this Record.
     *
     * Only revocation records have this value.
     */
    getRevokedApprovalId():
        | ApprovalRecordId
        | undefined {
        return this.#record.type === "revoked"
            ? this.#record.revokesApprovalId
            : undefined;
    }
}

function approvalRecordReason(
    record: ApprovalRecord,
): string | undefined {
    switch (record.type) {
        case "granted":
            return undefined;

        case "rejected":
        case "revoked":
        case "waived":
            return record.reason;
    }
}

/* -------------------------------------------------------------------------- */
/*                          Approval stages collection                        */

/* -------------------------------------------------------------------------- */

export class ApprovalStagesDocumentImpl
    implements ApprovalStagesDocument {
    readonly #context: MilestoneDocumentContext;
    readonly #stages: readonly ApprovalStage[];

    readonly #byId: ReadonlyMap<
        ApprovalStageId,
        ApprovalStage
    >;

    constructor(
        context: MilestoneDocumentContext,
    ) {
        this.#context = context;

        this.#stages = [
            ...(context.milestone.approvalPolicy
                ?.stages ?? []),
        ];

        this.#byId = indexById(
            this.#stages,
            (stage) => stage.id,
            "Approval Stage",
        );
    }

    getCount(): number {
        return this.#stages.length;
    }

    isEmpty(): boolean {
        return this.#stages.length === 0;
    }

    has(
        id: ApprovalStageId,
    ): boolean {
        return this.#byId.has(id);
    }

    list(
        options: DocumentListOptions = {},
    ): readonly ApprovalStageOverviewDocument[] {
        return sliceCollection(
            this.#stages,
            options,
        ).map(
            (stage) =>
                new ApprovalStageOverviewDocumentImpl(
                    stage,
                    this.#context,
                ),
        );
    }

    get(
        id: ApprovalStageId,
    ): ApprovalStageDocument | undefined {
        const stage = this.#byId.get(id);

        if (stage === undefined) {
            return undefined;
        }

        return this.#createDocument(stage);
    }

    require(
        id: ApprovalStageId,
    ): ApprovalStageDocument {
        return this.#createDocument(
            requireFromMap(
                this.#byId,
                id,
                "Approval Stage",
            ),
        );
    }

    getRequired():
        readonly ApprovalStageDocument[] {
        return this.#stages
            .filter(
                (stage) => stage.required,
            )
            .map(
                (stage) =>
                    this.#createDocument(stage),
            );
    }

    /**
     * Required Stages that are not currently satisfied.
     *
     * Optional Stages are not "pending" even if they have no Approval Records,
     * because the authoritative evaluator considers optional stages satisfied.
     */
    getPending():
        readonly ApprovalStageDocument[] {
        return this.#stages
            .filter(
                (stage) =>
                    stage.required &&
                    !evaluateStage(
                        stage,
                        this.#context,
                    ).satisfied,
            )
            .map(
                (stage) =>
                    this.#createDocument(stage),
            );
    }

    getSatisfied():
        readonly ApprovalStageDocument[] {
        return this.#stages
            .filter(
                (stage) =>
                    evaluateStage(
                        stage,
                        this.#context,
                    ).satisfied,
            )
            .map(
                (stage) =>
                    this.#createDocument(stage),
            );
    }

    #createDocument(
        stage: ApprovalStage,
    ): ApprovalStageDocument {
        return new ApprovalStageDocumentImpl(
            stage,
            this.#context,
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                         Approval records collection                        */

/* -------------------------------------------------------------------------- */

export class ApprovalRecordsDocumentImpl
    implements ApprovalRecordsDocument {
    readonly #records:
        readonly ApprovalRecord[];

    readonly #byId: ReadonlyMap<
        ApprovalRecordId,
        ApprovalRecord
    >;

    constructor(
        context: MilestoneDocumentContext,
    ) {
        this.#records = [
            ...context.milestone.approvalRecords,
        ];

        this.#byId = indexById(
            this.#records,
            (record) => record.id,
            "Approval Record",
        );
    }

    getCount(): number {
        return this.#records.length;
    }

    isEmpty(): boolean {
        return this.#records.length === 0;
    }

    has(
        id: ApprovalRecordId,
    ): boolean {
        return this.#byId.has(id);
    }

    list(
        options: DocumentListOptions = {},
    ): readonly ApprovalRecordOverviewDocument[] {
        return sliceCollection(
            this.#records,
            options,
        ).map(
            (record) =>
                new ApprovalRecordOverviewDocumentImpl(
                    record,
                ),
        );
    }

    get(
        id: ApprovalRecordId,
    ): ApprovalRecordDocument | undefined {
        const record = this.#byId.get(id);

        return record === undefined
            ? undefined
            : this.#createDocument(record);
    }

    require(
        id: ApprovalRecordId,
    ): ApprovalRecordDocument {
        return this.#createDocument(
            requireFromMap(
                this.#byId,
                id,
                "Approval Record",
            ),
        );
    }

    getForStage(
        stageId: ApprovalStageId,
    ): readonly ApprovalRecordDocument[] {
        return this.#records
            .filter(
                (record) =>
                    record.stageId === stageId,
            )
            .map(
                (record) =>
                    this.#createDocument(record),
            );
    }

    getForRevision(
        revisionId: MilestoneRevisionId,
    ): readonly ApprovalRecordDocument[] {
        return this.#records
            .filter(
                (record) =>
                    record.milestoneRevisionId ===
                    revisionId,
            )
            .map(
                (record) =>
                    this.#createDocument(record),
            );
    }

    #createDocument(
        record: ApprovalRecord,
    ): ApprovalRecordDocument {
        return new ApprovalRecordDocumentImpl(
            record,
        );
    }
}

/* -------------------------------------------------------------------------- */
/*                              Approvals root                                */

/* -------------------------------------------------------------------------- */

/**
 * Semantic Approval subtree for one Milestone.
 *
 * This separates:
 *
 *   Policy/stages
 *      from
 *   append-only Approval history
 *      from
 *   current acceptance satisfaction
 */
export class ApprovalsDocumentImpl
    implements ApprovalsDocument {
    readonly #context: MilestoneDocumentContext;

    readonly #stages: ApprovalStagesDocument;
    readonly #records: ApprovalRecordsDocument;

    constructor(
        context: MilestoneDocumentContext,
    ) {
        this.#context = context;

        this.#stages =
            new ApprovalStagesDocumentImpl(
                context,
            );

        this.#records =
            new ApprovalRecordsDocumentImpl(
                context,
            );
    }

    /**
     * Whether the loaded Milestone Profile enables Approvals at all.
     */
    isEnabled(): boolean {
        return this.#context.profile
            .approvals.enabled;
    }

    /**
     * Whether Approvals currently form a requirement for acceptance.
     *
     * This deliberately mirrors evaluateAcceptance():
     *
     *   profile.approvals.enabled
     *   &&
     *   currentPolicy.requireApprovalsWhenProfileRequires
     */
    isRequired(): boolean {
        const policy = currentPolicy(
            this.#context.milestone,
        );

        return (
            this.#context.profile
                .approvals.enabled &&
            policy.requireApprovalsWhenProfileRequires
        );
    }

    /**
     * Whether the Approval portion of CURRENT acceptance is satisfied.
     *
     * If Approvals are not currently required for acceptance, this returns true.
     */
    isSatisfied(): boolean {
        if (!this.isRequired()) {
            return true;
        }

        return (
            this.#stages
                .getPending()
                .length === 0
        );
    }

    getStages(): ApprovalStagesDocument {
        return this.#stages;
    }

    getRecords(): ApprovalRecordsDocument {
        return this.#records;
    }
}

/* -------------------------------------------------------------------------- */
/*                                 Factories                                  */

/* -------------------------------------------------------------------------- */

export function createApprovalsDocument(
    context: MilestoneDocumentContext,
): ApprovalsDocument {
    return new ApprovalsDocumentImpl(
        context,
    );
}

export function createApprovalStageDocument(
    stage: ApprovalStage,
    context: MilestoneDocumentContext,
): ApprovalStageDocument {
    return new ApprovalStageDocumentImpl(
        stage,
        context,
    );
}

export function createApprovalRecordDocument(
    record: ApprovalRecord,
): ApprovalRecordDocument {
    return new ApprovalRecordDocumentImpl(
        record,
    );
}