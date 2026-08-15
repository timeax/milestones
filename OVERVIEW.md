# Milestones

> A storage-neutral domain package for defining, revising, evaluating, accepting, completing, reopening, and auditing milestones, with first-class artifact requirements, evidence, submissions, verification, and version-pinned artifact history through `@elqora/artifacts`.

## 1. Status

This is the normative domain specification for `@elqora/milestones`.

**MUST**, **MUST NOT**, **SHOULD**, and **MAY** describe required, prohibited, recommended, and optional behavior.

TypeScript examples are conceptual contracts. They define intended semantics and public boundaries, not necessarily the exact final source representation.

---

## 2. Purpose and boundary

`@elqora/milestones` owns the internal truth and lifecycle of a milestone.

The package owns:

- milestone identity;
- milestone profiles;
- milestone definitions;
- milestone revisions;
- criteria;
- deliverable requirements;
- milestone relationships to artifact requirements;
- technical milestone dependencies;
- dependency-graph evaluation;
- challenges;
- reviews;
- approvals;
- acceptance;
- completion;
- reopening and lifecycle invalidation;
- typed domain events;
- editors;
- deterministic milestone evaluation.

It does **not** own:

- tasks;
- issues;
- discussions;
- messaging;
- comments;
- notifications;
- authorization;
- ownership;
- visibility;
- projects;
- version or release-plan membership;
- planning evolution such as `upgrades`, `extends`, or `replaces`;
- persistence;
- databases;
- Git;
- GitHub;
- `.pm/`;
- providers;
- artifact storage;
- file transport;
- UI.

Hosts integrate through stable IDs, artifact protocol objects, explicit inputs, domain events, serializers, and adapters.

The package MUST work entirely in memory without Git, a database, `.pm/`, a network connection, or a particular host application.

Technical dependencies remain part of the package because they directly affect milestone readiness, evaluation, acceptance, and completion.

Membership in a version, release, phase, wave, or other planning container belongs to a host or separate planning domain.

Relationships such as `upgrades`, `extends`, and `replaces` also belong outside this package because they describe planning evolution rather than the internal validity of a milestone.

---

## 3. Artifact protocol dependency

`@elqora/milestones` uses `@elqora/artifacts` as its canonical artifact protocol.

The milestone package MUST NOT redefine artifact-domain concepts already owned by `@elqora/artifacts`, including:

- artifact identity;
- artifact versions;
- artifact sources;
- artifact links;
- artifact requirements;
- artifact submissions;
- artifact verification records.

Conceptually:

```ts
import type {
  Artifact,
  ArtifactId,
  ArtifactVersion,
  ArtifactVersionId,
  ArtifactLink,
  ArtifactRequirement,
  ArtifactRequirementId,
  ArtifactSubmission,
  ArtifactSubmissionId,
  ArtifactVerification,
  ArtifactVerificationId,
} from "@elqora/artifacts";
```

The milestone package MUST target an explicitly supported Artifact Protocol compatibility range.

At implementation time, the concrete TypeScript binding and package compatibility range MUST be pinned rather than inferred dynamically. The normative dependency is the Artifact Protocol contract; the host MAY provide an adapter when using a different compatible binding.

The milestone package owns the milestone meaning of artifact-domain records. It decides why an artifact is required, which milestone requirement it participates in, what milestone-domain role it serves, whether required artifact conditions are satisfied, how artifact verification affects criterion or deliverable state, and which exact artifact versions participated in review, approval, acceptance, or completion.

The Artifact SDK owns what the artifact is, artifact identity, immutable artifact versions, artifact requirements, artifact links, artifact submissions, artifact verification, and artifact-level provenance.

`ArtifactRequirement` creation, mutation, identity, and lifecycle belong to the Artifact SDK. Milestones owns only the relationship that makes an `ArtifactRequirement` relevant to a milestone criterion or deliverable requirement and the milestone-domain consequences of satisfying or failing it.

Neither package inherently owns persistence or physical file storage.

The milestone package MUST NOT implement artifact uploads, object storage, S3, GitHub file discovery, pull-request discovery, commit lookup, blob persistence, artifact hashing infrastructure, provider authentication, or provider-specific artifact storage.

Those responsibilities remain in the Artifact SDK, its extensions, or the host application.

### 3.1 Milestone artifact vocabulary

