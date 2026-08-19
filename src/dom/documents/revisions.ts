import type {
  ArtifactRequirementId,
} from "@elqora/artifacts";

import type {
  ActorRef,
  ApprovalPolicySnapshot,
  ApprovalStage,
  ApprovalStageId,
  CriterionDefinitionSnapshot,
  CriterionId,
  DeliverableDefinitionSnapshot,
  DeliverableRequirementId,
  DependencyDefinitionSnapshot,
  DependencyId,
  MilestoneDependencyGate,
  MilestoneEvaluationPolicySnapshot,
  MilestoneId,
  MilestoneProfileId,
  MilestoneRevision,
  MilestoneRevisionId,
  MilestoneRevisionSnapshot,
  MilestoneSourceSnapshot,
} from "../../model/domain.js";

import type {
  ApprovalPolicySnapshotDocument,
  ApprovalStageDefinitionDocument,
  CriterionDefinitionDocument,
  DeliverableDefinitionDocument,
  DependencyDefinitionDocument,
  DocumentListOptions,
  MilestoneDefinitionDocument,
  MilestoneDocumentContext,
  MilestoneEvaluationPolicyDocument,
  MilestoneRevisionSnapshotDocument,
  MilestoneSourceSnapshotDocument,
  MilestoneSourcesDocument,
  RevisionDocument,
  RevisionOverviewDocument,
  RevisionsDocument,
  TextDocument,
} from "../types.js";

import {
  indexById,
  indexByUniqueKey,
  normalizeNonNegativeInteger,
  requireFromMap,
  sliceCollection,
} from "../internal/collection.js";

import {
  createDefinitionDocument,
} from "./definition.js";

import {
  createSourcesDocument,
  MilestoneSourceSnapshotDocumentImpl,
} from "./sources.js";

import {
  createTextDocument,
} from "./text.js";

/* -------------------------------------------------------------------------- */
/*                         Historical Source helpers                          */
/* -------------------------------------------------------------------------- */

/**
 * Selects historical Source snapshots belonging to one specific subject.
 *
 * Unlike live Source documents, these are already resolved historical
 * snapshots. No Artifact context or current-version resolution is performed.
 */
function sourceSnapshotsForSubject(
  sources: readonly MilestoneSourceSnapshot[],
  type: MilestoneSourceSnapshot["subject"]["type"],
  id: string,
): readonly MilestoneSourceSnapshot[] {
  return sources.filter(
    (source) =>
      source.subject.type === type &&
      source.subject.id === id,
  );
}

function createSourceSnapshotDocuments(
  sources: readonly MilestoneSourceSnapshot[],
): readonly MilestoneSourceSnapshotDocument[] {
  return sources.map(
    (source) =>
      new MilestoneSourceSnapshotDocumentImpl(
        source,
      ),
  );
}

/* -------------------------------------------------------------------------- */
/*                        Evaluation policy document                          */
/* -------------------------------------------------------------------------- */

/**
 * Read-only DOM representation of the evaluation policy captured at a
 * Milestone Revision.
 *
 * This must use the captured policy, not currentPolicy(milestone), because
 * historical revision interpretation must not change when the current policy
 * changes later.
 */
export class MilestoneEvaluationPolicyDocumentImpl
  implements MilestoneEvaluationPolicyDocument
{
  readonly #policy:
    MilestoneEvaluationPolicySnapshot;

  constructor(
    policy: MilestoneEvaluationPolicySnapshot,
  ) {
    this.#policy = policy;
  }

  requiredCriteriaMustBeVerified(): boolean {
    return this.#policy
      .requiredCriteriaMustBeVerified;
  }

  requiredDeliverablesMustBeSatisfied(): boolean {
    return this.#policy
      .requiredDeliverablesMustBeSatisfied;
  }

  waivedCriteriaSatisfyRequired(): boolean {
    return this.#policy
      .waivedCriteriaSatisfyRequired;
  }

  waivedDeliverablesSatisfyRequired(): boolean {
    return this.#policy
      .waivedDeliverablesSatisfyRequired;
  }

  blockingChallengesPreventAcceptance(): boolean {
    return this.#policy
      .blockingChallengesPreventAcceptance;
  }

  getRequiredReviewResult(): "accepted" {
    return this.#policy.requiredReviewResult;
  }

  requireReviewWhenProfileRequires(): boolean {
    return this.#policy
      .requireReviewWhenProfileRequires;
  }

  requireApprovalsWhenProfileRequires(): boolean {
    return this.#policy
      .requireApprovalsWhenProfileRequires;
  }

  completionRequiresCurrentAcceptance(): boolean {
    return this.#policy
      .completionRequiresCurrentAcceptance;
  }

  closeImmediatelyOnAcceptance(): boolean {
    return this.#policy
      .closeImmediatelyOnAcceptance;
  }
}

