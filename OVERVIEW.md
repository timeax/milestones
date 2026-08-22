# Milestones

> A storage-neutral structured-execution domain package for defining, revising, evaluating, accepting, completing, reopening, auditing, and decomposing work through Milestones, Tasks, and Breakdowns, with first-class Artifact Sources, requirements, evidence, submissions, verification, and version-pinned Artifact history through `@elqora/artifacts`.

## 1. Status

This is the normative domain specification for `@timeax/milestones`.

**MUST**, **MUST NOT**, **SHOULD**, and **MAY** describe required, prohibited, recommended, and optional behavior.

TypeScript examples are conceptual contracts. They define intended semantics and public boundaries, not necessarily the exact final source representation.

The package has three first-class top-level domain concepts:

```text
Milestone
= a formal planned outcome

Task
= a structured execution unit

Breakdown
= a planning container that decomposes one parent Milestone
  into ordinary child Milestones
```

Milestone and Task share structured-execution machinery where their semantics genuinely match. Breakdown does not participate in the execution lifecycle itself; its children do because they are ordinary Milestones.

---

## 2. Purpose and boundary

`@timeax/milestones` owns the internal truth and lifecycle of structured execution through Milestones and Tasks and the decomposition-plan truth of Breakdowns.

The package owns:

- Milestone identity and Task identity;
- Milestone and Task profiles;
- Milestone and Task definitions;
- Milestone and Task revisions;
- criteria;
- deliverable requirements;
- execution-domain Source relationships to Artifacts;
- execution relationships to Artifact Requirements;
- Milestone technical dependencies;
- Task technical dependencies to Tasks or Milestones;
- dependency-graph and Task-scope graph evaluation;
- challenges;
- reviews;
- approvals;
- acceptance;
- completion;
- reopening and lifecycle invalidation;
- Task timing;
- Task reminder intent;
- Breakdown identity;
- Breakdown parent-Milestone linkage;
- Breakdown ownership/attribution reference;
- Breakdown child-Milestone membership and ordering;
- Breakdown hierarchy validation;
- typed domain events;
- editors;
- semantic DOM/read models;
- deterministic execution evaluation;
- storage-neutral serialization and migration contracts.

It does **not** own:

- issues;
- discussions;
- messaging;
- comments;
- notification delivery;
- host authorization policy;
- host visibility policy;
- Project implementation;
- Project Version or release-plan membership;
- planning evolution such as `upgrades`, `extends`, or `replaces`;
- persistence;
- databases;
- Git;
- GitHub;
- `.pm/`;
- providers;
- Artifact storage;
- file transport;
- UI.

A Task MAY carry an opaque host-owned Project identifier in its scope. That does not make Project a package aggregate and MUST NOT cause this package to resolve Project membership, repository membership, Project permissions, or persistence.

A Breakdown MAY carry an opaque owner/actor reference. That reference is attribution, not host authorization or visibility policy. The host remains responsible for deciding who may create, inspect, publish, share, edit, or persist a Breakdown.

Hosts integrate through stable IDs, Artifact Protocol objects, explicit immutable evaluation inputs, domain events, serializers, semantic DOMs, and adapters.

The package MUST work entirely in memory without Git, a database, `.pm/`, a network connection, or a particular host application.

Technical dependencies remain part of the package because they directly affect readiness, evaluation, acceptance, and completion.

Membership of an official Milestone in a Project Version, release, phase, wave, or other Project-level planning container belongs to a host or separate planning domain.

A Breakdown is an exception only in the sense that it is itself a reusable Milestone-decomposition container owned by this package. It is not a Project Version and MUST NOT acquire Project Version semantics.

Relationships such as `upgrades`, `extends`, and `replaces` remain outside this package because they describe planning evolution rather than the internal validity of a structured execution aggregate.

---

## 3. Artifact protocol dependency

`@timeax/milestones` uses `@elqora/artifacts` as its canonical Artifact Protocol.

The package MUST NOT redefine Artifact-domain concepts already owned by `@elqora/artifacts`, including:

- Artifact identity;
- Artifact versions;
- Artifact protocol sources/provenance;
- Artifact links;
- Artifact requirements;
- Artifact submissions;
- Artifact verification records.

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

The package MUST target an explicitly supported Artifact Protocol compatibility range.

At implementation time, the concrete TypeScript binding and package compatibility range MUST be pinned rather than inferred dynamically. The normative dependency is the Artifact Protocol contract; a host MAY provide an adapter when using a different compatible binding.

The package owns the Milestone/Task meaning of Artifact-domain records. It decides why an Artifact is a Source, required, evidence, or a deliverable in an execution context; which execution subject it participates in; whether required Artifact conditions are satisfied; how Artifact verification affects criterion or deliverable state; and which exact Artifact versions participated in revision, review, approval, acceptance, or completion.

The Artifact SDK owns what the Artifact is, Artifact identity, immutable Artifact versions, Artifact Requirements, Artifact Links, Artifact submissions, Artifact verification, and Artifact-level provenance.

`ArtifactRequirement` creation, mutation, identity, and lifecycle belong to the Artifact SDK. `@timeax/milestones` owns only the relationship that makes an `ArtifactRequirement` relevant to an execution criterion or deliverable requirement and the structured-execution consequences of satisfying or failing it.

Neither package inherently owns persistence or physical file storage.

`@timeax/milestones` MUST NOT implement Artifact uploads, object storage, S3, GitHub file discovery, pull-request discovery, commit lookup, blob persistence, Artifact hashing infrastructure, provider authentication, or provider-specific Artifact storage.

Those responsibilities remain in the Artifact SDK, its extensions, or the host application.

### 3.1 Execution Artifact and Source vocabulary

The package MAY define execution-specific Artifact subject and role vocabularies for use with the Artifact SDK's link model.

Milestone retains its established Artifact vocabulary:

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
```

Task MAY define an equivalent Task-specific Artifact subject vocabulary where the root subjects use `task` and `task_revision` rather than Milestone root identities. Shared implementation MUST NOT cause Task historical records to masquerade as Milestone records.

A **Source** is a canonical Artifact Link used as informational or definition context for an allowed execution subject.

For Milestone v1:

```ts
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
```

For Task v1:

```ts
type TaskSourceSubjectType =
  | "task"
  | "task_revision"
  | "criterion"
  | "deliverable_requirement"
  | "challenge"
  | "review";

type TaskSourceRole =
  | "reference"
  | "context"
  | "specification"
  | "decision";
