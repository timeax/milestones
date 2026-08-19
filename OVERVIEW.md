# Milestones

> A storage-neutral domain package for defining, revising, evaluating, accepting, completing, reopening, and auditing milestones, with first-class artifact sources, requirements, evidence, submissions, verification, and version-pinned artifact history through `@elqora/artifacts`.

## 1. Status

This is the normative domain specification for `@timeax/milestones`.

**MUST**, **MUST NOT**, **SHOULD**, and **MAY** describe required, prohibited, recommended, and optional behavior.

TypeScript examples are conceptual contracts. They define intended semantics and public boundaries, not necessarily the exact final source representation.

---

## 2. Purpose and boundary

`@timeax/milestones` owns the internal truth and lifecycle of a milestone.

The package owns:

- milestone identity;
- milestone profiles;
- milestone definitions;
- milestone revisions;
- criteria;
- deliverable requirements;
- milestone-domain source relationships to artifacts;
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

`@timeax/milestones` uses `@elqora/artifacts` as its canonical artifact protocol.

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
  ArtifactLinkId,
  ArtifactMetadata,
  ArtifactSubjectReference,
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

The milestone package owns the milestone meaning of artifact-domain records. It decides why an artifact is a source, required, evidence, or a deliverable in a milestone context; which milestone subject it participates in; whether required artifact conditions are satisfied; how artifact verification affects criterion or deliverable state; and which exact artifact versions participated in revision, review, approval, acceptance, or completion.

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
  | "milestone_revision"
  | "criterion"
  | "deliverable_requirement"
  | "challenge"
  | "review"
  | "approval"
  | "acceptance"
  | "completion";

type MilestoneArtifactRole =
  | "reference"
  | "context"
  | "specification"
  | "decision"
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

type MilestoneSourceSubjectType =
  | "milestone"
  | "milestone_revision"
  | "criterion"
  | "deliverable_requirement"
  | "challenge"
  | "review";

type MilestoneSourceRole =
  | "reference"
  | "context"
  | "specification"
  | "decision";

type MilestoneSourceLink = ArtifactLink<
  MilestoneSourceRole,
  MilestoneSourceSubjectType
>;
```

The link subject ID carries the stable ID of the milestone-domain object being referenced.

The same artifact MAY participate in multiple milestone contexts through separate links.

The artifact itself MUST NOT acquire milestone-specific flags such as `isEvidence`, `isDeliverable`, `milestoneId`, or `criterionId` when those relationships can be represented through artifact links.

A **milestone Source** is a canonical `MilestoneSourceLink`: an Artifact being used as information, context, a specification, a reference, or a decision input for a milestone-domain subject. It is not an Artifact Protocol `ArtifactSource`, a new `Source` aggregate, an Artifact Requirement, evidence, or a deliverable.

`reference`, `context`, `specification`, and `decision` are the complete v1 milestone source-role vocabulary. A design or requirements document is identified through the Artifact's kind and specification, then used as a `specification` source when it defines milestone meaning. An implementation example is normally a `reference`; a product brief is normally `context`; and a decision record is a `decision`. `evidence` and `deliverable` remain separate milestone artifact roles.

Sources attach only to a milestone, milestone revision, criterion, deliverable requirement, challenge, or review. Dependencies have no independent source semantics; approvals represent authority rather than source context; and acceptance and completion are immutable outcomes rather than mutable source subjects. Acceptance snapshots preserve the applicable source context instead.

The milestone aggregate stores canonical source-link records, not complete Artifact, ArtifactVersion, ArtifactRequirement, submission, or verification aggregates. The host supplies those external records through `MilestoneArtifactContext` when resolution is required.

### 3.2 Artifact version pinning

Historical milestone evaluation MUST preserve the exact artifact versions that were evaluated.

If artifact `A` has versions `v1`, `v2`, `v3`, and `v4`, and milestone revision `R3` was accepted using `v3`, later creation of `v4` MUST NOT silently reinterpret that historical acceptance as having evaluated `v4`.

Any artifact state used to justify historical verification, review, approval, acceptance, or completion MUST identify the exact `ArtifactVersion` evaluated when the artifact is versionable.

Source pinning is explicit. `specification` and `decision` source links MUST carry `artifactVersionId`; they are definition-bearing and revision-defining. `reference` and `context` source links MAY omit `artifactVersionId` while they are current working context and thereby follow the logical Artifact. A revision or historical decision snapshot MUST resolve every included source to an exact ArtifactVersion whenever the Artifact is versionable. A later Artifact version MUST NOT reinterpret an earlier revision, review, acceptance, or completion snapshot.

When a snapshot must resolve an unpinned Source, the host MUST provide the relevant Artifact and ArtifactVersion through `MilestoneArtifactContext`; the resolved version MUST belong to the linked Artifact. A missing or mismatched Artifact or version is a deterministic source-resolution failure and MUST prevent creation of that reproducibility-required snapshot. This validation does not make the Source an acceptance gate.

A Source relationship alone is never an acceptance, completion, progress, dependency, verification, evidence, deliverable, or Artifact Requirement gate. The v1 source vocabulary defines no source-only evaluation gate. If the same Artifact is also used for a requirement, deliverable, or evidence, that use MUST have a distinct canonical Artifact Link or Artifact Requirement relationship with its own semantics.

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
type ChallengeEvidenceId = Brand<string, "ChallengeEvidenceId">;
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
  challengeEvidence(): ChallengeEvidenceId;
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
  sourceLinks: readonly MilestoneSourceLink[];
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

`sourceLinks` contains only links whose subject is the milestone itself. Each sourceable child owns the canonical source links whose subject is that child. A link MUST have a stable Artifact Protocol `ArtifactLinkId`, the matching subject type and stable subject ID, a v1 source role, and JSON-serializable note and metadata where present. The aggregate MUST reject a source link that is attached to an unsupported subject or does not belong to the aggregate or child that stores it.

Detaching a Source removes its milestone-domain relationship from current truth; it MUST NOT claim to delete the Artifact, ArtifactVersion, or host-managed Artifact Link record. A host may archive or otherwise manage the external link under Artifact Protocol rules, but that action is outside this package.

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
  sourceLinks: readonly MilestoneSourceLink[];
  snapshot: MilestoneRevisionSnapshot;
}

interface MilestoneRevisionSnapshot {
  profile: MilestoneProfileRef;
  evaluationPolicy: MilestoneEvaluationPolicySnapshot;
  definition: MilestoneDefinition;
  criteria: readonly CriterionDefinitionSnapshot[];
  deliverables: readonly DeliverableDefinitionSnapshot[];
  dependencies: readonly DependencyDefinitionSnapshot[];
  sources: readonly MilestoneSourceSnapshot[];
  approvalPolicy?: ApprovalPolicySnapshot;
}
```