The milestone package MAY define milestone-specific artifact subject and role vocabularies for use with the Artifact SDK's link model.

```ts
type MilestoneArtifactSubjectType =
  | "milestone"
  | "criterion"
  | "deliverable_requirement"
  | "challenge"
  | "review"
  | "approval"
  | "acceptance"
  | "completion";

type MilestoneArtifactRole =
  | "deliverable"
  | "evidence"
  | "verification"
  | "challenge_evidence"
  | "response_evidence"
  | "review_evidence"
  | "approval_evidence"
  | "acceptance_evidence"
  | "handover";

type MilestoneArtifactLink = ArtifactLink<
  MilestoneArtifactRole,
  MilestoneArtifactSubjectType
>;
```

The link subject ID carries the stable ID of the milestone-domain object being referenced.

The same artifact MAY participate in multiple milestone contexts through separate links.

The artifact itself MUST NOT acquire milestone-specific flags such as `isEvidence`, `isDeliverable`, `milestoneId`, or `criterionId` when those relationships can be represented through artifact links.

### 3.2 Artifact version pinning

Historical milestone evaluation MUST preserve the exact artifact versions that were evaluated.

If artifact `A` has versions `v1`, `v2`, `v3`, and `v4`, and milestone revision `R3` was accepted using `v3`, later creation of `v4` MUST NOT silently reinterpret that historical acceptance as having evaluated `v4`.

Any artifact state used to justify historical verification, review, approval, acceptance, or completion MUST identify the exact `ArtifactVersion` evaluated when the artifact is versionable.

### 3.3 Submission and verification

The milestone package SHOULD consume Artifact SDK submission and verification records rather than create parallel milestone-specific submission or verification ledgers.

```text
DeliverableRequirement
        ↓
ArtifactRequirement
        ↓
ArtifactSubmission
        ↓
ArtifactVerification
        ↓
Milestone evaluation
        ↓
deliverable requirement satisfied
```

The Artifact SDK records the artifact-domain fact. The milestone package determines the milestone-domain consequence.

---

## 4. Identity and attribution

Every externally referenceable milestone-domain object MUST have a stable opaque ID.

Titles, positions, paths, filenames, database row positions, and provider-specific IDs are not domain identity.

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };

type MilestoneId = Brand<string, "MilestoneId">;
type MilestoneProfileId = Brand<string, "MilestoneProfileId">;
type MilestoneRevisionId = Brand<string, "MilestoneRevisionId">;
type CriterionId = Brand<string, "CriterionId">;
type DeliverableRequirementId = Brand<string, "DeliverableRequirementId">;
type DependencyId = Brand<string, "DependencyId">;
type ChallengeId = Brand<string, "ChallengeId">;
type ReviewId = Brand<string, "ReviewId">;
type ApprovalStageId = Brand<string, "ApprovalStageId">;
type ApprovalRecordId = Brand<string, "ApprovalRecordId">;
type AcceptanceId = Brand<string, "AcceptanceId">;
type CompletionId = Brand<string, "CompletionId">;
type MilestoneEventId = Brand<string, "MilestoneEventId">;

interface ActorRef {
  id: string;
  type?: string;
}
```

The package records who performed an action but never decides whether that actor was authorized.

Challenges, reviews, approvals, waivers, acceptance, completion, reopening, and events SHOULD carry an opaque `ActorRef` where an actor exists.

Authorization happens in the host before an editor operation is invoked.

### 4.1 ID generation

The package SHOULD support host-supplied or deterministic ID generation.

```ts
interface MilestoneIdGenerator {
  milestone(): MilestoneId;
  revision(): MilestoneRevisionId;
  criterion(): CriterionId;
  deliverableRequirement(): DeliverableRequirementId;
  dependency(): DependencyId;
  challenge(): ChallengeId;
  review(): ReviewId;
  approvalStage(): ApprovalStageId;
  approvalRecord(): ApprovalRecordId;
  acceptance(): AcceptanceId;
  completion(): CompletionId;
  event(): MilestoneEventId;
}
```

The domain package SHOULD NOT require hidden global randomness when an explicit ID generator is supplied.

---

## 5. Aggregate and current truth

```ts
interface Milestone {
  id: MilestoneId;
  profile: MilestoneProfileRef;
  currentRevisionId: MilestoneRevisionId;
  revisions: readonly MilestoneRevision[];