```

`reference`, `context`, `specification`, and `decision` are the complete v1 Source-role vocabulary unless a future protocol revision deliberately expands it.

A Source is not evidence, a Deliverable, a verification record, an Artifact Requirement, or Artifact Protocol provenance merely because the same Artifact may participate in those other relationships.

```text
Source
!= Evidence
!= Deliverable
!= Artifact Requirement
!= Artifact Verification
!= Artifact provenance
```

A design or requirements document is identified through the Artifact's kind/specification and then used as a `specification` Source when it defines execution meaning. An implementation example is normally a `reference`; a product brief is normally `context`; and a decision record is a `decision`.

`evidence`, `deliverable`, and verification relationships remain separate Artifact relationships with their own semantics.

Sources MAY attach only to a Milestone or Task root, its current/historical revision, criterion, deliverable requirement, challenge, or review. Dependencies have no independent Source semantics. Approvals represent authority rather than mutable Source context. Acceptance and completion are immutable outcomes rather than mutable Source subjects; their snapshots preserve the applicable resolved Source context instead.

The aggregate stores canonical Source-link records, not complete Artifact, ArtifactVersion, ArtifactRequirement, submission, or verification aggregates. The host supplies those external records through an explicit Artifact evaluation context when resolution is required.

### 3.2 Artifact version pinning

Historical execution evaluation MUST preserve the exact Artifact versions that were evaluated.

If Artifact `A` has versions `v1`, `v2`, `v3`, and `v4`, and Milestone revision `R3` or Task revision `TR3` was accepted using `v3`, later creation of `v4` MUST NOT silently reinterpret that historical acceptance as having evaluated `v4`.

Any Artifact state used to justify historical verification, review, approval, acceptance, or completion MUST identify the exact `ArtifactVersion` evaluated when the Artifact is versionable.

Source pinning is explicit. `specification` and `decision` Source Links MUST carry `artifactVersionId`; they are definition-bearing and revision-defining. `reference` and `context` Source Links MAY omit `artifactVersionId` while they are current working context and thereby follow the logical Artifact.

A revision or historical decision snapshot MUST resolve every included Source to an exact ArtifactVersion whenever the Artifact is versionable. A later Artifact version MUST NOT reinterpret an earlier revision, review, acceptance, or completion snapshot.

When a snapshot must resolve an unpinned Source, the host MUST provide the relevant Artifact and ArtifactVersion through the appropriate explicit Artifact context; the resolved version MUST belong to the linked Artifact. A missing or mismatched Artifact or version is a deterministic source-resolution failure and MUST prevent creation of that reproducibility-required snapshot.

A Source relationship alone is never an acceptance, completion, progress, dependency, verification, evidence, deliverable, or Artifact Requirement gate. If the same Artifact is also used for a requirement, deliverable, verification, or evidence relationship, that use MUST have a distinct canonical Artifact Link or Artifact Requirement relationship with its own semantics.

### 3.3 Submission and verification

The package SHOULD consume Artifact SDK submission and verification records rather than create parallel Milestone- or Task-specific submission/verification ledgers.

```text
DeliverableRequirement
        ↓
ArtifactRequirement
        ↓
ArtifactSubmission
        ↓
ArtifactVerification
        ↓
Execution evaluation
        ↓
criterion/deliverable requirement satisfied
```

The Artifact SDK records the Artifact-domain fact. `@timeax/milestones` determines the execution-domain consequence.

---

## 4. Identity and attribution

Every externally referenceable first-class domain object MUST have a stable opaque ID.

Titles, positions, paths, filenames, database row positions, and provider-specific IDs are not domain identity.

```ts
type Brand<T, B extends string> = T & { readonly __brand: B };

type MilestoneId = Brand<string, "MilestoneId">;
type MilestoneProfileId = Brand<string, "MilestoneProfileId">;
type MilestoneRevisionId = Brand<string, "MilestoneRevisionId">;
type MilestoneEventId = Brand<string, "MilestoneEventId">;

type TaskId = Brand<string, "TaskId">;
type TaskProfileId = Brand<string, "TaskProfileId">;
type TaskRevisionId = Brand<string, "TaskRevisionId">;
type TaskEventId = Brand<string, "TaskEventId">;
type TaskReminderId = Brand<string, "TaskReminderId">;

type BreakdownId = Brand<string, "BreakdownId">;
type BreakdownEventId = Brand<string, "BreakdownEventId">;

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

interface ActorRef {
  id: string;
  type?: string;
  label?: string;
}
```

The package records who performed an action or owns/created a reusable domain plan where the domain model requires attribution, but never decides whether that actor was authorized.

Challenges, reviews, approvals, waivers, acceptance, completion, reopening, Breakdown ownership/creation, and events SHOULD carry an opaque `ActorRef` where an actor exists.

Authorization happens in the host through an explicit authorization context before or during an editor operation. Authorization policy is not part of deterministic execution evaluation.

### 4.1 ID generation

The package SHOULD support host-supplied or deterministic ID generation.

Milestone, Task, and Breakdown may expose aggregate-specific generators backed by reusable execution ID-generation primitives.

Conceptually:

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

interface TaskIdGenerator {
  task(): TaskId;
  revision(): TaskRevisionId;
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
  reminder(): TaskReminderId;
  event(): TaskEventId;
}

interface BreakdownIdGenerator {
  breakdown(): BreakdownId;
  event(): BreakdownEventId;
}
```

The domain package SHOULD NOT require hidden global randomness when an explicit ID generator is supplied.

---

## 5. Aggregates and current truth

### 5.1 Milestone

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

A Milestone is a formal planned outcome.

`currentAcceptanceId` and `currentCompletionId` are the only authoritative indicators of current Milestone acceptance and completion.

Any `accepted` or `completed` booleans exposed elsewhere are derived projections and MUST NOT be independently mutable.

### 5.2 Task

A Task is a structured unit of work. It intentionally uses the same execution language as Milestone where appropriate, but it is not a Milestone and MUST use Task-native aggregate/revision/event identities.

```ts
interface Task {
  id: TaskId;
  profile: TaskProfileRef;
  scope: TaskScope;

  currentRevisionId: TaskRevisionId;
  revisions: readonly TaskRevision[];

  definition: TaskDefinition;
  sourceLinks: readonly TaskSourceLink[];
  criteria: readonly TaskCriterion[];
  deliverables: readonly TaskDeliverableRequirement[];
  dependencies: readonly TaskDependency[];

  challenges: readonly TaskChallenge[];
  reviews: readonly TaskReview[];

  approvalPolicy?: TaskApprovalPolicy;
  approvalRecords: readonly TaskApprovalRecord[];

  acceptanceRecords: readonly TaskAcceptance[];
  currentAcceptanceId?: AcceptanceId;

  completionRecords: readonly TaskCompletion[];
  currentCompletionId?: CompletionId;

  timing?: TaskTiming;
  reminders: readonly TaskReminder[];

  sequence: number;
  createdAt: string;
  updatedAt?: string;
}
```

Task ceremony is profile-driven. A simple Task MAY complete without a formal acceptance ledger when its profile explicitly says acceptance is not required. A formal Task MAY require the same kinds of criteria, deliverables, dependency gates, challenge resolution, review, approval, acceptance, and completion semantics as Milestone.

Task lifecycle pointers have the same authority rule as Milestone: `currentAcceptanceId` and `currentCompletionId` are current truth; historical ledger records remain append-only.

### 5.3 Task scope

```ts
type TaskScope =
  | { type: "project"; projectId: string }
  | { type: "milestone"; milestoneId: MilestoneId }
  | { type: "breakdown"; breakdownId: BreakdownId }
  | { type: "task"; taskId: TaskId };
```

`projectId` is opaque host identity. The package MUST NOT resolve Project semantics merely because Task can be Project-scoped.

Task-to-Task scope nesting MAY be arbitrarily deep, but direct self-scope and contextual scope cycles MUST be rejected.

### 5.4 Task timing and reminders

```ts
interface TaskTiming {
  startsAt?: string;
  dueAt?: string;
  timeZone?: string;
}
```

`startsAt` and `dueAt` MUST be valid timestamps when present. When both exist, `dueAt` MUST NOT precede `startsAt`.

Task timing is declarative domain state. Notification delivery, OS scheduling, email, push, calendar integration, background daemons, and cron remain host concerns.

Task reminders are declarative reminder intent:

```ts
type TaskReminderTrigger =
  | { type: "at"; at: string }
  | { type: "before_due"; duration: string }
  | { type: "after_start"; duration: string };

interface TaskReminder {
  id: TaskReminderId;
  trigger: TaskReminderTrigger;
  createdAt: string;
  metadata?: Readonly<Record<string, JsonValue>>;
}
```

Equivalent normalized representations such as validated duration-minute inputs MAY be accepted by editors, but the public/wire contract SHOULD have one canonical representation before Task Protocol 1.0 is frozen.

Reminder changes are operational scheduling changes and SHOULD NOT by themselves create semantic Task revisions unless a future explicit policy makes reminder configuration requirement-bearing.

### 5.5 Breakdown

A Breakdown is a planning container for decomposing one existing Milestone into ordinary child Milestones.