Historical revisions are immutable.

`MilestoneRevision.sourceLinks` contains only links whose subject is that revision. `MilestoneRevisionSnapshot.sources` captures the complete applicable source context at revision creation: milestone, revision, criterion, and deliverable-requirement sources that define the revision. Challenge and review Sources remain attached to their own audit records and are included in historical decision snapshots only when relevant to that review or acceptance.

Changes to scope, criteria definitions, criterion weighting, deliverable requirements, dependency gates, review requirements, approval requirements, completion rules, or definition-bearing Sources MUST create a revision.

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

Attaching, detaching, replacing, changing the role of, changing the pin of, or changing note or metadata on a `specification` or `decision` Source is material. It MUST create or join one material revision and clear current acceptance and completion under the existing revision rules. A `reference` or `context` Source is contextual only: its changes are committed domain mutations and emit source events, but MUST NOT independently change progress, acceptance, completion, dependency gates, verification, or Artifact Requirement state. Editors MUST NOT infer definition-bearing status from artifact content.

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
  sourceLinks: readonly MilestoneSourceLink[];
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
  sourceLinks: readonly MilestoneSourceLink[];
}
```

A deliverable requirement describes why one or more artifact requirements participate in the milestone.

The milestone aggregate SHOULD retain stable Artifact SDK requirement references rather than embedded external aggregates.

The Artifact SDK describes the requirements, outputs, submissions, versions, and verification records themselves.

Criterion Sources explain, constrain, or define the criterion; deliverable-requirement Sources describe the expected deliverable. Neither relationship changes a criterion or deliverable state merely by existing. A design Artifact may therefore be a `specification` Source for a criterion while a separately submitted implementation Artifact satisfies that criterion's Artifact Requirement.

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

`links` provides external canonical links for artifact evaluation, evidence, and host-managed link resolution. Source links are retained as canonical relationship records in the milestone aggregate and revision snapshots; a host MAY additionally include them in this context, but the evaluator MUST tolerate either source of the same link without treating duplication as two relationships.

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

```ts
interface MilestoneSourceSnapshot {
  linkId: ArtifactLinkId;
  artifactId: ArtifactId;
  artifactVersionId?: ArtifactVersionId;
  subject: ArtifactSubjectReference<MilestoneSourceSubjectType>;
  role: MilestoneSourceRole;
  note?: string;
  metadata?: ArtifactMetadata;
}
```

Revision and decision snapshots preserve the source relationship's link ID, Artifact ID, subject, role, note, metadata, and exact resolved version where the Artifact is versionable. The source snapshot is historical milestone context; it is not an embedded Artifact aggregate and does not transfer Artifact lifecycle ownership to milestones.

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
  evidence: readonly ChallengeEvidence[];
  sourceLinks: readonly MilestoneSourceLink[];
}

interface ChallengeEvidence {
  id: ChallengeEvidenceId;
  milestoneId: MilestoneId;
  challengeId: ChallengeId;
  milestoneRevisionId: MilestoneRevisionId;
  kind: "supporting" | "response";
  title: string;
  description: string;
  state: "active" | "superseded" | "withdrawn";
  supersedesEvidenceId?: ChallengeEvidenceId;
  createdBy?: ActorRef;
  createdAt: string;
  withdrawnBy?: ActorRef;
  withdrawnAt?: string;
  withdrawalReason?: string;
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
  sourceSnapshot: readonly MilestoneSourceSnapshot[];
}
```