  definition: MilestoneDefinition;
  criteria: readonly Criterion[];
  deliverables: readonly DeliverableRequirement[];
  dependencies: readonly MilestoneDependency[];

  challenges: readonly MilestoneChallenge[];
  reviews: readonly MilestoneReview[];

  approvalPolicy?: MilestoneApprovalPolicy;
  approvalRecords: readonly ApprovalRecord[];

  acceptanceRecords: readonly MilestoneAcceptance[];
  currentAcceptanceId?: AcceptanceId;

  completionRecords: readonly MilestoneCompletion[];
  currentCompletionId?: CompletionId;

  sequence: number;
  createdAt: string;
  updatedAt?: string;
}
```

`currentAcceptanceId` and `currentCompletionId` are the only authoritative indicators of current acceptance and completion.

Any `accepted` or `completed` booleans exposed elsewhere are derived projections and MUST NOT be independently mutable.

The current materialized view MAY contain mutable working state for criteria, deliverables, challenges, reviews, and similar operational records.

Historical truth is preserved through revisions, acceptance records, completion records, approval records, typed domain events, and artifact version references.

---

## 6. Profiles and revisions

```ts
interface MilestoneProfileRef {
  id: MilestoneProfileId;
  version: number;
}

interface MilestoneProfile {
  ref: MilestoneProfileRef;

  criteria: { enabled: boolean };
  deliverables: { enabled: boolean };
  dependencies: { enabled: boolean; participatesInGraph: boolean };
  revisions: { enabled: boolean };
  challenges: { enabled: boolean };
  reviews: { enabled: boolean; required: boolean };
  approvals: { enabled: boolean; required: boolean };

  completion: {
    enabled: boolean;
    closeImmediatelyOnAcceptance: boolean;
  };
}
```

Profile versions are immutable.

Every milestone revision records its exact profile reference and snapshots all evaluation- and completion-relevant behavior.

Historical evaluation MUST NOT depend on mutable external configuration.

A behavior-changing profile update MUST produce a milestone revision before the new behavior governs that milestone.

```ts
interface MilestoneRevision {
  id: MilestoneRevisionId;
  milestoneId: MilestoneId;
  number: number;
  previousRevisionId?: MilestoneRevisionId;
  reason?: string;
  actor?: ActorRef;
  createdAt: string;
  snapshot: MilestoneRevisionSnapshot;
}

interface MilestoneRevisionSnapshot {
  profile: MilestoneProfileRef;
  evaluationPolicy: MilestoneEvaluationPolicySnapshot;
  definition: MilestoneDefinition;
  criteria: readonly CriterionDefinitionSnapshot[];
  deliverables: readonly DeliverableDefinitionSnapshot[];
  dependencies: readonly DependencyDefinitionSnapshot[];
  approvalPolicy?: ApprovalPolicySnapshot;
}
```

Historical revisions are immutable.

Changes to scope, criteria definitions, criterion weighting, deliverable requirements, dependency gates, review requirements, approval requirements, or completion rules MUST create a revision.

A material revision MUST clear both `currentCompletionId` and `currentAcceptanceId` without deleting historical ledger records.

### 6.1 Child identity across revisions

Child identity follows a semantic rule:

```text
same logical requirement, edited or tightened
→ preserve its ID

semantically replaced requirement
→ allocate a new ID
```

Removed and superseded requirements remain in revision history.

Editors SHOULD make replacement explicit.

Editors MUST NOT infer semantic replacement solely from arbitrary wording changes.

Verification under an earlier definition is preserved or invalidated by deterministic revision rules. It MUST NOT be invalidated accidentally as an implementation side effect.

---

## 7. Requirements and progress

Criteria and deliverable requirements are first-class, stable-ID objects.

### 7.1 Criteria

```ts
type CriterionState =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "verified"
  | "failed"
  | "waived";

interface Criterion {
  id: CriterionId;
  title: string;
  description?: string;
  required: boolean;
  weight?: number;
  state: CriterionState;
  artifactRequirementIds?: readonly ArtifactRequirementId[];
}
```

Criteria MAY require artifact evidence.

The milestone aggregate SHOULD reference Artifact SDK requirements by stable `ArtifactRequirementId` rather than embedding complete external requirement aggregates.

The milestone package MUST NOT create a parallel evidence-requirement model.

### 7.2 Deliverable requirements

```ts
type DeliverableRequirementState =
  | "missing"
  | "submitted"
  | "satisfied"
  | "rejected"
  | "waived";