```ts
interface BreakdownDefinition {
  title: string;
  description?: string;
  metadata?: Readonly<Record<string, JsonValue>>;
}

interface Breakdown {
  id: BreakdownId;
  parentMilestoneId: MilestoneId;
  owner?: ActorRef;
  definition: BreakdownDefinition;
  milestones: readonly Milestone[];
  sequence: number;
  createdAt: string;
  updatedAt?: string;
}
```

Breakdown is **not** an Execution Unit.

Breakdown MUST NOT have its own criteria, deliverables, challenges, reviews, approvals, acceptance, or completion lifecycle merely to imitate Milestone or Task.

Its child objects are ordinary `Milestone` aggregates and use the ordinary Milestone engine, editor, DOM, graph, Sources, serialization, and lifecycle.

```text
Official Milestone
    ↓
Breakdown
    ├── Milestone
    ├── Milestone
    └── Milestone
```

A child Milestone MAY itself be decomposed by another Breakdown:

```text
Milestone
→ Breakdown
→ Milestone
→ Breakdown
→ Milestone
```

No arbitrary decomposition-depth limit is required. Contextual Breakdown hierarchy validation MUST reject ancestry cycles.

Multiple Breakdowns MAY target the same parent Milestone. This allows different contributors or tools to create different execution plans for the same formal outcome.

Completion or acceptance of all child Milestones MUST NOT automatically accept or complete the parent Milestone.

### 5.6 Materialized and historical truth

Milestone and Task current materialized views MAY contain mutable working state for criteria, deliverables, challenges, reviews, timing, reminders, and similar operational records.

Historical truth is preserved through revisions, acceptance records, completion records, approval records, typed domain events, and exact Artifact-version references.

Current Source Links belong to the specific root/child subject that owns them. The aggregate MUST reject a Source Link attached to an unsupported subject or one whose subject identity does not belong to the aggregate.

Detaching a Source removes its structured-execution relationship from current truth; it MUST NOT claim to delete the Artifact, ArtifactVersion, or host-managed Artifact Link record.

---

## 6. Profiles and revisions

### 6.1 Milestone profiles

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

Milestone acceptance remains the formal lifecycle gate before Milestone completion according to the existing Milestone policy semantics.

### 6.2 Task profiles

```ts
interface TaskProfileRef {
  id: TaskProfileId;
  version: number;
}

interface TaskProfile {
  ref: TaskProfileRef;

  criteria: { enabled: boolean };
  deliverables: { enabled: boolean };
  dependencies: { enabled: boolean; participatesInGraph: boolean };
  revisions: { enabled: boolean };
  challenges: { enabled: boolean };
  reviews: { enabled: boolean; required: boolean };
  approvals: { enabled: boolean; required: boolean };

  completion: {
    enabled: boolean;
    requiresAcceptance: boolean;
    closeImmediatelyOnAcceptance: boolean;
  };
}
```

Task Profile is what allows both lightweight and formal Tasks without inventing separate Task aggregate classes.

Profile-owned ceremony is authoritative. Custom Task evaluation input MAY override requirement enforcement, waiver behavior, blocking-Challenge acceptance behavior, and the required Review result, but MUST NOT override whether the profile requires Reviews, Approvals, formal acceptance, or immediate completion after acceptance.

The stored `TaskEvaluationPolicySnapshot` is the complete resolved historical policy. Its `requiresAcceptance` and `closeImmediatelyOnAcceptance` values, and its profile-required Review/Approval gates, are derived from the Task Profile when the revision is created. It MUST NOT contain a second field expressing the same acceptance requirement under a different name.

Profile versions are immutable.

Every Milestone or Task revision records its exact profile reference and snapshots all evaluation- and completion-relevant behavior.

Historical evaluation MUST NOT depend on mutable external profile configuration.

A behavior-changing profile update MUST produce a revision before the new behavior governs that execution unit.

### 6.3 Revisions

Milestone revision remains:

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
```

Task revision is Task-native:

```ts
interface TaskRevision {
  id: TaskRevisionId;
  taskId: TaskId;
  number: number;
  previousRevisionId?: TaskRevisionId;
  reason?: string;
  actor?: ActorRef;
  createdAt: string;
  sourceLinks: readonly TaskSourceLink[];
  snapshot: TaskRevisionSnapshot;
}
```

A Task historical record MUST NOT store a Task revision under a `MilestoneRevisionId`-named field merely to share implementation code.

Revision snapshots SHOULD include the requirement-bearing state for their aggregate, including profile, evaluation policy, definition, criteria definitions, deliverable definitions, dependencies, definition-bearing Sources, approval policy, and Task timing where timing is revision-bearing.

Reminder preferences are normally operational state and SHOULD NOT create semantic revisions.

Historical revisions are immutable.

A revision Source collection contains only links whose subject is that revision. Revision snapshots capture the complete applicable definition-bearing Source context needed for reproducibility.

Changes to scope/definition, criteria definitions, criterion weighting, deliverable requirements, dependency gates, review requirements, approval requirements, completion rules, material Task timing, or definition-bearing Sources MUST create a revision when the aggregate's revision capability is enabled and the change is semantically material.

A material Milestone or Task revision MUST clear both `currentCompletionId` and `currentAcceptanceId` without deleting historical ledger records.

### 6.4 Child identity across revisions

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

Attaching, detaching, replacing, changing the role of, changing the pin of, or changing note/metadata on a `specification` or `decision` Source is material. It MUST create or join one material revision and clear current acceptance and completion under the existing revision rules.

A `reference` or `context` Source is contextual only. Its changes are committed domain mutations and emit Source events, but MUST NOT independently change progress, acceptance, completion, dependency gates, verification, or Artifact Requirement state.

Editors MUST NOT infer definition-bearing status from Artifact content.

---

## 7. Requirements and progress

Criteria and deliverable requirements are first-class, stable-ID execution objects shared by Milestone and Task semantics.

### 7.1 Criteria

```ts
type CriterionState =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "verified"
  | "failed"
  | "waived";

interface ExecutionCriterion<TSourceLink> {
  id: CriterionId;
  title: string;
  description?: string;
  required: boolean;
  weight?: number;
  state: CriterionState;
  artifactRequirementIds?: readonly ArtifactRequirementId[];
  sourceLinks: readonly TSourceLink[];
}
```

The public API MAY expose aggregate-specific aliases such as `Criterion` and `TaskCriterion` while using shared internal mechanics.

Criteria MAY require Artifact evidence through stable `ArtifactRequirementId` references.

The package MUST NOT create a parallel evidence-requirement model.

### 7.2 Deliverable requirements

```ts
type DeliverableRequirementState =
  | "missing"
  | "submitted"
  | "satisfied"
  | "rejected"
  | "waived";