Targets MAY include a milestone, criterion, deliverable requirement, review, or artifact/evidence reference.

Challenge Sources are contextual or definition-bearing inputs supporting why the challenge was raised or resolved. They are distinct from challenge evidence: a Source says where the challenge's premise, reference, or decision context came from; evidence says what demonstrates the challenge or response. A challenge Source MUST NOT be represented as `ChallengeEvidence`, and challenge evidence MUST retain its dedicated `challenge_evidence` or `response_evidence` Artifact Link role. Resolving a challenge captures the applicable, version-resolved challenge Sources in the immutable `ChallengeResolution.sourceSnapshot`.

Challenge evidence is first-class, append-only audit material. Its title and description are mandatory. Supersession creates a new record and marks its predecessor `superseded`; withdrawal marks an active record `withdrawn`; neither deletes evidence. Evidence MUST NOT create a milestone revision, invalidate lifecycle pointers, or block acceptance.

Evidence sources MUST be canonical Artifact SDK links whose subject is `{ type: "challenge_evidence", id: evidenceId }`. Supporting evidence uses role `challenge_evidence`; response evidence uses role `response_evidence`. Once a source link exists it MUST pin an exact Artifact Version. Artifact records, raw artifact IDs, and source-link arrays MUST NOT be embedded in evidence.

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
  sourceLinks: readonly MilestoneSourceLink[];
  sourceSnapshot?: readonly MilestoneSourceSnapshot[];
}
```

A review MAY have Sources that provide review context, specification, reference, or decisions used while evaluating the revision. A review Source is not review evidence and does not itself determine the review result. Completing a review MUST capture its applicable, version-resolved Sources in immutable `sourceSnapshot`; where that review contributes to acceptance, the acceptance snapshot preserves the applicable source context as well.

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
  sources: readonly MilestoneSourceSnapshot[];
}
```

Each challenge snapshot includes immutable evidence metadata, evidence state, source-resolution status, and the resolved Artifact Link, artifact, and exact artifact-version IDs. Pending or invalid evidence sources are preserved as audit context and do not become acceptance reasons.

This snapshot is the normative historical boundary for artifact evidence and source context used in acceptance. Sources are captured for reproducibility and explanation; their presence does not become an acceptance reason unless an independent, explicit milestone requirement already evaluates the same Artifact through its own requirement, evidence, or deliverable relationship.

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

Challenge, approval, dependency, artifact, and source changes select their reopening effect through explicit policy and resolved outcome.

They MUST NOT invalidate lifecycle state merely because a related record exists.

A contextual Source change MUST NOT itself reopen a milestone. A definition-bearing Source change produces a material revision, which invalidates acceptance and completion under the revision rule. A later Artifact version for an unpinned contextual Source MUST NOT alter a historical lifecycle record; it becomes relevant only when an editor explicitly attaches, pins, or snapshots it in a later milestone operation.

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
  | SourceAttachedEvent
  | SourceDetachedEvent
  | SourceReplacedEvent
  | SourceRoleChangedEvent
  | SourceChangedEvent
  | ChallengeRaisedEvent
  | ChallengeResolvedEvent
  | ReviewCompletedEvent
  | ApprovalRecordedEvent
  | ApprovalRevokedEvent
  | MilestoneAcceptedEvent
  | MilestoneCompletedEvent
  | MilestoneReopenedEvent;