interface DeliverableRequirement {
  id: DeliverableRequirementId;
  title: string;
  description?: string;
  required: boolean;
  state: DeliverableRequirementState;
  artifactRequirementIds?: readonly ArtifactRequirementId[];
}
```

A deliverable requirement describes why one or more artifact requirements participate in the milestone.

The milestone aggregate SHOULD retain stable Artifact SDK requirement references rather than embedded external aggregates.

The Artifact SDK describes the requirements, outputs, submissions, versions, and verification records themselves.

### 7.3 Progress

Weighting and waiver policies MUST define all zero, missing, invalid, and waived cases deterministically.

```text
100% progress != accepted
100% progress != completed
```

Progress measures satisfied work. Acceptance evaluates configured gates. Completion closes the lifecycle.

### 7.4 Artifact evaluation input

Artifact-domain state required for milestone evaluation MUST be supplied explicitly.

Conceptually:

```ts
interface MilestoneArtifactContext {
  requirements: ReadonlyMap<
    ArtifactRequirementId,
    ArtifactRequirement
  >;

  artifacts: ReadonlyMap<
    ArtifactId,
    Artifact
  >;

  versions: ReadonlyMap<
    ArtifactVersionId,
    ArtifactVersion
  >;

  submissions: ReadonlyMap<
    ArtifactSubmissionId,
    ArtifactSubmission
  >;

  verifications: ReadonlyMap<
    ArtifactVerificationId,
    ArtifactVerification
  >;

  links: readonly MilestoneArtifactLink[];
}
```

The milestone aggregate MUST NOT require complete Artifact SDK aggregates to be embedded merely so evaluation can occur.

Evaluation receives artifact-domain state as an explicit immutable input, in the same architectural spirit as `MilestoneGraphSnapshot`.

### 7.5 Artifact evaluation snapshots

Historical milestone decisions MUST capture the exact artifact-domain records that justified the decision.

Conceptually:

```ts
interface ArtifactEvaluationSnapshot {
  artifactRequirementId: ArtifactRequirementId;
  artifactId: ArtifactId;
  artifactVersionId?: ArtifactVersionId;
  submissionId?: ArtifactSubmissionId;
  verificationId?: ArtifactVerificationId;

  outcome:
    | "satisfied"
    | "failed"
    | "waived";
}
```

`artifactVersionId` MUST be present whenever the evaluated artifact state is version-specific or the underlying artifact has an immutable version relevant to the decision.

---

## 8. Technical dependencies and graph input

```ts
interface MilestoneDependency {
  id: DependencyId;
  milestoneId: MilestoneId;
  dependsOnMilestoneId: MilestoneId;
  gate: MilestoneDependencyGate;
  blocking: boolean;
}

type MilestoneDependencyGate =
  | { type: "accepted" }
  | { type: "completed" }
  | {
      type: "criterion";
      criterionId: CriterionId;
      requiredState: "verified";
    }
  | {
      type: "deliverable";
      deliverableRequirementId: DeliverableRequirementId;
      requiredState: "satisfied";
    };
```

Dependencies are milestone-to-milestone technical relationships.

A gate may refer to a specific upstream criterion or deliverable requirement.

```ts
interface MilestoneGraphNode {
  id: MilestoneId;
  revisionId: MilestoneRevisionId;
  gates: MilestoneGateState;
}

interface MilestoneGateState {
  criteria: ReadonlyMap<CriterionId, CriterionGateState>;
  deliverables: ReadonlyMap<DeliverableRequirementId, DeliverableGateState>;
  accepted: boolean;
  completed: boolean;
}