interface ExecutionDeliverableRequirement<TSourceLink> {
  id: DeliverableRequirementId;
  title: string;
  description?: string;
  required: boolean;
  state: DeliverableRequirementState;
  artifactRequirementIds?: readonly ArtifactRequirementId[];
  sourceLinks: readonly TSourceLink[];
}
```

A deliverable requirement describes why one or more Artifact Requirements participate in an execution unit.

Criterion Sources explain, constrain, or define the criterion; deliverable-requirement Sources describe the expected deliverable. Neither relationship changes a criterion or deliverable state merely by existing.

### 7.3 Progress

Weighting and waiver policies MUST define all zero, missing, invalid, and waived cases deterministically.

```text
100% progress != accepted
100% progress != completed
```

For Milestone and formal Task, progress measures satisfied work; acceptance evaluates configured gates; completion closes the lifecycle.

For a Task whose profile does not require formal acceptance, progress still does not itself become completion. Completion remains an explicit transition after enabled requirements are satisfied.

Breakdown progress, when exposed, is a derived projection of child Milestones. It MUST NOT be stored as a competing mutable truth.

### 7.4 Artifact evaluation input

Artifact-domain state required for execution evaluation MUST be supplied explicitly.

Conceptually, shared evaluation may use:

```ts
interface ExecutionArtifactContext<TLink> {
  requirements: ReadonlyMap<ArtifactRequirementId, ArtifactRequirement>;
  artifacts: ReadonlyMap<ArtifactId, Artifact>;
  versions: ReadonlyMap<ArtifactVersionId, ArtifactVersion>;
  submissions: ReadonlyMap<ArtifactSubmissionId, ArtifactSubmission>;
  verifications: ReadonlyMap<ArtifactVerificationId, ArtifactVerification>;
  links: readonly TLink[];
}
```

Public aggregate-specific contexts MAY remain:

```text
MilestoneArtifactContext
TaskArtifactContext
```

A Task Artifact context MUST NOT be cast into a Milestone Artifact context merely to satisfy an implementation shortcut. Shared internals SHOULD operate on a genuinely shared context contract.

Evaluation receives Artifact-domain state as an explicit immutable input, in the same architectural spirit as dependency graph snapshots.

### 7.5 Artifact evaluation snapshots

Historical execution decisions MUST capture the exact Artifact-domain records that justified the decision.

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

`artifactVersionId` MUST be present whenever the evaluated state is version-specific or the underlying Artifact has an immutable version relevant to the historical decision.

Source snapshots preserve the Source relationship's link ID, Artifact ID, subject, role, note, metadata, and exact resolved version where versionable. They do not transfer Artifact lifecycle ownership to this package.

---

## 8. Technical dependencies, Task scope, and graph input

### 8.1 Milestone dependencies

Milestone dependencies remain Milestone-to-Milestone technical relationships.

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

### 8.2 Task dependencies

Task dependencies MAY target a Task or Milestone execution subject.

```ts
type ExecutionSubjectRef =
  | { type: "milestone"; id: MilestoneId }
  | { type: "task"; id: TaskId };

interface TaskDependency {
  id: DependencyId;
  taskId: TaskId;
  dependsOn: ExecutionSubjectRef;
  gate: TaskDependencyGate;
  blocking: boolean;
}
```

Task gates MAY include accepted, completed, criterion, and deliverable gates where the target kind can provide the requested gate.

Breakdown is not automatically an execution dependency subject. It has no canonical acceptance/completion lifecycle. A Task may be scoped to a Breakdown without depending on “Breakdown completion.”

### 8.3 Graph snapshots

Milestone graph services preserve their established public contract.

```ts
interface MilestoneGraphNode {
  id: MilestoneId;
  revisionId: MilestoneRevisionId;
  gates: MilestoneGateState;
}

interface MilestoneGraphSnapshot {
  milestones: ReadonlyMap<MilestoneId, MilestoneGraphNode>;
  dependencies: readonly MilestoneDependency[];
}
```

Task graph services SHOULD expose a Task-native graph or typed execution resolver rather than representing Tasks as Milestone graph nodes.

A mixed dependency resolver MAY conceptually provide:

```ts
interface ExecutionDependencyResolver {
  getMilestone(id: MilestoneId): MilestoneGraphNode | undefined;
  getTask(id: TaskId): TaskGraphNode | undefined;
}
```

Graph booleans are derived from current lifecycle pointers and current requirement state.

Graph services MUST consume explicit immutable inputs rather than load storage.

They SHOULD validate missing nodes, missing gate targets, invalid target-kind/gate combinations, self-dependencies, duplicate dependencies, and dependency cycles.

Task scope graph services MUST reject direct self-scope and contextual Task scope cycles.

### 8.4 Breakdown hierarchy

Breakdown hierarchy is derived through parent-Milestone references and child-Milestone membership.

If Breakdown `B1` contains child Milestone `M2`, and Breakdown `B2.parentMilestoneId === M2`, then `B2` is a nested decomposition below `B1`.

Hierarchy services SHOULD support deterministic cycle detection and navigation without requiring a stored `parentBreakdownId`.

Multiple Breakdowns MAY share one parent Milestone and MUST NOT be rejected merely because the `parentMilestoneId` is the same.

---

## 9. Challenges

A challenge is a formal dispute about execution validity.

It is not a general issue.

Milestone retains `MilestoneChallenge`; Task has an equivalent Task-native challenge aggregate tied to `TaskId` and `TaskRevisionId`.

Shared implementation MAY generalize challenge mechanics, but public/historical Task records MUST NOT use Milestone identity fields to hold Task values.

A challenge includes:

- stable challenge identity;
- root aggregate and revision identity;
- target;
- reason;
- blocking/non-blocking severity;
- current state;
- attribution;
- optional resolution;
- append-only challenge evidence;
- Source Links appropriate to the aggregate.

Targets MAY include the execution unit, criterion, deliverable requirement, review, or Artifact/evidence reference where supported.

Challenge Sources are contextual or definition-bearing inputs supporting why the challenge was raised or resolved. They are distinct from challenge evidence.

```text
Challenge Source
!= Challenge Evidence
```

Challenge evidence is first-class, append-only audit material. Supersession creates a new record and marks its predecessor superseded; withdrawal marks an active record withdrawn; neither deletes evidence.

Evidence MUST NOT create a revision, invalidate lifecycle pointers, or block acceptance merely by existing.

An unresolved blocking challenge MAY block a new acceptance under the snapshotted policy.

Its existence alone MUST NOT erase current or historical lifecycle records.

A challenge invalidates acceptance or completion only when its resolved outcome explicitly invalidates the accepted state or underlying requirements and the editor maps that outcome to an explicit reopening effect.

Challenge transition history is preserved through typed domain events.

---

## 10. Reviews and approvals

Review evaluates correctness.

Approval records formal authority.

Both are attributed and tied to the evaluated Milestone or Task revision.

### 10.1 Reviews

Milestone reviews remain tied to `MilestoneId` + `MilestoneRevisionId`.

Task reviews MUST be tied to `TaskId` + `TaskRevisionId`.

A completed review MAY include:

- requested-by attribution;
- assigned reviewer;
- completed-by attribution;
- state;
- result;
- summary;
- exact Artifact-version references used during review;
- Source Links and immutable resolved Source snapshot.

A review Source is context/specification/reference/decision material. It is not review evidence and does not itself determine the review result.

A new material revision MUST NOT automatically inherit review satisfaction from an earlier revision unless an explicit future policy says so.

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
  authorityRef?: string;
}
```

Where shared by Task, the scope labels MAY remain compatibility-oriented if already public, but Task approval records and historical snapshots MUST remain Task-native in root/revision identity.

The package does not discover eligible approvers.

A host resolves organizational policy into explicit evaluable requirements.

### 10.3 Approval ledger

Approval history MUST be append-only.

The package counts distinct actors with effective approvals for one stage and one exact revision.

A duplicate active approval by the same actor MUST NOT increase the count.

Revoked approvals remain historical but do not count toward current approval satisfaction.

Changing to a new revision MUST NOT accidentally carry forward effective approval from an older revision merely because stage IDs match.

---

## 11. Acceptance and completion ledgers

### 11.1 Milestone acceptance

Acceptance is an immutable evaluative fact that a Milestone revision satisfied its configured gates.

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

Its snapshot MUST identify the exact Milestone revision and evaluated state of criteria, deliverable requirements, technical dependencies, challenges, reviews, approvals, Artifact evaluations, and applicable Sources.

Acceptance records are append-only.

Clearing `currentAcceptanceId` MUST NOT delete an acceptance record.

A Milestone MUST NOT acquire a second current acceptance without first invalidating/reopening the existing current acceptance.

### 11.2 Task acceptance

Formal Task acceptance follows the same historical rigor but uses Task-native identities.

```ts
interface TaskAcceptance {
  id: AcceptanceId;
  taskId: TaskId;
  taskRevisionId: TaskRevisionId;
  acceptedAt: string;
  actor?: ActorRef;
  snapshot: TaskAcceptanceSnapshot;
}
```