```

```ts
type SourceAttachedEvent = MilestoneEventEnvelope<
  "source.attached",
  { source: MilestoneSourceLink }
>;
type SourceDetachedEvent = MilestoneEventEnvelope<
  "source.detached",
  { linkId: ArtifactLinkId; subject: ArtifactSubjectReference<MilestoneSourceSubjectType> }
>;
type SourceReplacedEvent = MilestoneEventEnvelope<
  "source.replaced",
  { previousLinkId: ArtifactLinkId; source: MilestoneSourceLink }
>;
type SourceRoleChangedEvent = MilestoneEventEnvelope<
  "source.role_changed",
  { linkId: ArtifactLinkId; previousRole: MilestoneSourceRole; role: MilestoneSourceRole }
>;
type SourceChangedEvent = MilestoneEventEnvelope<
  "source.changed",
  { source: MilestoneSourceLink; changed: readonly ("note" | "metadata" | "artifact_version")[] }
>;
```

Public APIs MUST NOT collapse domain events to `{ type: string; payload: unknown }`.

Each member MUST have a discriminating literal and a specific payload contract.

Sequence is monotonic per milestone aggregate.

`milestone.sequence` MUST equal the sequence of the last domain event incorporated into the aggregate's current state.

Every committed domain-state mutation MUST emit at least one domain event and MUST advance `milestone.sequence`.

Source events use the same immutable envelope, current revision association, actor attribution, causation, correlation, and aggregate sequence as every other milestone event. `source.attached`, `source.detached`, `source.replaced`, and `source.role_changed` represent distinct semantic facts. `source.changed` is reserved for a committed note, metadata, or pin change that is not better represented by one of those facts.

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
  readonly sources: MilestoneSourceEditor;
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
editor.sources.attach(...);
editor.challenges.resolve(...);
editor.approvals.record(...);
```

over generic path mutation.

Editors validate milestone rules.

They MUST NOT implement host authorization.

Editors MUST NOT persist, write SQLite, write `.pm/`, write Git, push GitHub, upload artifacts, send notifications, send messages, or invoke providers.

`MilestoneSourceEditor` exposes semantic operations such as `attachSource`, `removeSource`, `replaceSource`, `updateSourceRole`, and source-link metadata or pin updates. It validates subject ownership, source role, link identity, and pinning rules; it never uploads, creates, deletes, persists, or otherwise owns Artifact Protocol records. Hosts provide canonical `ArtifactLink` values and persist returned milestone state and events.

Commit coordinates aggregate validation, revision creation, profile validation, artifact-condition evaluation, source resolution and snapshotting, evidence invalidation, progress derivation, lifecycle invalidation, graph impact reporting, event creation, and sequence advancement.

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

Sources advance the milestone wire protocol to **1.2**. A 1.2 milestone wire representation MUST serialize current source links on every sourceable aggregate or child, source links associated with immutable revisions, and source snapshots on historical revisions and acceptance records. It MUST preserve the complete canonical Artifact Link relationship data: `id`, `artifactId`, optional `artifactVersionId`, `subject`, `role`, optional `note`, optional `metadata`, and the protocol fields required by `@elqora/artifacts`.

```ts
interface MilestoneWireV1_2 {
  schemaVersion: "1.2";
  sourceLinks: readonly MilestoneSourceLink[];
  // criteria, deliverables, challenges, reviews, and revisions retain their
  // source-link and source-snapshot fields from the domain contracts.
}
```

The wire representation MUST NOT embed complete Artifact, ArtifactVersion, ArtifactRequirement, ArtifactSubmission, or ArtifactVerification records merely because Sources refer to them. A host reconstructs Artifact Protocol records through an explicit `MilestoneArtifactContext` or resolver when it needs to resolve a source. Source serialization is therefore storage-neutral and does not make milestones the artifact store.