interface MilestoneGraphSnapshot {
  milestones: ReadonlyMap<MilestoneId, MilestoneGraphNode>;
  dependencies: readonly MilestoneDependency[];
}
```

Graph booleans are derived from the aggregate's current lifecycle pointers.

Graph services MUST consume this immutable read model rather than complete milestone aggregates unless a specific operation requires more information.

Graph services MUST NOT load storage.

They SHOULD validate missing milestone nodes, missing gate targets, self-dependencies, duplicate dependencies, and dependency cycles.

They SHOULD support gate evaluation, unlocked milestone discovery, downstream impact calculation, and affected milestone reporting.

---

## 9. Challenges

A challenge is a formal dispute about milestone validity.

It is not a general issue.

```ts
interface MilestoneChallenge {
  id: ChallengeId;
  milestoneId: MilestoneId;
  milestoneRevisionId: MilestoneRevisionId;
  target: ChallengeTarget;
  reason: string;
  severity: "non_blocking" | "blocking";
  state:
    | "open"
    | "under_review"
    | "resolved"
    | "rejected"
    | "withdrawn"
    | "reopened";
  raisedBy?: ActorRef;
  createdAt: string;
  resolution?: ChallengeResolution;
}

interface ChallengeResolution {
  outcome:
    | "no_effect"
    | "target_invalidated"
    | "acceptance_invalidated"
    | "requirements_invalidated";
  summary?: string;
  resolvedBy?: ActorRef;
  resolvedAt: string;
}
```

Targets MAY include a milestone, criterion, deliverable requirement, review, or artifact/evidence reference.

Challenge evidence SHOULD be represented through Artifact SDK links rather than milestone-specific artifact ID arrays.

An unresolved blocking challenge MAY block a new acceptance under the snapshotted policy.

Its existence alone MUST NOT erase current or historical lifecycle records.

A challenge invalidates acceptance or completion only when its resolved outcome explicitly invalidates the accepted state or the requirements underlying it.

The editor maps that outcome to an explicit reopening effect.

Challenge state is current materialized state. Challenge transition history is preserved through typed domain events.

---

## 10. Reviews and approvals

Review evaluates correctness.

Approval records formal authority.

Both are attributed and tied to the evaluated milestone revision.

### 10.1 Reviews

```ts
interface MilestoneReview {
  id: ReviewId;
  milestoneId: MilestoneId;
  milestoneRevisionId: MilestoneRevisionId;

  requestedBy?: ActorRef;
  assignedReviewer?: ActorRef;
  completedBy?: ActorRef;

  state:
    | "requested"
    | "in_progress"
    | "completed"
    | "cancelled";

  result?:
    | "accepted"
    | "changes_requested"
    | "rejected";

  summary?: string;
  createdAt: string;
  completedAt?: string;
}
```

A review MAY reference exact artifact versions or artifact links used during evaluation.

Review evidence SHOULD use the Artifact SDK's link/version model.

### 10.2 Approval stages

```ts
interface ApprovalStage {
  id: ApprovalStageId;
  label: string;
  required: boolean;
  order?: number;
  requiredApprovalCount: number;
  scope: "milestone" | "criteria" | "deliverables";
  criterionIds?: readonly CriterionId[];
  deliverableRequirementIds?: readonly DeliverableRequirementId[];
}
```

The package does not discover eligible approvers.

A host resolves a policy such as `all designated approvers` into an explicit evaluable requirement such as `requiredApprovalCount = 3`.

### 10.3 Approval ledger

Approval history MUST be append-only.

```ts
type ApprovalRecord =
  | ApprovalGrantedRecord
  | ApprovalRejectedRecord
  | ApprovalRevokedRecord
  | ApprovalWaivedRecord;
```

Example:

```ts
interface ApprovalGrantedRecord {
  id: ApprovalRecordId;
  type: "granted";
  milestoneId: MilestoneId;
  milestoneRevisionId: MilestoneRevisionId;
  stageId: ApprovalStageId;
  actor: ActorRef;
  createdAt: string;
}