`TaskExecutionEvaluationSnapshot` is the Task-native immutable evaluation snapshot shape. `TaskAcceptanceSnapshot` is that same contract when stored by a formal acceptance; direct completion stores it on `TaskCompletion.evaluationSnapshot` instead.

A Task acceptance snapshot MUST NOT contain `milestoneId` or `milestoneRevisionId` fields holding Task values.

Task acceptance records are append-only.

A Task MUST NOT acquire a second current acceptance without first invalidating/reopening the existing current acceptance.

A profile with `completion.requiresAcceptance === false` MAY allow Task completion without creating a fake acceptance record.

### 11.3 Milestone completion

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

A valid Milestone completion MUST reference the current acceptance for the same revision.

Milestone completion records are append-only.

A Milestone MUST NOT acquire a second current completion without reopening/invalidation of its current completion.

### 11.4 Task completion

Task completion is Task-native:

```ts
interface TaskCompletionBase {
  id: CompletionId;
  taskId: TaskId;
  taskRevisionId: TaskRevisionId;
  completedAt: string;
  actor?: ActorRef;
  reason?: string;
}

type TaskCompletion =
  | (TaskCompletionBase & {
      acceptanceId: AcceptanceId;
      evaluationSnapshot?: never;
    })
  | (TaskCompletionBase & {
      acceptanceId?: never;
      evaluationSnapshot: TaskExecutionEvaluationSnapshot;
    });
```

If the Task profile requires acceptance, a valid completion MUST reference current acceptance for the same Task revision.

If the profile does not require acceptance, completion MAY proceed directly after all enabled Task gates are satisfied and MUST NOT fabricate acceptance. A direct completion without `acceptanceId` MUST carry the immutable `TaskExecutionEvaluationSnapshot` that justified completion. An acceptance-backed completion MUST rely on its referenced acceptance snapshot and MUST NOT duplicate that proof in `evaluationSnapshot`.

Task completion records are append-only.

A Task MUST NOT acquire a second current completion without reopening/invalidation.

### 11.5 Breakdown has no acceptance/completion ledger

Breakdown itself is a plan container and MUST NOT gain an acceptance/completion ledger merely because its child Milestones have one.

```text
all child Milestones accepted/completed
!= parent Milestone accepted/completed
```

### 11.6 Evaluation output

Evaluators SHOULD return explainable results listing missing criteria, missing deliverables, unsatisfied dependencies, blocking challenges, incomplete reviews, pending approvals, Artifact Requirement failures, Artifact verification failures, and structured reasons.

Historical acceptance snapshots are the normative boundary for reconstructing formal acceptance-backed evaluation. A direct Task completion's `TaskExecutionEvaluationSnapshot` is the equivalent normative boundary when no acceptance record exists.

---

## 12. Reopening and invalidation

Reopening has an explicit lifecycle effect for Milestone and Task.

```ts
type ReopenEffect =
  | "invalidate_completion"
  | "invalidate_acceptance_and_completion";
```

Compatibility aliases MAY exist internally or temporarily, but the public contract SHOULD converge on one canonical vocabulary.

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

Challenge, approval, dependency, Artifact, and definition-bearing Source changes select their reopening effect through explicit policy and resolved outcome.

They MUST NOT invalidate lifecycle state merely because a related record exists.

A contextual Source change MUST NOT itself reopen an execution unit.

A definition-bearing Source change produces a material revision and therefore invalidates current acceptance and completion under the revision rule.

Every invalidation preserves historical ledger records and emits typed domain events.

Reopening a Task after completion MUST make a later re-completion possible while preserving the historical prior completion record. Reopening acceptance MUST likewise permit later re-acceptance while preserving historical acceptance.

Breakdown does not use execution reopening because it has no acceptance/completion lifecycle. Breakdown edits are ordinary plan-container mutations.

---

## 13. Typed events and sequence

Events are immutable domain facts.

They are not transport messages.

### 13.1 Milestone events

Milestone keeps its typed event envelope:

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

### 13.2 Task events

Task events MUST use Task-native identity:

```ts
interface TaskEventEnvelope<T extends string, P> {
  id: TaskEventId;
  type: T;
  taskId: TaskId;
  sequence: number;
  revisionId: TaskRevisionId;
  actor?: ActorRef;
  occurredAt: string;
  causationId?: TaskEventId;
  correlationId?: string;
  payload: P;
}
```

The Task event union SHOULD include semantic facts for creation, definition, Sources, criteria, deliverables, dependencies, challenges/evidence, reviews, approvals, revisions, timing, reminders, acceptance, completion, and reopening.

`TaskEditor.create(...).commit()` MUST include a `task.created` event and a `{ type: "created" }` change.

### 13.3 Breakdown events

Breakdown events MUST use Breakdown identity and cover plan-container facts such as:

```text
breakdown.created
breakdown.definition_changed
breakdown.milestone_added
breakdown.milestone_removed
breakdown.milestone_replaced
breakdown.milestone_moved
```

`BreakdownEditor.create(...).commit()` MUST include a `breakdown.created` event and created change.

Child Milestone events remain Milestone events. Breakdown MUST NOT re-emit every child Milestone event as if it were a Breakdown lifecycle event.

### 13.4 Sequence

Public APIs MUST NOT collapse domain events to `{ type: string; payload: unknown }`.

Each member MUST have a discriminating literal and a specific payload contract.

Sequence is monotonic per aggregate.

For Milestone, Task, and Breakdown:

```text
aggregate.sequence
= sequence of the last domain event incorporated into current aggregate state
```

Every committed domain-state mutation MUST emit at least one domain event and MUST advance that aggregate's sequence.

An edit session SHOULD capture an expected sequence to support host-level optimistic concurrency without introducing persistence into the package.

Hosts MAY persist or publish returned events.

The package itself MUST NOT do so.

---

## 14. Editors and evaluation

Meaningful writes use composed, draft-based editors.

Milestone and Task share execution mechanics where semantics genuinely match. Breakdown uses a separate planning-container editor.

### 14.1 MilestoneEditor

The existing `MilestoneEditor` remains the semantic Milestone facade.

Conceptually:

```ts
class MilestoneEditor {
  readonly definition: DefinitionEditor;
  readonly sources: MilestoneSourceEditor;
  readonly criteria: CriteriaEditor;
  readonly deliverables: DeliverableEditor;
  readonly dependencies: DependencyEditor;
  readonly challenges: ChallengeEditor;
  readonly evidence: EvidenceEditor;
  readonly reviews: ReviewEditor;
  readonly approvals: ApprovalEditor;
  readonly revisions: RevisionEditor;
  readonly history: MilestoneEditorHistory;

  evaluateAcceptance(): AcceptanceEvaluation;
  evaluateCompletion(): CompletionEvaluation;

  accept(actor?: ActorRef): AcceptanceId;
  complete(actor?: ActorRef, reason?: string): CompletionId;
  reopen(request: ReopenRequest): void;

  commit(): MilestoneEditResult;
  rollback(): void;
}
```

Existing Milestone public behavior and Milestone Wire 1.2 compatibility MUST remain stable while shared internals evolve.

### 14.2 TaskEditor

TaskEditor is the semantic Task facade.

Conceptually:

```ts
class TaskEditor {
  readonly definition: TaskDefinitionEditor;
  readonly sources: TaskSourceEditor;
  readonly criteria: TaskCriteriaEditor;
  readonly deliverables: TaskDeliverableEditor;
  readonly dependencies: TaskDependencyEditor;
  readonly challenges: TaskChallengeEditor;
  readonly evidence: TaskEvidenceEditor;
  readonly reviews: TaskReviewEditor;
  readonly approvals: TaskApprovalEditor;
  readonly revisions: TaskRevisionEditor;
  readonly timing: TaskTimingEditor;
  readonly reminders: TaskReminderEditor;
  readonly history: TaskEditorHistory;

  evaluateAcceptance(): TaskAcceptanceEvaluation;
  evaluateCompletion(): TaskCompletionEvaluation;

  accept(actor?: ActorRef): AcceptanceId;
  complete(actor?: ActorRef, reason?: string): CompletionId;
  reopen(request: TaskReopenRequest): void;

  commit(): TaskEditResult;
  rollback(): void;
}
```