1.1 milestone wire records remain valid historical input. A 1.2 hydrator MUST treat a valid 1.1 record as having no current or historical Sources and MUST preserve all of its existing historical records. Adapters MAY write an explicit 1.2 representation after hydration, but MUST NOT silently fabricate source links, Artifact IDs, versions, or source metadata.

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
source-link records
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
artifact link → milestone source subject
discussion → challengeId
projection row → milestoneRevisionId
```

These external records remain outside the milestone package.

---

## 16. Required invariants

1. Aggregate and first-class child IDs are stable and immutable.
2. Revisions, acceptance records, completion records, approval-history records, source snapshots, and events are append-only historical facts.
3. Current acceptance and completion derive only from `currentAcceptanceId` and `currentCompletionId`.
4. A current completion references the current acceptance for the same milestone revision.
5. Material revision clears both current lifecycle pointers without deleting historical records.
6. Reopening declares exactly which lifecycle pointers it invalidates.
7. Challenges invalidate lifecycle state only through explicit resolved outcomes and configured rules.
8. Reviews and approvals remain tied to the milestone revision they evaluated.
9. Review attribution distinguishes request, assignment, and completion when those actors differ.
10. Approval counts use distinct attributed actors for one stage and revision.
11. Artifact identity, versions, requirements, links, submissions, and verification records remain owned by the Artifact Protocol.
12. A milestone Source is a canonical Artifact Link expressing why an Artifact is relevant to an allowed milestone subject; it is not a parallel Source or Artifact model.
13. Milestones owns source relationship meaning and the relationship that makes an Artifact Requirement relevant to a criterion or deliverable, but not Artifact lifecycle or storage.
14. Milestone aggregates reference Artifact Requirements through stable Artifact SDK IDs rather than embedding complete external requirement aggregates.
15. Source links retain stable Artifact Link IDs and MUST NOT embed complete Artifact aggregates.
16. Artifact verification remains tied to the exact artifact version verified.
17. Definition-bearing Sources are version-pinned; all historical source context resolves to exact Artifact Versions when versionable and MUST NOT silently follow later versions.
18. Sources do not automatically become evidence, deliverables, Artifact Requirements, progress, acceptance, completion, dependency, or approval gates.
19. Acceptance snapshots record exact artifact requirement, artifact, artifact-version, submission, verification, and applicable source references used in evaluation.
20. Milestone artifact relationships use the Artifact SDK's requirement, link, submission, version, and verification contracts rather than parallel milestone-specific artifact models.
21. Technical dependency graphs reject self-dependencies and cycles.
22. Graph evaluation uses an explicit immutable snapshot.
23. Artifact evaluation and source resolution use an explicit immutable artifact context.
24. Progress never implies acceptance or completion.
25. Evaluation-relevant profile behavior is immutable and snapshotted.
26. Host authorization and ownership never enter milestone-domain evaluation.
27. Tasks, issues, discussions, plans, versions, and planning-evolution relationships remain external.
28. Editors do not own persistence, transport, Artifact Link lifecycle, or provider integration.
29. Derived projections never become competing mutable truth.
30. `milestone.sequence` equals the sequence of the last domain event incorporated into the aggregate's current state.
31. Every committed domain-state mutation, including a source change, emits at least one event and advances the aggregate sequence.
32. Same-logical-requirement edits preserve child identity; semantic replacement creates new identity.
33. Historical lifecycle records are never deleted merely because the milestone is reopened.
34. Artifact storage and artifact identity remain separate concerns.
35. The supported Artifact Protocol compatibility range is explicit and versioned.
36. Challenge evidence is append-only audit material and only an explicit challenge resolution outcome may reopen lifecycle state.
37. Challenge evidence sources are canonical version-pinned Artifact Links, not embedded artifact records or source arrays.
38. Sources attach only to milestone, revision, criterion, deliverable requirement, challenge, or review; they are never direct dependency, approval, acceptance, or completion subjects.
39. A contextual Source change cannot invalidate lifecycle state; a definition-bearing Source change follows material revision semantics.
40. Milestone wire 1.2 preserves source links and source snapshots, while hydration of valid wire 1.1 records produces no fabricated Sources.

---

## 17. Package model

```text
@timeax/milestones
│
├── Identity and Actor References
├── Profiles
├── Definitions and Revisions
├── Sources
│   ├── canonical ArtifactLink relationships
│   ├── reference, context, specification, and decision roles
│   ├── sourceable milestone subjects
│   ├── version-pinned definition-bearing sources
│   └── immutable revision and acceptance source snapshots
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

`@elqora/artifacts` provides the canonical artifact protocol used for milestone Sources, deliverables, evidence, submissions, verification, and historical artifact-version references. In this package, “Source” always means the milestone-domain use of an Artifact through a canonical Artifact Link; Artifact Protocol `ArtifactSource` remains the Artifact's own provenance and transport concept.

Explicit graph and evaluation inputs keep behavior deterministic.

Strict host boundaries keep the package reusable.

The package remains intentionally unaware of projects, tasks, issues, discussions, version planning, authorization, persistence, GitHub, `.pm/`, databases, storage providers, and UI.