interface ApprovalRevokedRecord {
  id: ApprovalRecordId;
  type: "revoked";
  milestoneId: MilestoneId;
  milestoneRevisionId: MilestoneRevisionId;
  stageId: ApprovalStageId;
  actor: ActorRef;
  revokesApprovalId: ApprovalRecordId;
  createdAt: string;
}
```

The package counts distinct actors with effective approvals for one stage and revision.

A duplicate active approval by the same actor MUST NOT increase the count.

Revoked approvals remain historical but do not count toward current approval satisfaction.

---

## 11. Acceptance and completion ledgers

### 11.1 Acceptance

Acceptance is an immutable evaluative fact that a milestone revision satisfied its configured gates.

```ts
interface MilestoneAcceptance {
  id: AcceptanceId;
  milestoneId: MilestoneId;
  milestoneRevisionId: MilestoneRevisionId;
  acceptedAt: string;
  actor?: ActorRef;
  snapshot: MilestoneAcceptanceSnapshot;
}
```

`actor` identifies the actor that explicitly invoked or confirmed acceptance when applicable.

Acceptance MAY be programmatically produced after deterministic evaluation when no human actor exists.

Its snapshot MUST identify the revision and the relevant evaluated state of criteria, deliverable requirements, technical dependencies, challenges, reviews, approvals, and artifact evaluations.

Conceptually:

```ts
interface MilestoneAcceptanceSnapshot {
  revisionId: MilestoneRevisionId;

  criteria: readonly CriterionAcceptanceSnapshot[];
  deliverables: readonly DeliverableAcceptanceSnapshot[];
  dependencies: readonly DependencyAcceptanceSnapshot[];
  challenges: readonly ChallengeAcceptanceSnapshot[];
  reviews: readonly ReviewAcceptanceSnapshot[];
  approvals: readonly ApprovalAcceptanceSnapshot[];

  artifacts: readonly ArtifactEvaluationSnapshot[];
}
```

This snapshot is the normative historical boundary for artifact evidence used in acceptance.

Acceptance records are append-only.

Clearing `currentAcceptanceId` MUST NOT delete an acceptance record.

### 11.2 Completion

Completion is a formal lifecycle-closing transition.

```ts
interface MilestoneCompletion {
  id: CompletionId;
  milestoneId: MilestoneId;
  milestoneRevisionId: MilestoneRevisionId;
  acceptanceId: AcceptanceId;
  completedAt: string;
  actor?: ActorRef;
  reason?: string;
}
```

A valid completion MUST reference the current acceptance for the same revision.

Profiles without a separate closure step MAY complete immediately after acceptance.

Completion records are append-only.

Clearing `currentCompletionId` MUST preserve prior completion history.

### 11.3 Evaluation output

Evaluators SHOULD return explainable results listing missing criteria, missing deliverables, unsatisfied dependencies, blocking challenges, incomplete reviews, pending approvals, artifact requirement failures, artifact verification failures, and structured reasons.

---

## 12. Reopening and invalidation

Reopening has an explicit lifecycle effect.

```ts
type ReopenEffect =
  | "invalidate_completion"
  | "invalidate_acceptance_and_completion";

interface ReopenRequest {
  effect: ReopenEffect;
  reason: string;
  actor?: ActorRef;
  cause?:
    | { type: "administrative" }
    | { type: "revision"; revisionId: MilestoneRevisionId }
    | { type: "challenge"; challengeId: ChallengeId }
    | { type: "approval_revocation"; approvalRecordId: ApprovalRecordId }
    | { type: "dependency_invalidation"; dependencyId: DependencyId }
    | { type: "artifact_invalidation"; ref: string }
    | { type: "host_requested"; ref?: string };
}
```

```text
invalidate_completion
→ clear currentCompletionId
→ preserve currentAcceptanceId

invalidate_acceptance_and_completion
→ clear currentCompletionId
→ clear currentAcceptanceId
```

A material revision invalidates both.

Administrative reopening normally invalidates completion only.

Challenge, approval, dependency, and artifact outcomes select their reopening effect through explicit policy and resolved outcome.

They MUST NOT invalidate lifecycle state merely because a related record exists.

Every invalidation preserves historical ledger records and emits typed domain events.

---

## 13. Typed events and sequence

Events are immutable domain facts.

They are not transport messages.

```ts
interface MilestoneEventEnvelope<T extends string, P> {
  id: MilestoneEventId;
  type: T;
  milestoneId: MilestoneId;
  sequence: number;
  revisionId: MilestoneRevisionId;
  actor?: ActorRef;
  occurredAt: string;
  causationId?: MilestoneEventId;
  correlationId?: string;
  payload: P;
}
```

The public event type SHOULD be a discriminated union.

```ts
type MilestoneEvent =
  | MilestoneCreatedEvent
  | MilestoneRevisedEvent
  | CriterionVerifiedEvent
  | CriterionWaivedEvent
  | DeliverableSatisfiedEvent
  | ChallengeRaisedEvent
  | ChallengeResolvedEvent
  | ReviewCompletedEvent
  | ApprovalRecordedEvent
  | ApprovalRevokedEvent
  | MilestoneAcceptedEvent
  | MilestoneCompletedEvent
  | MilestoneReopenedEvent;