TaskEditor MUST enforce lifecycle conflicts equivalent in rigor to MilestoneEditor. It MUST reject a second current acceptance or completion until explicit invalidation/reopening clears the corresponding current pointer.

If Task acceptance auto-completes under profile policy, acceptance and automatic completion SHOULD execute as one coherent mutation/history boundary rather than nested independent editor transactions.

### 14.3 Shared execution editor internals

Shared sub-editors SHOULD operate against properly typed execution capabilities rather than rely on widespread `as any`, `as never`, or Task-as-Milestone casts.

Separate aggregate sessions MAY remain, but reusable editor behavior SHOULD depend on small shared typed contracts where possible.

Shared implementation MUST NOT erase semantic identity. In particular:

```text
TaskId != MilestoneId
TaskRevisionId != MilestoneRevisionId
Task acceptance/review/approval snapshots != Milestone snapshots with Task values cast into them
```

Public aggregate-specific editors MAY preserve compatibility aliases for historically Milestone-named shared editor types where necessary, but the canonical new Task surface SHOULD use execution-neutral or Task-native names.

### 14.4 BreakdownEditor

BreakdownEditor edits only Breakdown plan state.

Conceptually:

```ts
class BreakdownEditor {
  readonly definition: BreakdownDefinitionEditor;
  readonly milestones: BreakdownMilestonesEditor;
  readonly history: BreakdownEditorHistory;

  commit(): BreakdownEditResult;
  rollback(): void;
}
```

Breakdown milestone operations SHOULD include add, create through canonical Milestone creation, remove, replace, move/reorder, and lookup as appropriate.

Editing a child Milestone MUST use ordinary `MilestoneEditor` behavior. The Breakdown editor MAY provide convenience composition but MUST NOT create a separate `BreakdownMilestoneEditor` domain.

### 14.5 Editor transactions and history

All sub-editors in one edit session MUST share the same draft and edit context.

Editors SHOULD support deterministic undo/redo and transaction boundaries where the existing editor architecture supports them.

A transaction containing multiple semantic mutations SHOULD create one coherent history boundary.

A failed transaction MUST roll back all draft/event/change/revision state introduced by that transaction.

Commit MUST reject an active incomplete transaction.

Commit MUST preserve optimistic concurrency/sequence checks appropriate to the aggregate.

An editor MUST NOT continue mutating after commit or rollback closes it.

### 14.6 Editor boundaries

Editors expose semantic operations.

Prefer:

```ts
editor.criteria.verify(...);
editor.sources.attach(...);
editor.challenges.resolve(...);
editor.approvals.grant(...);
editor.timing.setDue(...);
editor.reminders.add(...);
```

over generic path mutation.

Editors validate domain rules.

They MUST NOT implement host authorization policy.

Editors MUST NOT persist, write SQLite, write `.pm/`, write Git, push GitHub, upload Artifacts, send notifications, send messages, or invoke providers.

### 14.7 Pure deterministic services

Pure deterministic services SHOULD include aggregate-appropriate forms of:

```ts
calculateProgress(...);
deriveMilestoneState(...);
deriveTaskState(...);
evaluateAcceptance(...);
evaluateTaskAcceptance(...);
evaluateCompletion(...);
evaluateTaskCompletion(...);
evaluateDependency(...);
evaluateTaskDependencies(...);
evaluateArtifacts(...);
validateMilestone(...);
validateTask(...);
validateBreakdown(...);
validateGraph(...);
validateTaskScopeGraph(...);
validateBreakdownHierarchy(...);
detectCycles(...);
```

Pure services MUST NOT load storage or use hidden wall-clock state.

---

## 15. Semantic DOM / read models

The package exposes semantic read-only document models so hosts, CLIs, UIs, and AI consumers can navigate domain meaning without parsing raw aggregate or wire representation.

Editors are for writes. Documents are for semantic reads. Serializers are for transport/storage-neutral representation.

```text
Domain Aggregate
     ↓
Semantic Document / DOM
     ↓
UI / CLI / AI / host queries
```

DOM implementation SHOULD be lazy where child materialization can be expensive and SHOULD use bounded collection/text reads where the existing Milestone DOM establishes that convention.

### 15.1 MilestoneDocument

The existing rich Milestone DOM remains canonical for Milestone reads and SHOULD continue exposing semantic documents for profile, definition, overview, progress, criteria, deliverables, dependencies, readiness, Sources, challenges, reviews, approvals, revisions, acceptance, completion, and bounded text/collection access.

### 15.2 TaskDocument

TaskDocument SHOULD provide semantic parity for execution concepts supported by Task.

Conceptually:

```ts
interface TaskDocumentContract {
  getId(): TaskId;
  getOverview(): TaskOverviewDocument;
  getProfile(): TaskProfileDocument;
  getScope(): TaskScopeDocument;
  getDefinition(): TaskDefinitionDocument;
  getDescription(): TextDocument;
  getTiming(): TaskTimingDocument;
  getReminders(): TaskRemindersDocument;
  getProgress(): TaskProgressDocument;
  getReadiness(): TaskReadinessDocument;
  getCriteria(): CriteriaDocument;
  getDeliverables(): DeliverablesDocument;
  getDependencies(): TaskDependenciesDocument;
  getSources(): TaskSourcesDocument;
  getAllSources(): TaskSourcesDocument;
  getChallenges(): TaskChallengesDocument;
  getReviews(): TaskReviewsDocument;
  getApprovals(): TaskApprovalsDocument;
  getRevisions(): TaskRevisionsDocument;
  getAcceptance(): TaskAcceptanceStatusDocument;
  getCompletion(): TaskCompletionStatusDocument;
}
```

Compatibility aliases such as `getAcceptanceStatus()` or `getCompletionStatus()` MAY remain if already public, but the canonical API SHOULD be internally consistent and documented.

Task DOM MUST use Task-native historical types. It MUST NOT expose `MilestoneDefinitionDocument`, `MilestoneSourcesDocument`, or Milestone revision identity as the canonical Task contract merely because a shared implementation began in the Milestone DOM.

Shared execution-neutral document contracts such as `CriteriaDocument`, `DeliverablesDocument`, `TextDocument`, or a generic `ProgressDocument` MAY be reused directly.

### 15.3 TaskOverviewDocument

Task overview SHOULD cheaply answer high-value questions such as:

- title;
- current derived state;
- scope;
- progress percentage;
- whether blocked;
- whether accepted/completed;
- open/blocking challenge counts;
- required/satisfied criterion counts;
- required/satisfied deliverable counts;
- start/due information;
- Source counts.

Overview SHOULD NOT eagerly materialize all heavy child documents merely to answer summary queries.

### 15.4 Task readiness and dependencies

Task readiness is dependency-graph runnability and SHOULD align with canonical Milestone readiness. Blocking Challenges remain acceptance blockers and are exposed through Challenge, Overview, and Acceptance documents; they do not independently redefine graph readiness.

A Task readiness document SHOULD be able to explain:

```text
ready / blocked / unknown
blocking dependency count
unknown dependency count
structured reasons
```

Without graph context, readiness and blocked state are unknown. An unknown dependency MUST NOT be reported as unsatisfied or blocked. A completed Task is not runnable even when its dependencies are satisfied.

Task dependency documents SHOULD expose target type, target identity, gate, blocking status, current satisfaction, and structured failure reason without requiring raw Task JSON traversal.

### 15.5 Task challenges, reviews, approvals, and revisions

Task DOM SHOULD expose:

- current/historical challenges, blocking state, resolution, evidence, and Sources;
- reviews by current/historical Task revision, reviewer attribution, result, Artifact versions, and Sources;
- approval stages, effective approval records, waivers, pending stages, and revision-specific satisfaction;
- current revision and historical revision navigation, including historical definition, policy, timing where revision-bearing, and Sources.

Historical DOM reads MUST remain reproducible from immutable snapshots rather than reinterpret old records through current Task state.

### 15.6 Task timing and reminder reads

Task timing DOM MUST be deterministic.

It SHOULD require an explicit `asOf` timestamp or receive an explicit injected clock/context for time-relative calculations.

It MUST NOT silently call `new Date()` inside domain/read-model logic when an operation is expected to be deterministic.

Useful timing semantics MAY include:

```ts
hasStart(): boolean;
hasDueDate(): boolean;
isScheduled(): boolean;
hasStarted(asOf: string): boolean;
isOverdue(asOf: string): boolean;
getRemainingMilliseconds(asOf: string): number | undefined;
```

Reminder documents MAY resolve absolute/relative reminder times from explicit Task timing and an explicit `asOf`, but MUST NOT deliver notifications.

### 15.7 BreakdownDocument

BreakdownDocument reads Breakdown plan semantics and reuses ordinary child `MilestoneDocument`s.

Conceptually:

```ts
interface BreakdownDocumentContract {
  getId(): BreakdownId;
  getParentMilestoneId(): MilestoneId;
  getOwner(): ActorRef | undefined;
  getDefinition(): BreakdownDefinitionDocument;
  getDescription(): TextDocument;
  getMilestones(): BreakdownMilestonesDocument;
  getMilestoneCount(): number;
  getProgress(): BreakdownProgressDocument;
  getReadiness(): BreakdownReadinessDocument;
}
```

Child Milestone Documents require their correct Milestone profile and MAY require graph/Artifact context. Breakdown document construction SHOULD accept suitable resolvers/context providers so child documents can be built through canonical `createMilestoneDocument()` behavior rather than a duplicate implementation.

Missing required child-document context SHOULD use the package's canonical typed domain-error mechanism rather than an arbitrary plain error where consistent with package conventions.

Breakdown progress/readiness are derived plan projections. They MUST NOT become independent mutable truth or mutate the parent Milestone lifecycle.

`BreakdownReadinessDocument.hasRunnableWork()` is the canonical work-availability query and returns `undefined` only when no child is known runnable and at least one incomplete child is unknown. `isFullyEvaluated()` reports whether every incomplete child was classifiable. Compatibility aliases `isReady()` and `canEvaluate()` MAY remain but SHOULD delegate to those canonical methods.

---

## 16. Integration, serialization, and migrations

Domain objects and domain events MUST have serializable representations.

Runtime structures such as `ReadonlyMap` require explicit wire adapters.

Protocols evolve independently per aggregate.

The current intended protocol identities are:

```text
Milestone Protocol: 1.2
Task Protocol:      1.0
Breakdown Protocol: 1.0
```

Do not document these as one universal migration chain such as `1.0 -> 1.1 -> 1.2 -> 2.0`. They are separate aggregate protocols.

### 16.1 Milestone Wire

Milestone Wire 1.2 remains the existing storage-neutral serialized representation and MUST preserve backward compatibility unless a future deliberate Milestone protocol revision is made.

Source Links and historical Source snapshots remain represented according to the established 1.2 contract.

Valid 1.1 Milestone wire records remain valid historical input to a compatible 1.2 hydrator. Hydration MUST NOT fabricate Sources.

### 16.2 Task Wire

Task Wire 1.0 is an independent public protocol.

It MUST serialize Task-native root, revision, lifecycle, review, approval, challenge, Source, timing, reminder, and dependency state.

Task Wire MUST NOT contain Milestone-named identity fields carrying Task IDs or TaskRevisionIds merely because implementation is shared.

Conceptually:

```ts
interface TaskWire {
  schemaVersion: "1.0";
  // complete Task representation with Task-native historical identity
}
```

Before Task Protocol 1.0 is treated as frozen, its wire shape SHOULD have a golden fixture and deterministic round-trip tests.

### 16.3 Breakdown Wire

Breakdown Wire 1.0 is independent:

```ts
interface BreakdownWire {
  schemaVersion: "1.0";
  id: BreakdownId;
  parentMilestoneId: MilestoneId;
  owner?: ActorRef;
  definition: BreakdownDefinition;
  milestones: readonly MilestoneWire[];
  sequence: number;
  createdAt: string;
  updatedAt?: string;
}
```

Child Milestones MUST be serialized/deserialized using the canonical Milestone wire adapter. Breakdown MUST NOT duplicate Milestone serialization logic.

### 16.4 Migration architecture

Milestone, Task, and Breakdown migration paths MUST remain independent.

Conceptually:

```text
migrateMilestoneWire(...)
migrateTaskWire(...)
migrateBreakdownWire(...)
```

Even when Task/Breakdown currently have only 1.0, their migration seams SHOULD exist before the contracts are frozen.

### 16.5 Storage neutrality

Wire representation MUST NOT embed complete Artifact, ArtifactVersion, ArtifactRequirement, ArtifactSubmission, or ArtifactVerification records merely because Source/evidence relationships refer to them.

Schema migration, hydration, repositories, transactions, storage layout, encryption, synchronization, Git, `.pm/`, and provider integration belong to hosts or adapters.

A host MAY normalize hydrated aggregates into multiple records or files.

The package MUST NOT assume that its in-memory aggregates are persisted as one document.

External systems reference stable IDs without entering the aggregate.

Examples:

```text
issue → TaskId
issue → CriterionId
artifact link → deliverableRequirementId
discussion → ChallengeId
projection row → TaskRevisionId
Project Manager metadata → BreakdownId
```

These external records remain outside the package.

---

## 17. Required invariants