/* -------------------------------------------------------------------------- */
/*                      Criterion definition document                         */
/* -------------------------------------------------------------------------- */

/**
 * Historical Criterion definition.
 *
 * CriterionDefinitionSnapshot deliberately has no CriterionState. A revision
 * records what the Criterion DEFINITION was, not its later execution state.
 */
export class CriterionDefinitionDocumentImpl
  implements CriterionDefinitionDocument
{
  readonly #criterion:
    CriterionDefinitionSnapshot;

  readonly #sources:
    readonly MilestoneSourceSnapshot[];

  readonly #description: TextDocument;

  constructor(
    criterion: CriterionDefinitionSnapshot,
    snapshotSources:
      readonly MilestoneSourceSnapshot[],
  ) {
    this.#criterion = criterion;

    this.#description = createTextDocument(
      criterion.description,
    );

    this.#sources = sourceSnapshotsForSubject(
      snapshotSources,
      "criterion",
      criterion.id,
    );
  }

  getId(): CriterionId {
    return this.#criterion.id;
  }

  getTitle(): string {
    return this.#criterion.title;
  }

  getDescription(): TextDocument {
    return this.#description;
  }

  isRequired(): boolean {
    return this.#criterion.required;
  }

  getWeight(): number {
    return this.#criterion.weight ?? 1;
  }

  getArtifactRequirementIds():
    readonly ArtifactRequirementId[] {
    return [
      ...(this.#criterion
        .artifactRequirementIds ?? []),
    ];
  }

  /**
   * Historical resolved Sources, not the current state of any Artifact.
   */
  getSources():
    readonly MilestoneSourceSnapshotDocument[] {
    return createSourceSnapshotDocuments(
      this.#sources,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                    Deliverable definition document                         */
/* -------------------------------------------------------------------------- */

export class DeliverableDefinitionDocumentImpl
  implements DeliverableDefinitionDocument
{
  readonly #deliverable:
    DeliverableDefinitionSnapshot;

  readonly #sources:
    readonly MilestoneSourceSnapshot[];

  readonly #description: TextDocument;

  constructor(
    deliverable: DeliverableDefinitionSnapshot,
    snapshotSources:
      readonly MilestoneSourceSnapshot[],
  ) {
    this.#deliverable = deliverable;

    this.#description = createTextDocument(
      deliverable.description,
    );

    this.#sources = sourceSnapshotsForSubject(
      snapshotSources,
      "deliverable_requirement",
      deliverable.id,
    );
  }

  getId(): DeliverableRequirementId {
    return this.#deliverable.id;
  }

  getTitle(): string {
    return this.#deliverable.title;
  }

  getDescription(): TextDocument {
    return this.#description;
  }

  isRequired(): boolean {
    return this.#deliverable.required;
  }

  getArtifactRequirementIds():
    readonly ArtifactRequirementId[] {
    return [
      ...(this.#deliverable
        .artifactRequirementIds ?? []),
    ];
  }

  getSources():
    readonly MilestoneSourceSnapshotDocument[] {
    return createSourceSnapshotDocuments(
      this.#sources,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                    Dependency definition document                          */
/* -------------------------------------------------------------------------- */

/**
 * Historical Dependency definition.
 *
 * This intentionally has no isSatisfied().
 *
 * Satisfaction belongs to a particular graph state at a particular point in
 * time. The revision snapshot only records the dependency definition.
 */
export class DependencyDefinitionDocumentImpl
  implements DependencyDefinitionDocument
{
  readonly #dependency:
    DependencyDefinitionSnapshot;

  constructor(
    dependency: DependencyDefinitionSnapshot,
  ) {
    this.#dependency = dependency;
  }

  getId(): DependencyId {
    return this.#dependency.id;
  }

  getMilestoneId(): MilestoneId {
    return this.#dependency.milestoneId;
  }

  getDependsOnMilestoneId(): MilestoneId {
    return this.#dependency.dependsOnMilestoneId;
  }

  getGate(): MilestoneDependencyGate {
    return structuredClone(
      this.#dependency.gate,
    );
  }

  isBlocking(): boolean {
    return this.#dependency.blocking;
  }
}

/* -------------------------------------------------------------------------- */
/*                     Approval stage definition                              */
/* -------------------------------------------------------------------------- */

/**
 * Historical Approval Stage definition.
 *
 * This does not expose isSatisfied(), effective approval counts, etc. Those
 * depend on Approval Records and revision execution state rather than this
 * immutable policy snapshot.
 */
export class ApprovalStageDefinitionDocumentImpl
  implements ApprovalStageDefinitionDocument
{
  readonly #stage: ApprovalStage;

  constructor(
    stage: ApprovalStage,
  ) {
    this.#stage = stage;
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

  getOrder(): number | undefined {
    return this.#stage.order;
  }

  getRequiredApprovalCount(): number {
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
      ...(this.#stage
        .deliverableRequirementIds ?? []),
    ];
  }

  getAuthorityRef(): string | undefined {
    return this.#stage.authorityRef;
  }
}

/* -------------------------------------------------------------------------- */
/*                     Approval policy snapshot                               */
/* -------------------------------------------------------------------------- */

export class ApprovalPolicySnapshotDocumentImpl
  implements ApprovalPolicySnapshotDocument
{
  readonly #policy:
    ApprovalPolicySnapshot | undefined;

  readonly #stages:
    readonly ApprovalStage[];

  readonly #byId: ReadonlyMap<
    ApprovalStageId,
    ApprovalStage
  >;

  constructor(
    policy:
      | ApprovalPolicySnapshot
      | undefined,
  ) {
    this.#policy = policy;

    this.#stages = [
      ...(policy?.stages ?? []),
    ];

    this.#byId = indexById(
      this.#stages,
      (stage) => stage.id,
      "Approval Stage",
    );
  }

  hasPolicy(): boolean {
    return this.#policy !== undefined;
  }

  getStages():
    readonly ApprovalStageDefinitionDocument[] {
    return this.#stages.map(
      (stage) =>
        new ApprovalStageDefinitionDocumentImpl(
          stage,
        ),
    );
  }

  getStage(
    id: ApprovalStageId,
  ): ApprovalStageDefinitionDocument | undefined {
    const stage = this.#byId.get(id);

    if (stage === undefined) {
      return undefined;
    }

    return new ApprovalStageDefinitionDocumentImpl(
      stage,
    );
  }

  requireStage(
    id: ApprovalStageId,
  ): ApprovalStageDefinitionDocument {
    return new ApprovalStageDefinitionDocumentImpl(
      requireFromMap(
        this.#byId,
        id,
        "Approval Stage",
      ),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                         Revision snapshot DOM                              */
/* -------------------------------------------------------------------------- */

/**
 * Immutable semantic representation of everything definition-bearing captured
 * at one Milestone Revision.
 *
 * It deliberately avoids current milestone execution state.
 */
export class MilestoneRevisionSnapshotDocumentImpl
  implements MilestoneRevisionSnapshotDocument
{
  readonly #snapshot: MilestoneRevisionSnapshot;

  readonly #criteriaById: ReadonlyMap<
    CriterionId,
    CriterionDefinitionSnapshot
  >;

  readonly #deliverablesById: ReadonlyMap<
    DeliverableRequirementId,
    DeliverableDefinitionSnapshot
  >;

  constructor(
    snapshot: MilestoneRevisionSnapshot,
  ) {
    this.#snapshot = snapshot;

    this.#criteriaById = indexById(
      snapshot.criteria,
      (criterion) => criterion.id,
      "Criterion Definition",
    );

    this.#deliverablesById = indexById(
      snapshot.deliverables,
      (deliverable) => deliverable.id,
      "Deliverable Definition",
    );
  }

  getProfileId(): MilestoneProfileId {
    return this.#snapshot.profile.id;
  }

  getProfileVersion(): number {
    return this.#snapshot.profile.version;
  }

  getEvaluationPolicy():
    MilestoneEvaluationPolicyDocument {
    return new MilestoneEvaluationPolicyDocumentImpl(
      this.#snapshot.evaluationPolicy,
    );
  }

  getDefinition():
    MilestoneDefinitionDocument {
    return createDefinitionDocument(
      this.#snapshot.definition,
    );
  }

  getCriteria():
    readonly CriterionDefinitionDocument[] {
    const sources =
      this.#snapshot.sources ?? [];

    return this.#snapshot.criteria.map(
      (criterion) =>
        new CriterionDefinitionDocumentImpl(
          criterion,
          sources,
        ),
    );
  }

  getCriterion(
    id: CriterionId,
  ): CriterionDefinitionDocument | undefined {
    const criterion =
      this.#criteriaById.get(id);

    if (criterion === undefined) {
      return undefined;
    }

    return new CriterionDefinitionDocumentImpl(
      criterion,
      this.#snapshot.sources ?? [],
    );
  }

  getDeliverables():
    readonly DeliverableDefinitionDocument[] {
    const sources =
      this.#snapshot.sources ?? [];

    return this.#snapshot.deliverables.map(
      (deliverable) =>
        new DeliverableDefinitionDocumentImpl(
          deliverable,
          sources,
        ),
    );
  }

  getDeliverable(
    id: DeliverableRequirementId,
  ): DeliverableDefinitionDocument | undefined {
    const deliverable =
      this.#deliverablesById.get(id);

    if (deliverable === undefined) {
      return undefined;
    }

    return new DeliverableDefinitionDocumentImpl(
      deliverable,
      this.#snapshot.sources ?? [],
    );
  }

  getDependencies():
    readonly DependencyDefinitionDocument[] {
    return this.#snapshot.dependencies.map(
      (dependency) =>
        new DependencyDefinitionDocumentImpl(
          dependency,
        ),
    );
  }

  /**
   * All historical resolved Sources captured with this Revision snapshot.
   *
   * No live Artifact lookup is performed.
   */
  getSources():
    readonly MilestoneSourceSnapshotDocument[] {
    return createSourceSnapshotDocuments(
      this.#snapshot.sources ?? [],
    );
  }

  getApprovalPolicy():
    ApprovalPolicySnapshotDocument {
    return new ApprovalPolicySnapshotDocumentImpl(
      this.#snapshot.approvalPolicy,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                          Revision overview                                 */
/* -------------------------------------------------------------------------- */

export class RevisionOverviewDocumentImpl
  implements RevisionOverviewDocument
{
  readonly #revision: MilestoneRevision;
  readonly #context: MilestoneDocumentContext;
  readonly #reason: TextDocument;

  constructor(
    revision: MilestoneRevision,
    context: MilestoneDocumentContext,
  ) {
    this.#revision = revision;
    this.#context = context;

    this.#reason = createTextDocument(
      revision.reason,
    );
  }

  getId(): MilestoneRevisionId {
    return this.#revision.id;
  }

  getNumber(): number {
    return this.#revision.number;
  }

  getPreviousRevisionId():
    | MilestoneRevisionId
    | undefined {
    return this.#revision.previousRevisionId;
  }

  getReason(): TextDocument {
    return this.#reason;
  }

  getCreatedAt(): string {
    return this.#revision.createdAt;
  }

  isCurrent(): boolean {
    return (
      this.#revision.id ===
      this.#context.milestone.currentRevisionId
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                           Revision document                                */
/* -------------------------------------------------------------------------- */

export class RevisionDocumentImpl
  extends RevisionOverviewDocumentImpl
  implements RevisionDocument
{
  readonly #revision: MilestoneRevision;
  readonly #context: MilestoneDocumentContext;
  readonly #reason: TextDocument;

  constructor(
    revision: MilestoneRevision,
    context: MilestoneDocumentContext,
  ) {
    super(
      revision,
      context,
    );

    this.#revision = revision;
    this.#context = context;

    this.#reason = createTextDocument(
      revision.reason,
    );
  }

  getOverview(): RevisionOverviewDocument {
    return new RevisionOverviewDocumentImpl(
      this.#revision,
      this.#context,
    );
  }

  override getNumber(): number {
    return this.#revision.number;
  }

  override getPreviousRevisionId():
    | MilestoneRevisionId
    | undefined {
    return this.#revision.previousRevisionId;
  }

  override getReason(): TextDocument {
    return this.#reason;
  }

  getActor(): ActorRef | undefined {
    return this.#revision.actor;
  }

  override getCreatedAt(): string {
    return this.#revision.createdAt;
  }

  override isCurrent(): boolean {
    return (
      this.#revision.id ===
      this.#context.milestone.currentRevisionId
    );
  }

  getSnapshot():
    MilestoneRevisionSnapshotDocument {
    return new MilestoneRevisionSnapshotDocumentImpl(
      this.#revision.snapshot,
    );
  }

  /**
   * Live Source links attached to the Revision aggregate itself.
   *
   * This is deliberately different from:
   *
   *   getSnapshot().getSources()
   *
   * which represents resolved historical Source state captured by the
   * revision.
   */
  getSources(): MilestoneSourcesDocument {
    return createSourcesDocument(
      this.#revision.sourceLinks,
      this.#context.artifacts,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                          Revisions collection                              */
/* -------------------------------------------------------------------------- */

export class RevisionsDocumentImpl
  implements RevisionsDocument
{
  readonly #context: MilestoneDocumentContext;

  readonly #revisions:
    readonly MilestoneRevision[];

  readonly #byId: ReadonlyMap<
    MilestoneRevisionId,
    MilestoneRevision
  >;

  readonly #byNumber: ReadonlyMap<
    number,
    MilestoneRevision
  >;

  constructor(
    context: MilestoneDocumentContext,
  ) {
    this.#context = context;

    this.#revisions = [
      ...context.milestone.revisions,
    ];

    this.#byId = indexById(
      this.#revisions,
      (revision) => revision.id,
      "Milestone Revision",
    );

    this.#byNumber = indexByUniqueKey(
      this.#revisions,
      (revision) => revision.number,
      "Milestone Revision number",
    );
  }

  getCount(): number {
    return this.#revisions.length;
  }

  isEmpty(): boolean {
    return this.#revisions.length === 0;
  }

  has(
    id: MilestoneRevisionId,
  ): boolean {
    return this.#byId.has(id);
  }

  list(
    options: DocumentListOptions = {},
  ): readonly RevisionOverviewDocument[] {
    return sliceCollection(
      this.#ordered(),
      options,
    ).map(
      (revision) =>
        new RevisionOverviewDocumentImpl(
          revision,
          this.#context,
        ),
    );
  }

  get(
    id: MilestoneRevisionId,
  ): RevisionDocument | undefined {
    const revision =
      this.#byId.get(id);

    if (revision === undefined) {
      return undefined;
    }

    return this.#createDocument(
      revision,
    );
  }

  require(
    id: MilestoneRevisionId,
  ): RevisionDocument {
    return this.#createDocument(
      requireFromMap(
        this.#byId,
        id,
        "Milestone Revision",
      ),
    );
  }

  getCurrent(): RevisionDocument {
    return this.require(
      this.#context.milestone
        .currentRevisionId,
    );
  }

  getPrevious():
    RevisionDocument | undefined {
    const current =
      this.#byId.get(
        this.#context.milestone
          .currentRevisionId,
      );

    if (
      current?.previousRevisionId ===
      undefined
    ) {
      return undefined;
    }

    return this.get(
      current.previousRevisionId,
    );
  }

  getByNumber(
    number: number,
  ): RevisionDocument | undefined {
    normalizeNonNegativeInteger(
      number,
      "revision number",
    );

    const revision =
      this.#byNumber.get(number);

    return revision === undefined
      ? undefined
      : this.#createDocument(revision);
  }

  /**
   * Returns the newest revisions first.
   */
  getLatest(
    count = 1,
  ): readonly RevisionDocument[] {
    const normalized =
      normalizeNonNegativeInteger(
        count,
        "count",
      );

    if (normalized === 0) {
      return [];
    }

    return this.#ordered()
      .slice()
      .reverse()
      .slice(0, normalized)
      .map(
        (revision) =>
          this.#createDocument(
            revision,
          ),
      );
  }

  #ordered():
    readonly MilestoneRevision[] {
    return this.#revisions
      .slice()
      .sort(
        (left, right) =>
          left.number - right.number,
      );
  }

  #createDocument(
    revision: MilestoneRevision,
  ): RevisionDocument {
    return new RevisionDocumentImpl(
      revision,
      this.#context,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Factories                                 */
/* -------------------------------------------------------------------------- */

export function createRevisionsDocument(
  context: MilestoneDocumentContext,
): RevisionsDocument {
  return new RevisionsDocumentImpl(
    context,
  );
}

export function createRevisionDocument(
  revision: MilestoneRevision,
  context: MilestoneDocumentContext,
): RevisionDocument {
  return new RevisionDocumentImpl(
    revision,
    context,
  );
}

export function createRevisionSnapshotDocument(
  snapshot: MilestoneRevisionSnapshot,
): MilestoneRevisionSnapshotDocument {
  return new MilestoneRevisionSnapshotDocumentImpl(
    snapshot,
  );
}