```

Public APIs MUST NOT collapse domain events to `{ type: string; payload: unknown }`.

Each member MUST have a discriminating literal and a specific payload contract.

Sequence is monotonic per milestone aggregate.

`milestone.sequence` MUST equal the sequence of the last domain event incorporated into the aggregate's current state.

Every committed domain-state mutation MUST emit at least one domain event and MUST advance `milestone.sequence`.

An edit session SHOULD capture an expected sequence.

```text
open aggregate at sequence 91
→ edit
→ emit events 92, 93, 94
→ committed milestone.sequence = 94
```

This supports host-level optimistic concurrency without introducing persistence into the milestone package.

Hosts MAY persist or publish returned events.

The package itself MUST NOT do so.

---

## 14. Editors and evaluation

Meaningful writes use a shared, draft-based `MilestoneEditor`.

The root editor coordinates focused sub-editors.

```ts
class MilestoneEditor {
  readonly definition: DefinitionEditor;
  readonly criteria: CriteriaEditor;
  readonly deliverables: DeliverableEditor;
  readonly dependencies: DependencyEditor;
  readonly challenges: ChallengeEditor;
  readonly reviews: ReviewEditor;
  readonly approvals: ApprovalEditor;
  readonly revisions: RevisionEditor;

  accept(...args: unknown[]): void;
  complete(...args: unknown[]): void;
  reopen(request: ReopenRequest): void;

  commit(): MilestoneEditResult;
  rollback(): void;
}
```

Sub-editors SHOULD be introduced when a milestone subdomain has meaningful behavior, lifecycle rules, or invariants.

Editors SHOULD use composition rather than inheritance-heavy designs.

All sub-editors in one edit session MUST share the same draft and edit context.

```ts
interface MilestoneEditContext {
  original: Milestone;
  draft: Milestone;
  expectedSequence: number;
  profile: MilestoneProfile;
  graph?: MilestoneGraphSnapshot;
  artifacts?: MilestoneArtifactContext;
  changes: MilestoneChange[];
  events: MilestoneEvent[];
  invalidations: EvaluationInvalidation[];
  clock: MilestoneClock;
  ids: MilestoneIdGenerator;
}
```

Editors expose semantic operations.

Prefer:

```ts
editor.criteria.verify(...);
editor.challenges.resolve(...);
editor.approvals.record(...);
```

over generic path mutation.

Editors validate milestone rules.

They MUST NOT implement host authorization.

Editors MUST NOT persist, write SQLite, write `.pm/`, write Git, push GitHub, upload artifacts, send notifications, send messages, or invoke providers.

Commit coordinates aggregate validation, revision creation, profile validation, artifact-condition evaluation, evidence invalidation, progress derivation, lifecycle invalidation, graph impact reporting, event creation, and sequence advancement.

```ts
interface MilestoneEditResult {
  milestone: Milestone;
  changes: readonly MilestoneChange[];
  events: readonly MilestoneEvent[];
  revision?: MilestoneRevision;
  invalidations?: readonly EvaluationInvalidation[];
  affectedMilestoneIds?: readonly MilestoneId[];
}
```

Pure deterministic services SHOULD include:

```ts
calculateProgress(...);
deriveMilestoneState(...);
evaluateAcceptance(...);
evaluateCompletion(...);
evaluateDependency(...);
evaluateArtifacts(...);
validateMilestone(...);
validateGraph(...);
detectCycles(...);
```

---

## 15. Integration and serialization

Domain objects and domain events MUST have serializable representations.

Runtime structures such as `ReadonlyMap` require explicit wire adapters.

Schema migration, hydration, repositories, transactions, storage layout, encryption, synchronization, and provider integration belong to hosts or adapters.

A host MAY normalize a hydrated milestone into multiple records or files.

The milestone package MUST NOT assume that its in-memory aggregate is persisted as one document.

For example:

```text
fully hydrated Milestone in memory
        ↓
dehydrate
        ↓