1. Aggregate and first-class child IDs are stable and immutable.
2. Milestone and Task revisions, acceptance records, completion records, approval-history records, Source snapshots, and events are append-only historical facts.
3. Current acceptance and completion derive only from `currentAcceptanceId` and `currentCompletionId`.
4. A current Milestone completion references current acceptance for the same Milestone revision.
5. A Task completion references current Task acceptance for the same Task revision when the Task profile requires acceptance.
6. A Task profile that does not require acceptance MAY complete directly after all enabled completion gates are satisfied and MUST NOT fabricate acceptance.
7. Milestone and Task MUST reject duplicate current acceptance and duplicate current completion until explicit invalidation/reopening clears the corresponding current pointer.
8. A material Milestone or Task revision clears both current lifecycle pointers without deleting historical records.
9. Reopening declares exactly which lifecycle pointers it invalidates and never deletes historical ledger records.
10. Challenges invalidate lifecycle state only through explicit resolved outcomes and configured rules.
11. Reviews and approvals remain tied to the exact Milestone or Task revision they evaluated.
12. Review attribution distinguishes request, assignment, and completion when those actors differ.
13. Approval counts use distinct attributed actors for one stage and revision.
14. Task historical review/approval/challenge/acceptance records MUST use Task identity; they MUST NOT represent Task values under Milestone identity fields.
15. Artifact identity, versions, requirements, links, submissions, verification records, provenance, and storage remain owned by the Artifact Protocol/host.
16. A domain Source is a canonical Artifact Link expressing why an Artifact is informationally relevant to an allowed Milestone/Task subject; it is not a parallel Source or Artifact model.
17. The complete v1 Source-role vocabulary is `reference`, `context`, `specification`, and `decision` unless deliberately revised by a future protocol version.
18. Sources do not automatically become evidence, deliverables, Artifact Requirements, Artifact verification, progress, acceptance, completion, dependency, or approval gates.
19. Definition-bearing Sources are version-pinned and revision-bearing; all historical Source context resolves to exact Artifact Versions when versionable.
20. Contextual Source changes MUST NOT independently invalidate lifecycle state.
21. Historical revision Sources MUST NOT be rewritten by current-state Source editor operations.
22. Milestone and Task aggregates reference Artifact Requirements through stable Artifact SDK IDs rather than embedding complete external requirement aggregates.
23. Artifact verification remains tied to the exact Artifact Version verified.
24. Acceptance snapshots record exact applicable Artifact requirement, Artifact, Artifact-version, submission, verification, and Source references used in evaluation.
25. Shared execution implementation MUST NOT require Task to masquerade as Milestone through unsafe identity/snapshot casts.
26. Milestone dependencies remain Milestone-to-Milestone technical relationships unless a future Milestone protocol explicitly changes that model.
27. Task dependencies MAY target Tasks or Milestones through typed execution-subject references and compatible gates.
28. Breakdown is not an execution dependency subject merely because Tasks may be scoped to a Breakdown.
29. Technical dependency graphs reject self-dependencies and cycles.
30. Task scope graphs reject self-scope and cycles.
31. Breakdown hierarchy rejects ancestry cycles without imposing arbitrary nesting depth.
32. Multiple Breakdowns MAY target the same parent Milestone.
33. Breakdown child objects are ordinary Milestones; there is no separate BreakdownMilestone aggregate.
34. Breakdown has no criteria, deliverables, challenge, review, approval, acceptance, or completion lifecycle of its own.
35. Child Milestone acceptance/completion MUST NOT automatically accept or complete the parent Milestone.
36. Graph and Artifact evaluation use explicit immutable inputs.
37. Progress never implies acceptance or completion.
38. Breakdown progress/readiness are derived from child Milestones and never become competing mutable truth.
39. Evaluation-relevant profile behavior is immutable and snapshotted per Milestone/Task revision.
40. Host authorization, visibility, Project implementation, persistence, and provider concerns never enter deterministic execution evaluation.
41. A Task MAY store opaque Project scope without making Project a package aggregate.
42. A Breakdown MAY store owner attribution without owning host authorization/visibility policy.
43. Editors do not own persistence, transport, Artifact Link lifecycle, notification delivery, Git, databases, or provider integration.
44. Semantic DOMs are read-only projections and never become competing mutable truth.
45. Time-relative Task DOM calculations use explicit time/clock input and MUST NOT depend on hidden wall-clock state.
46. `milestone.sequence`, `task.sequence`, and `breakdown.sequence` each equal the sequence of the last domain event incorporated into that aggregate's current state.
47. Every committed domain-state mutation emits at least one typed event and advances the mutated aggregate sequence.
48. Task creation produces a typed `task.created` event and created change; Breakdown creation produces `breakdown.created` and created change.
49. Same-logical-requirement edits preserve child identity; semantic replacement creates new identity.
50. Source, evidence, deliverable, verification, and Artifact provenance relationships remain semantically distinct even when they reference the same Artifact.
51. Milestone Wire 1.2 remains compatible with its established contract.
52. Task Wire 1.0 and Breakdown Wire 1.0 are independent protocols and MUST round-trip without Milestone/Task identity confusion.
53. Breakdown serialization reuses canonical Milestone wire serialization for children.
54. Public editor/DOM types SHOULD remain strongly typed; widespread `as any`/`as never` must not substitute for a correct shared execution abstraction.
55. Strict typecheck/lint/test/build/package/runtime validation is part of completion for a production-quality reusable SDK.

---

## 18. Package model

```text
@timeax/milestones
│
├── Shared Execution Primitives
│   ├── Identity and Actor References
│   ├── Criteria and Deliverable states
│   ├── Progress/Evaluation reasons
│   ├── Artifact evaluation primitives
│   ├── Shared editor capabilities
│   └── Shared DOM primitives
│
├── Milestone
│   ├── MilestoneProfile
│   ├── Definition and immutable Revisions
│   ├── Sources
│   ├── Criteria
│   ├── Deliverable Requirements
│   ├── Milestone Dependencies / Graph
│   ├── Challenges / Evidence
│   ├── Reviews
│   ├── Approvals
│   ├── Acceptance Ledger
│   ├── Completion Ledger
│   ├── Reopening / Invalidation
│   ├── MilestoneEditor
│   ├── MilestoneDocument
│   └── Milestone Wire 1.2
│
├── Task
│   ├── TaskProfile
│   ├── TaskScope
│   ├── Definition and immutable Revisions
│   ├── Sources
│   ├── Criteria
│   ├── Deliverable Requirements
│   ├── Task Dependencies / mixed execution resolver
│   ├── Task scope graph
│   ├── Challenges / Evidence
│   ├── Reviews
│   ├── Approvals
│   ├── Acceptance Ledger when profile requires it
│   ├── Completion Ledger
│   ├── Timing
│   ├── Reminder intent
│   ├── Reopening / Invalidation
│   ├── TaskEditor
│   ├── TaskDocument
│   └── Task Wire 1.0
│
├── Breakdown
│   ├── parentMilestoneId
│   ├── owner attribution
│   ├── definition
│   ├── ordinary Milestone[] children
│   ├── hierarchy/cycle validation
│   ├── BreakdownEditor
│   ├── BreakdownDocument
│   └── Breakdown Wire 1.0
│
├── Artifact Protocol Integration
│   ├── canonical ArtifactRequirement references
│   ├── canonical ArtifactLink relationships
│   ├── ArtifactSubmission inputs
│   ├── ArtifactVerification inputs
│   ├── explicit Artifact contexts
│   ├── ArtifactEvaluationSnapshot
│   └── version-pinned historical context
│
├── Typed Events and Aggregate Sequences
├── Validation
├── Serialization
├── Independent Migrations
└── Deterministic Evaluation
```

---

## 19. Host integration model

The package is deliberately storage-neutral and provider-neutral.

A host may compose it as:

```text
UI / CLI / AI
      ↓
MilestoneEditor / TaskEditor / BreakdownEditor
      ↓
Domain validation + deterministic evaluation
      ↓
EditResult + typed events
      ↓
Host persistence / outbox / Git / .pm / API / database
```

Read-side integration may use:

```text
Hydrated Domain Aggregate
      ↓
MilestoneDocument / TaskDocument / BreakdownDocument
      ↓
semantic UI / CLI / AI queries
```

The package MUST NOT invert this boundary by reading host files, storage, GitHub, notifications, or databases from inside domain services.

Project Manager may choose to store a private Breakdown locally and a shared Breakdown in `.pm/`; this package does not know or encode that distinction.

Project Manager may deliver Task reminders through desktop notifications, email, or other services; this package only defines reminder intent and deterministic timing semantics.

---

## 20. Compatibility and stabilization expectations

Milestone is the mature existing aggregate and its behavior/protocol MUST be protected while Task/Breakdown internals are stabilized.

Before Task Protocol 1.0 and Breakdown Protocol 1.0 are treated as frozen public contracts, the implementation SHOULD satisfy all of the following:

- duplicate Task acceptance/completion lifecycle conflicts are enforced;
- Task and Breakdown creation emit creation changes/events;
- Task revision policy snapshots exactly match runtime policy semantics;
- Task acceptance/review/approval/challenge/source snapshots are Task-native;
- shared execution editor/evaluation/DOM behavior does not depend on unsafe Task-as-Milestone casts;
- strict TypeScript safety is preserved rather than globally disabled;
- Task DOM covers the full supported execution language;
- Breakdown DOM exposes the intended plan semantics while reusing ordinary Milestone documents;
- Source/evidence/verification/provenance vocabulary remains deliberately separated;
- historical Task revisions/reviews/approvals/acceptances/Sources remain reproducible;
- Milestone Wire 1.2 golden compatibility remains green;
- Task Wire 1.0 and Breakdown Wire 1.0 round-trip fixtures are green;
- README/examples compile against actual public APIs;
- Node and Bun validation pipelines pass completely;
- packed-package import/export smoke tests pass.

The package SHOULD NOT be declared contract-stable while known violations of these normative rules remain.