milestone record
criterion records
deliverable records
challenge records
review records
approval records
```

and later:

```text
stored references
        ↓
hydrate
        ↓
fully reconstructed Milestone
```

External systems reference stable IDs without entering the aggregate.

```text
task → milestoneId
issue → criterionId
artifact link → deliverableRequirementId
discussion → challengeId
projection row → milestoneRevisionId
```

These external records remain outside the milestone package.

---

## 16. Required invariants

1. Aggregate and first-class child IDs are stable and immutable.
2. Revisions, acceptance records, completion records, approval-history records, and events are append-only historical facts.
3. Current acceptance and completion derive only from `currentAcceptanceId` and `currentCompletionId`.
4. A current completion references the current acceptance for the same milestone revision.
5. Material revision clears both current lifecycle pointers without deleting historical records.
6. Reopening declares exactly which lifecycle pointers it invalidates.
7. Challenges invalidate lifecycle state only through explicit resolved outcomes and configured rules.
8. Reviews and approvals remain tied to the milestone revision they evaluated.
9. Review attribution distinguishes request, assignment, and completion when those actors differ.
10. Approval counts use distinct attributed actors for one stage and revision.
11. Artifact identity, versions, requirements, links, submissions, and verification records remain owned by the Artifact Protocol.
12. Milestones owns the relationship that makes an Artifact Requirement relevant to a criterion or deliverable and the milestone-domain consequence of its state.
13. Milestone aggregates reference Artifact Requirements through stable Artifact SDK IDs rather than embedding complete external requirement aggregates.
14. Artifact verification remains tied to the exact artifact version verified.
15. Historical review, approval, acceptance, and completion MUST NOT silently follow later artifact versions.
16. Acceptance snapshots record exact artifact requirement, artifact, artifact-version, submission, and verification references used in evaluation.
17. Milestone artifact relationships use the Artifact SDK's requirement, link, submission, version, and verification contracts rather than parallel milestone-specific artifact models.
18. Technical dependency graphs reject self-dependencies and cycles.
19. Graph evaluation uses an explicit immutable snapshot.
20. Artifact evaluation uses an explicit immutable artifact context.
21. Progress never implies acceptance or completion.
22. Evaluation-relevant profile behavior is immutable and snapshotted.
23. Host authorization and ownership never enter milestone-domain evaluation.
24. Tasks, issues, discussions, plans, versions, and planning-evolution relationships remain external.
25. Editors do not own persistence, transport, or provider integration.
26. Derived projections never become competing mutable truth.
27. `milestone.sequence` equals the sequence of the last domain event incorporated into the aggregate's current state.
28. Every committed domain-state mutation emits at least one event and advances the aggregate sequence.
29. Same-logical-requirement edits preserve child identity; semantic replacement creates new identity.
30. Historical lifecycle records are never deleted merely because the milestone is reopened.
31. Artifact storage and artifact identity remain separate concerns.
32. The supported Artifact Protocol compatibility range is explicit and versioned.

---

## 17. Package model

```text
@elqora/milestones
│
├── Identity and Actor References
├── Profiles
├── Definitions and Revisions
├── Criteria
├── Deliverable Requirements
├── Artifact Integration
│   ├── ArtifactRequirement references
│   ├── ArtifactLink roles
│   ├── ArtifactSubmission inputs
│   ├── ArtifactVerification inputs
│   ├── MilestoneArtifactContext
│   ├── ArtifactEvaluationSnapshot
│   └── version-pinned historical evidence
├── Technical Dependencies
├── Graph Evaluation
├── Challenges
├── Reviews
├── Approvals
├── Acceptance Ledger
├── Completion Ledger
├── Reopening and Invalidation
├── Typed Events
├── Editors
└── Deterministic Evaluation

depends on:

@elqora/artifacts
```

The package defines milestone internal truth and lifecycle.

Stable IDs make milestone-domain objects composable.

Immutable revisions and ledgers preserve historical truth.

`@elqora/artifacts` provides the canonical artifact protocol used for milestone deliverables, evidence, submissions, verification, and historical artifact-version references.

Explicit graph and evaluation inputs keep behavior deterministic.

Strict host boundaries keep the package reusable.

The package remains intentionally unaware of projects, tasks, issues, discussions, version planning, authorization, persistence, GitHub, `.pm/`, databases, storage providers, and UI.
