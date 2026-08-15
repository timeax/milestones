# @elqora/milestones — Progress Plan

This document defines the staged work required to harden `@elqora/milestones` from its current `0.1.0` foundation into a stable milestone domain SDK suitable for Project Manager and other consumers.

The package should remain:

- storage-neutral;
- network-neutral;
- provider-neutral;
- authorization-neutral;
- UI-neutral;
- independent from Prisma, SQLite, GitHub, `.pm/`, portal, notification, and application-specific concerns;
- integrated with `@elqora/artifacts` only through explicit protocol/domain contracts.

The phases below are ordered so that public contract stability, correctness, and compatibility are established before additional domain complexity is added.

---

# Phase 0 — Baseline and Repository Consistency

## Progress

- Status: **Completed**
- Implemented: Aligned the repository, npm metadata, README, package tarball, and GitHub detection on the Unlicense; added `timeax/milestones` repository/homepage/bugs metadata, package keywords and package-manager metadata; documented Node 20+, portable ESM, intended Bun support, and Artifact Protocol compatibility; added an isolated generated-tarball install/import smoke check.
- Tests: Clean typecheck, build, lint, 27-test Vitest suite, export check, Artifact compatibility check, npm audit, and isolated package smoke all pass. GitHub reports license key `unlicense` for `timeax/milestones`.
- Deviations: Bun is documented as intended but is not claimed fully supported until the ordered Bun compatibility phase completes.
- Blockers: None.

## Goal

Remove immediate repository/package inconsistencies and establish a trustworthy baseline before extending the SDK.

## Required updates

### 0.1 Resolve license mismatch

The repository currently presents conflicting license information between repository-level detection and package metadata.

Required:

- choose the intended license;
- ensure `LICENSE` matches the selected license;
- ensure `package.json#license` matches;
- ensure README documentation matches;
- ensure GitHub recognizes the same license;
- ensure published package metadata reports the same license.

### 0.2 Confirm package identity

Verify:

```text
package: @elqora/milestones
repository: timeax/milestones
current version: 0.1.0
```

Add or verify:

- repository metadata;
- homepage/documentation metadata if desired;
- package description;
- supported runtime documentation;
- compatibility with `@elqora/artifacts`.

### 0.3 Establish supported runtime policy

The package currently declares Node compatibility.

Decide whether the SDK is intended to support:

- Node.js;
- Bun;
- browser-compatible ESM where possible;
- other modern ESM runtimes.

The milestone domain layer should avoid runtime-specific APIs unless necessary.

## Required tests

- package builds from a clean checkout;
- package typechecks;
- lint passes;
- all current Vitest suites pass;
- package export check passes;
- artifact compatibility check passes;
- install/package smoke test succeeds from generated package output.

## Definition of done

The repository and package metadata tell one consistent story, the package builds from scratch, and the current test suite is green.

---

# Phase 1 — Editor Source Decomposition

## Progress

- Status: **Completed**
- Implemented: Split the editor implementation into a root `MilestoneEditor`, eight focused sub-editor modules, and shared internal draft/session/event/revision/helper modules. Preserved one cloned draft, original aggregate, graph/artifact contexts, event/invalidation buffers, expected sequence, and commit boundary. Hardened all sub-editors to reject operations after session closure.
- Tests: Added focused shared-session tests covering cross-sub-editor draft visibility, multiple material operations producing one revision, original milestone immutability, deterministic mixed-editor event order, shared sequence increments, and closure after commit. Typecheck, build, lint, 30 tests, exports, Artifact compatibility, and installed-package smoke all pass.
- Deviations: None.
- Blockers: None.

## Goal

Keep the existing editor architecture while preventing `milestone-editor.ts` from becoming a monolithic implementation file.

The current conceptual split is good:

```text
MilestoneEditor
├── DefinitionEditor
├── CriteriaEditor
├── DeliverableEditor
├── DependencyEditor
├── ChallengeEditor
├── ReviewEditor
├── ApprovalEditor
└── RevisionEditor
```

The physical source layout should now match that architecture.

## Required changes

Suggested structure:

```text
src/
└── editors/
    ├── milestone-editor.ts
    ├── definition-editor.ts
    ├── criteria-editor.ts
    ├── deliverable-editor.ts
    ├── dependency-editor.ts
    ├── challenge-editor.ts
    ├── review-editor.ts
    ├── approval-editor.ts
    ├── revision-editor.ts
    └── internal/
        ├── session.ts
        ├── revision.ts
        ├── events.ts
        ├── draft.ts
        └── helpers.ts
```

Keep:

- one shared edit session;
- one draft milestone;
- one original milestone;
- shared event collection;
- shared invalidation collection;
- shared expected sequence;
- shared graph context;
- shared artifact context;
- a single commit boundary.

Do **not** convert sub-editors into independent persistence units.

## Required tests

Existing editor tests must continue to pass without behavior changes.

Add focused tests for:

- shared session visibility across sub-editors;
- changes made through two different sub-editors in one transaction;
- revision creation only once for multiple material edits in the same session;
- editor session closure after commit;
- no mutation of the original milestone;
- deterministic event ordering across sub-editors;
- sequence increments across mixed sub-editor operations.

## Definition of done

The public editor API behaves exactly as before, while each editor domain can evolve independently in its own source module.

---


# Phase 2 — Editor History, Undo, and Redo

## Progress

- Status: **Completed**
- Implemented: Added `MilestoneEditor.history` with complete-session undo/redo/clear, configurable default/maximum history depth, linear redo-branch truncation, atomic sub-editor mutation checkpoints, nested `transact()` grouping, failed-operation/transaction restoration, and closed-session enforcement. Snapshots include draft/sequence, active profile, changes, events, invalidations, and pending material revision state; history remains editor-local and emits no domain events. Added a dedicated editor-history contract document.
- Tests: Added 14 focused history tests covering initial/boundary behavior, full revision and lifecycle-pointer restoration, exact redo without duplicate revisions, cross-editor history including governance, branch truncation, nested and failed transactions, stale-event/invalidation cleanup, profile restoration, immediate accept+complete grouping, deterministic event IDs/order after redo, limits, clear, immutability by isolation, and closed/active-transaction rules. Typecheck, build, lint, 44 tests, exports, Artifact compatibility, and installed-package smoke all pass.
- Deviations: None.
- Blockers: None.

## Goal

Add first-class editor history so consumers can support undo/redo during an active milestone editing session.

This is **editor-session history**, not milestone revision history.

The distinction is fundamental:

```text
editor undo/redo
≠
milestone revisions
≠
audit/event history
```

Undoing an uncommitted edit must restore the editor's prior draft state without creating new milestone revisions, domain events, acceptance invalidations, or completion invalidations.

Only the editor state that exists at commit time should become part of the resulting `MilestoneEditResult`.

## Required behavior

Expose history through the editor, for example:

```ts
editor.history.canUndo;
editor.history.canRedo;

editor.history.undo();
editor.history.redo();
editor.history.clear();
```

Possible public contract:

```ts
interface MilestoneEditorHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly index: number;
  readonly length: number;

  undo(): boolean;
  redo(): boolean;
  clear(): void;
}
```

An editor option should control retained history depth:

```ts
new MilestoneEditor(milestone, profile, {
  ids,
  clock,
  historyLimit: 100,
});
```

The SDK should define a safe default and a reasonable maximum.

## Snapshot scope

A history snapshot must capture the **complete mutable editor session state**, not only the draft milestone.

At minimum this includes:

```text
draft milestone
pending changes
pending events
pending invalidations
current material revision state
sequence state
any other mutable session state required for deterministic commit
```

Conceptually:

```ts
interface MilestoneEditorHistorySnapshot {
  readonly milestone: Milestone;
  readonly changes: readonly MilestoneChange[];
  readonly events: readonly MilestoneEvent[];
  readonly invalidations: readonly EvaluationInvalidation[];
  readonly revision?: MilestoneRevision;
}
```

The exact public/private shape may differ.

The critical invariant is:

> Restoring a history snapshot must make a later `commit()` behave exactly as though the undone operations never occurred.

Restoring only `draftMilestone` is insufficient if stale events, invalidations, changes, or revision markers remain in the session.

## Initial state

Creating a `MilestoneEditor` should establish the initial history point.

Expected behavior:

```text
open editor
→ canUndo = false
→ canRedo = false

edit
→ canUndo = true

undo
→ original editor state
→ canUndo = false
→ canRedo = true
```

## Redo branch behavior

History should follow normal linear editor semantics:

```text
Initial
  ↓
Edit A
  ↓
Edit B
  ↓
Edit C
```

Then:

```text
Undo → B
Undo → A
Redo → B
```

If the user now performs `Edit D`, the abandoned `C` branch must be discarded:

```text
A
↓
B
↓
D
```

Redo to `C` must no longer be possible.

The SDK does not need branching editor history in the first version.

## Transaction grouping

Support grouping several related mutations into one undo/redo step.

For example:

```ts
editor.transact("Configure approval flow", () => {
  editor.approvals.addStage(...);
  editor.approvals.addStage(...);
  editor.approvals.updatePolicy(...);
});
```

should create **one history entry**, not one entry per internal operation.

Nested transactions should collapse into the outermost transaction.

A failed transaction must restore the pre-transaction state and must not produce a history entry.

Higher-level editor methods that internally perform multiple mutations should use transaction semantics when those mutations represent one user action.

## Sub-editor integration

All sub-editors share the same editor history.

Example:

```text
editor.definition.update(...)
editor.criteria.add(...)
editor.dependencies.add(...)
```

should produce a single coherent history timeline.

Undo should be able to move across operations performed by different sub-editors.

There must not be separate history stacks for:

```text
criteria
deliverables
dependencies
reviews
approvals
etc.
```

The history belongs to the `MilestoneEditor` session.

## Domain event behavior

Undo/redo operations must not themselves create milestone domain events.

For example:

```text
criterion added
→ pending criterion.added event

undo
→ pending criterion.added event disappears

redo
→ pending criterion.added event is restored
```

Do not emit:

```text
milestone.undo
milestone.redo
```

as domain audit events merely because the editor moved through local history.

A host UI may emit its own UI/editor notifications if desired.

## Revision behavior

Undo/redo must restore material revision state correctly.

Example:

```text
accepted milestone
→ edit criterion definition
→ material revision created in editor session
→ acceptance invalidation pending
→ undo
```

After undo:

```text
material revision no longer pending
acceptance invalidation no longer pending
current acceptance restored in the draft session state
```

Redo must restore the same material revision state deterministically.

No extra milestone revision should be created merely because the user used redo.

## Commit behavior

Commit must operate only on the currently active history state.

Example:

```text
edit title
add criterion
undo add criterion
commit
```

The result must contain:

```text
title change
```

and must not contain:

```text
criterion change
criterion event
criterion-generated invalidation
```

Likewise:

```text
edit
undo
redo
commit
```

must commit the restored edit once, with the same logical outcome it had before undo.

## History after commit

Define and document editor lifetime explicitly.

Recommended behavior:

```text
commit()
→ editor session closes
→ history can no longer mutate the committed session
```

Calling `undo()` or `redo()` after commit should either:

- return `false`; or
- raise the existing `EDITOR_CLOSED` domain error.

Choose one contract and test it consistently.

A new editing session should be opened to modify the committed milestone again.

## Persistence boundary

Editor history should remain an in-memory/editor-session concern by default.

Do not make undo history part of:

```text
Milestone
MilestoneRevision
MilestoneAcceptance
MilestoneCompletion
.pm protocol
GitHub persistence
```

unless a future explicit session-persistence feature is designed.

Project Manager may later choose to persist an unfinished editor session locally, but that is a host concern and should not make undo snapshots canonical milestone history.

## Host/UI responsibility

The milestone SDK should expose undo/redo behavior but should not listen for keyboard events.

Project Manager may map:

```text
Ctrl/Cmd + Z
→ editor.history.undo()

Ctrl/Cmd + Shift + Z
→ editor.history.redo()

Ctrl + Y
→ optional redo alias
```

Keyboard handling belongs to the application/UI layer.

## Required tests

### Basic history

- initial editor has `canUndo === false`;
- initial editor has `canRedo === false`;
- first edit enables undo;
- undo restores prior state;
- redo restores next state;
- undo at history start returns false or documented equivalent;
- redo at history end returns false or documented equivalent.

### Complete session restoration

- undo restores draft milestone;
- undo restores pending `changes`;
- undo restores pending `events`;
- undo restores pending `invalidations`;
- undo restores material revision state;
- undo restores sequence state;
- redo restores all of the above;
- commit after undo contains only active changes;
- commit after redo contains restored changes exactly once.

### Cross-editor history

- definition edit followed by criteria edit undoes in correct order;
- criteria edit followed by dependency edit undoes in correct order;
- review/approval changes participate in the same history;
- history never diverges per sub-editor.

### Redo branch truncation

- edit A;
- edit B;
- undo;
- make edit C;
- redo is no longer available for B;
- resulting history is linear and deterministic.

### Transaction tests

- transaction with several mutations creates one history entry;
- nested transactions create one outer history entry;
- failed transaction restores pre-transaction state;
- failed transaction creates no history entry;
- failed transaction leaves no stale events;
- failed transaction leaves no stale invalidations;
- failed transaction leaves no material revision marker.

### Revision and invalidation tests

- material edit creates pending revision;
- undo removes pending revision;
- undo restores previous acceptance/completion pointers;
- undo removes associated invalidations;
- redo restores revision;
- redo restores invalidations;
- repeated undo/redo does not create extra revisions.

### Event tests

- undo does not create milestone domain event;
- redo does not create milestone domain event;
- event order after redo matches original operation order;
- undone events are absent from commit result.

### History limit

- history limit is respected;
- oldest snapshots are trimmed;
- current state is never trimmed;
- index remains valid after trimming;
- undo works correctly after trimming.

### Immutability

- original milestone passed into editor is never mutated;
- history snapshots cannot be mutated externally;
- restoring history uses cloned/immutable state as required.

### Closed editor

- commit closes editor;
- undo after close follows documented behavior;
- redo after close follows documented behavior;
- history state cannot mutate a committed result.

## Definition of done

`MilestoneEditor` provides deterministic session-level undo/redo across every sub-editor, transaction grouping works, undo/redo restores the entire pending domain state, and committing after arbitrary undo/redo operations yields only the currently active edits.

---

# Phase 3 — Public API and Export Surface

## Progress

- Status: **Completed**
- Implemented: Curated the root API; added `model`, `evaluation`, `graph`, `serialization`, `validation`, and `testing` subpaths; removed low-level helpers from the root; introduced the public `MilestoneEditorOptions` contract; prevented sub-editor construction from exposing the editor session; and documented stable, experimental, testing-only, and internal contracts in `docs/API_STABILITY.md`.
- Tests: 46 tests pass, including source-level public API coverage. Exact runtime export snapshot, all subpath imports, Artifact Protocol compatibility, an isolated packed-package runtime import, internal-path rejection, and an installed-consumer TypeScript declaration compilation all pass.
- Deviations: None.
- Blockers: None.

## Goal

Prevent accidental stabilization of internal helpers as public API.

## Required changes

Review every root export.

Current categories include:

```text
model
errors
protocol
evaluation
graph
validation
runtime infrastructure
serialization
editors
```

Classify each symbol as:

```text
public stable
public experimental
internal
testing-only
```

Consider explicit subpath exports such as:

```text
@elqora/milestones
@elqora/milestones/model
@elqora/milestones/evaluation
@elqora/milestones/graph
@elqora/milestones/serialization
@elqora/milestones/testing
```

The root package should expose the normal SDK path, not every implementation detail.

## Required additions

Add API stability documentation describing:

- stable public contracts;
- experimental contracts;
- semantic versioning expectations;
- whether branded IDs are stable public API;
- whether serialized shapes are protocol commitments.

## Required tests

- export snapshot test;
- package import smoke test;
- each documented subpath import works;
- undocumented internal modules are not accidentally importable through package exports;
- TypeScript declaration output exposes the intended API only.

## Definition of done

Consumers can clearly distinguish supported SDK API from implementation detail.

---

# Phase 4 — Actor Identity Contract

## Progress

- Status: **Completed**
- Implemented: Documented `ActorRef` as an opaque host-supplied `(type, id)` identity, with stable host namespace rules, an open optional type vocabulary, no SDK parsing/resolution, and host-owned display/profile data in `docs/ACTOR_IDENTITY.md`.
- Tests: Actor references are verified unchanged across revisions, reviews, approvals, acceptance/completion ledgers, typed events, and serialization. Distinct types with the same opaque ID count as distinct approval actors. Full suite: 51 passing tests.
- Deviations: None.
- Blockers: None.

## Goal

Stabilize actor identity before audit records become widely consumed.

Current actor references are deliberately generic.

That should remain true, but the identity convention needs to be explicit.

## Required changes

Define the contract for:

```ts
ActorRef
```

Questions to settle:

- Is `id` globally unique?
- Is `type` optional or required?
- Is `type` an open string or constrained vocabulary?
- Is actor identity namespaced by the host?
- How are people, services, automations, AI agents, and system actors represented?
- Can display metadata appear in the milestone SDK, or is that always host-owned?

Recommended direction:

```ts
interface ActorRef {
  readonly id: string;
  readonly type?: string;
}
```

with a documented rule:

> The host must supply stable actor identities. The milestone SDK treats actor IDs as opaque identifiers and never resolves permissions or profile data.

Possible host examples:

```text
github-user:12345678
pm-user:usr_01...
automation:deploy-bot
ai:codex
system:project-manager
```

These examples should remain non-normative unless a shared Elqora actor protocol is created later.

## Required tests

- actor references survive serialization round-trip;
- actor references remain unchanged in revisions;
- actor references remain unchanged in reviews;
- actor references remain unchanged in approvals;
- actor references remain unchanged in acceptance/completion records;
- actor IDs are not interpreted by the milestone SDK.

## Definition of done

Audit records can safely persist actors without tying the SDK to Project Manager, GitHub, or another identity provider.

---

# Phase 5 — Host Authorization Extension Points

## Progress

- Status: **Completed**
- Implemented: Added optional `MilestoneAuthorizationContext`, typed actions/subjects/decisions, `AUTHORIZATION_DENIED`, atomic host guards for every listed sensitive operation, and opaque approval-stage `authorityRef` propagation. Documented the neutral extension in `docs/AUTHORIZATION.md`; no host role/provider concepts entered the SDK.
- Tests: Permitted and rejected actions, zero-mutation/event/sequence denial behavior, cloned callback input, full sensitive-action routing, hook-free compatibility, and authority-reference revision/wire preservation pass. Full typecheck/build/test/export/Artifact/package gates pass; lint passes after the authorization assertion was made type-safe.
- Deviations: None.
- Blockers: None.

## Goal

Preserve authorization neutrality while making authorization integration explicit and difficult to misuse.

The milestone package should **not** own Project Manager roles or permissions.

It should, however, provide clear hooks/contracts where a host can authorize sensitive operations.

## Required design

Sensitive actions include:

- verify criterion;
- waive criterion;
- satisfy deliverable;
- waive deliverable;
- raise/resolve challenge;
- complete review;
- grant/reject/revoke/waive approval;
- accept milestone;
- complete milestone;
- reopen milestone;
- perform material revision.

Possible approach:

```ts
interface MilestoneAuthorizationContext {
  canPerform(input: {
    action: MilestoneAction;
    actor?: ActorRef;
    milestone: Milestone;
    subject?: MilestoneActionSubject;
  }): boolean | AuthorizationDecision;
}
```

Alternative:

- keep authorization entirely outside the editor;
- introduce optional host guards/callbacks;
- require the host to wrap editors.

Whichever approach is chosen, the SDK must not gain knowledge of:

```text
project leader
client
stakeholder
GitHub permission
organization team
portal user
```

## Approval authority reference

Consider allowing approval stages to carry an opaque host-owned authority selector:

```ts
authorityRef?: string;
```

Example:

```text
approval-stage: technical-review
authorityRef: governance:technical-approver
```

The milestone SDK stores the selector but does not resolve it.

## Required tests

- authorization hook allows permitted action;
- authorization hook rejects forbidden action;
- rejected action produces no state mutation;
- rejected action produces no event;
- rejected action produces no sequence increment;
- absence of an authorization hook preserves current host-responsibility behavior;
- authority references survive revision snapshots and serialization.

## Definition of done

Project Manager can enforce governance without leaking its role model into `@elqora/milestones`.

---

# Phase 6 — State Transition Hardening

## Progress

- Status: **Completed**
- Implemented: Added centralized transition services for criteria, deliverables, challenges, reviews, and approval revocation; wired every editor transition to them; hardened cross-milestone/unknown-stage/stale-revision approval revocation and current-acceptance completion checks; documented all matrices in `docs/TRANSITIONS.md`.
- Tests: Exhaustive table-driven valid/invalid state-pair tests plus editor atomicity, terminal review, corrupted approval ownership/stage, double revocation, nonexistent acceptance, and stale acceptance tests pass. Full suite: 59 tests with 96.72% statement coverage; typecheck, build, lint, export, Artifact, and package smoke gates pass.
- Deviations: None.
- Blockers: None.

## Goal

Make impossible milestone states difficult or impossible to construct through the SDK.

## Required review

Audit every transition for:

### Criteria

```text
not_started
in_progress
submitted
verified
failed
waived
```

Define which transitions are valid.

Avoid treating every state as freely assignable unless that is explicitly intended.

### Deliverables

```text
missing
submitted
satisfied
rejected
waived
```

Define valid transitions.

### Challenges

Review transitions for:

```text
open
under_review
resolved
rejected
withdrawn
reopened
```

### Reviews

Review transitions for:

```text
requested
in_progress
completed
cancelled
```

### Approvals

Ensure record semantics prevent invalid revocation or contradictory effective approvals.

### Completion and reopening

Ensure completion can only reference a valid current acceptance where policy requires it.

## Required additions

Introduce explicit transition validation helpers rather than scattering transition assumptions throughout editors.

Potential structure:

```text
src/services/transitions/
├── criteria.ts
├── deliverables.ts
├── challenges.ts
├── reviews.ts
└── approvals.ts
```

## Required tests

Table-driven tests for every valid and invalid transition.

Examples:

- criterion cannot verify twice;
- criterion cannot submit when already waived unless reset policy permits it;
- completed review cannot be completed again;
- cancelled review cannot receive result;
- approval revocation must reference a valid effective granted approval;
- approval revocation cannot revoke a record from another milestone;
- approval revocation cannot revoke a record from another stage;
- completion cannot reference nonexistent acceptance;
- stale acceptance cannot complete milestone when current acceptance is required.

## Definition of done

State changes behave like a deliberate domain state machine rather than unrestricted property mutation.

---

# Phase 7 — Validation and Invariant Expansion

## Progress

- Status: **Completed**
- Implemented: Reorganized validation into common, revision, and aggregate modules; expanded identity, revision-chain, live requirements, artifact-reference structure, dependencies, reviews, challenges, approval ledgers, acceptance snapshots, completion ledgers, profile-feature state, and historical revision-policy checks. Graph-only cycle/gate integrity remains correctly evaluated with explicit graph context.
- Tests: Added 35 malformed-fixture tests covering one corruption per core invariant plus graph cycles and missing criterion/deliverable gate targets. Deserialization uses the expanded aggregate validator. Full suite: 94 tests, 97% statement coverage; all package gates pass.
- Deviations: None.
- Blockers: None.

## Goal

Make `assertValidMilestone` capable of detecting corrupted or externally constructed invalid state.

Because the package is storage-neutral, consumers may deserialize records created outside the current process.

Validation must therefore be stronger than editor-only safety.

## Required invariant checks

At minimum validate:

### Identity

- milestone ID exists;
- current revision exists;
- current acceptance exists when referenced;
- current completion exists when referenced;
- IDs are unique within each collection.

### Revisions

- revision numbers are monotonic;
- revision chain is valid;
- previous revision references exist;
- current revision belongs to milestone;
- snapshots reference valid profile/version data.

### Criteria

- criterion IDs are unique;
- weights are finite and non-negative;
- required artifact requirements are structurally valid.

### Deliverables

- IDs are unique;
- artifact requirement references are structurally valid.

### Dependencies

- dependency IDs are unique;
- self-dependencies are rejected;
- criterion gate references valid criterion;
- deliverable gate references valid deliverable;
- graph cycle policy is enforced where required.

### Reviews

- review revision exists;
- completed review has valid result;
- result is absent when state does not permit it.

### Challenges

- challenge revision exists;
- challenge target exists when target is local to milestone;
- resolution state and resolution payload agree.

### Approvals

- stage exists;
- approval references correct revision;
- revocation target exists;
- revocation target belongs to same milestone/stage;
- required approval counts are valid.

### Acceptance

- acceptance revision exists;
- snapshot is internally coherent;
- current acceptance points at active revision when policy requires it.

### Completion

- completion references valid acceptance;
- completion revision matches required acceptance revision;
- current completion is coherent with current acceptance.

## Required tests

Create malformed fixture tests for every invariant.

Examples:

```text
duplicate criterion ID
missing current revision
review referencing old/missing revision
approval revoking foreign approval
acceptance referencing missing dependency
completion referencing missing acceptance
cycle in graph
invalid criterion gate
invalid deliverable gate
```

## Definition of done

A serialized milestone cannot be accepted into the domain unnoticed if it violates the SDK's core invariants.

---

# Phase 8 — Revision Semantics

## Progress

- Status: **Completed**
- Implemented: Documented exact MUST/MAY/MUST-NOT revision classification in `docs/REVISION_SEMANTICS.md`; added deep domain-value no-op detection; retained explicit administrative revisions; coalesced material edits into one final snapshot; and documented pointer invalidation plus explicit verification/satisfaction preservation controls.
- Tests: Material coalescing, execution-only operations, preserve/invalidate options, acceptance/completion ledger survival, no-op history/events, explicit revision, and cross-session snapshot immutability pass. Full suite: 100 tests, 97.21% statement coverage; all gates pass.
- Deviations: None.
- Blockers: None.

## Goal

Make material revision behavior explicit, predictable, and testable.

## Required review

Clarify which edits:

```text
must create revision
may create revision
must not create revision
```

Examples of likely material changes:

- milestone definition;
- criterion definition;
- criterion required flag;
- criterion weight;
- artifact requirements;
- deliverable requirements;
- dependency gates;
- approval stages;
- evaluation policy.

Runtime/execution changes should generally not create revisions:

- criterion progress state;
- deliverable submission state;
- challenge lifecycle;
- review lifecycle;
- approval records.

## Required additions

Document revision invalidation behavior:

```text
material revision
→ current acceptance invalidated
→ current completion invalidated
→ execution evidence may remain historically recorded
→ host receives invalidation records
```

Define whether changing a definition can preserve prior verification/satisfaction and under what explicit options.

## Required tests

- multiple material edits in one editor session create one revision;
- runtime state changes do not create revisions;
- criterion definition edit can preserve verification when explicitly allowed;
- criterion definition edit can invalidate verification;
- deliverable edit can preserve satisfaction when explicitly allowed;
- deliverable edit can invalidate satisfaction;
- revision invalidates current acceptance;
- revision invalidates current completion;
- previous acceptance/completion history is preserved;
- revision snapshot is immutable after commit.

## Definition of done

Consumers can reason precisely about what constitutes a milestone revision and what historical records survive it.

---

# Phase 9 — Acceptance and Completion Hardening

## Progress

- Status: **Completed**
- Implemented: Added public `editor.evaluateCompletion()`, introduced the specific `missing_acceptance` reason code, and audited deterministic acceptance snapshots across criteria, deliverables, dependencies, challenges, reviews, approvals, artifacts, and current revision. Completion remains a separate pure evaluation and exact-acceptance ledger transition.
- Tests: Pure repeatable evaluation, complete gate snapshots, deterministic reason order, optional work, waiver policy, rejected/revoked approvals, completion policy failures, exact acceptance linkage, and reopening ledger durability pass. Artifact version snapshots remain covered by Artifact integration tests. Full suite: 106 tests; all gates pass.
- Deviations: None.
- Blockers: None.

## Goal

Treat acceptance/completion as durable audit records, not simple status changes.

## Required work

Review acceptance evaluation for:

- required criteria;
- required deliverables;
- waived requirements;
- dependency gates;
- blocking challenges;
- reviews;
- approval stages;
- artifact requirements;
- artifact submissions;
- artifact verification;
- current milestone revision.

Review completion evaluation separately.

Acceptance should produce an immutable snapshot.

Completion should reference the acceptance that justified completion.

## Required additions

Consider explicit APIs:

```ts
editor.evaluateAcceptance()
editor.accept(...)
editor.evaluateCompletion()
editor.complete(...)
```

or equivalent clearly documented behavior.

Ensure repeated evaluation is pure and does not mutate milestone state.

## Required tests

- evaluation does not mutate milestone;
- accepted milestone snapshot captures all gate results;
- failed acceptance returns deterministic reason codes;
- one missing required criterion blocks acceptance;
- optional criterion does not block acceptance;
- waived required criterion follows policy;
- required deliverable follows policy;
- blocking challenge blocks acceptance;
- non-blocking challenge does not block unless policy says otherwise;
- incomplete review blocks when required;
- approval count is correctly evaluated;
- rejected/revoked approvals do not count;
- completion cannot occur when completion policy is unsatisfied;
- acceptance history survives reopening;
- completion history survives reopening.

## Definition of done

Acceptance and completion are independently explainable, replayable, and auditable.

---

# Phase 10 — Dependency and Graph Hardening

## Progress

- Status: **Completed**
- Implemented: Added deterministic `evaluateGraph`, `blockedMilestoneIds`, `readyMilestoneIds`, and `affectedMilestoneIds`; sorted all scheduler-facing results; retained explicit graph validation; documented runnable semantics and invalidation refresh requirements in `docs/GRAPH.md`.
- Tests: Direct and all four gate types, blocking/non-blocking behavior, completed exclusion, multi-hop/diamond/parallel impact, stale upstream acceptance, cycle rejection, and generated-DAG properties pass. Existing self/duplicate/missing-node/gate tests remain green. Full suite: 112 tests; all gates pass.
- Deviations: None.
- Blockers: None.

## Goal

Make milestone graph behavior reliable enough for Project Manager's visual dependency graph and AI execution planning.

## Required review

Dependency gates currently support:

```text
accepted
completed
criterion verified
deliverable satisfied
```

Keep gate semantics technical and domain-based.

Do not introduce hard-coded client/stakeholder concepts.

## Required additions

Provide stable graph APIs for:

- graph validation;
- cycle detection;
- dependency satisfaction;
- downstream impact;
- affected milestones after invalidation;
- currently blocked milestones;
- currently runnable/unblocked milestones.

Potential future API:

```ts
evaluateDependency(...)
evaluateGraph(...)
downstreamImpact(...)
blockedMilestones(...)
readyMilestones(...)
```

## Required tests

- direct dependency;
- multi-hop dependency;
- diamond dependency;
- parallel milestones;
- accepted gate;
- completed gate;
- criterion gate;
- deliverable gate;
- blocking vs non-blocking dependency;
- cycle rejection;
- self-dependency rejection;
- downstream invalidation;
- stale upstream acceptance invalidates dependent gate when required.

Property-based graph tests should be considered.

## Definition of done

The graph service can safely back a visual milestone graph and execution scheduler without React Flow or Project Manager-specific assumptions.

---

# Phase 11 — Artifact Integration Hardening

## Progress

- Status: **Completed**
- Implemented: Reverified the mandated local `@elqora/artifacts` 0.1.0 exports and protocol 1.0; cloned artifact/graph contexts per editor; made incomplete contexts fail closed; corrected pinned-versus-logical-link stale-version semantics; retained exact version/submission/verification provenance; and documented ownership/invalidation boundaries in `docs/ARTIFACT_PROTOCOL.md`.
- Tests: Satisfied/missing requirement, missing submission/verification, failed verification, wrong/stale versions, pinned evidence, criterion/deliverable evaluation, review/challenge link round-trip, context immutability, artifact-caused reopening, local compatibility, and published npm package smoke all pass. Full suite: 116 tests, 97.66% statement coverage.
- Deviations: None.
- Blockers: None.

## Goal

Strengthen integration with `@elqora/artifacts` without duplicating artifact-domain behavior.

## Required review

Ensure milestone owns only:

- milestone-specific artifact roles;
- milestone-specific artifact subjects;
- immutable artifact context used for evaluation;
- references to artifact protocol records.

Do not add:

- artifact persistence;
- storage provider APIs;
- GitHub artifact fetching;
- object-storage credentials;
- file upload handling.

## Required checks

Verify compatibility with the intended `@elqora/artifacts` `0.1.x` range.

Decide how milestone reacts when artifact context is incomplete or stale.

Clarify whether:

- artifact context is always immutable per edit/evaluation;
- artifact version is required for acceptance evidence;
- verification must target exact version;
- replaced artifacts can invalidate acceptance.

## Required tests

- artifact requirement satisfied;
- artifact requirement missing;
- artifact submission missing;
- verification missing;
- failed verification;
- wrong artifact version;
- stale artifact version;
- artifact linked to criterion;
- artifact linked to deliverable;
- artifact linked to review;
- artifact linked to challenge;
- artifact invalidation produces appropriate reopen/invalidation behavior.

## Definition of done

Milestone acceptance can rely on artifact evidence while `@elqora/artifacts` remains the canonical artifact protocol.

---

# Phase 12 — Reopening and Invalidation

## Progress

- Status: **Completed**
- Implemented: Enforced acceptance-invalidating effects for revision, challenge, approval revocation, dependency, and artifact causes; retained administrative/host flexibility; documented automatic versus host-detected paths and exact pointer/ledger/invalidation behavior in `docs/REOPENING.md`.
- Tests: Administrative, revision, challenge, approval-revocation, dependency, artifact, and host-requested causes; invalid cause/effect atomicity; pointer clearing; ledger preservation; re-acceptance/re-completion; and old-record immutability pass. Full suite: 129 tests; all gates pass.
- Deviations: None.
- Blockers: None.

## Goal

Make post-acceptance change handling one of the strongest parts of the SDK.

Supported reopening causes may include:

```text
administrative
revision
challenge
approval revocation
dependency invalidation
artifact invalidation
host-requested
```

## Required work

Define exact effects for:

```text
invalidate_completion
invalidate_acceptance_and_completion
```

Clarify which causes normally require which effect.

Preserve historical records.

Never erase accepted/completed history when reopening.

## Required tests

- administrative reopen;
- revision-driven reopen;
- challenge-driven reopen;
- approval-revocation reopen;
- dependency invalidation reopen;
- artifact invalidation reopen;
- host-requested reopen;
- reopening preserves historical acceptance;
- reopening preserves historical completion;
- current pointers are correctly cleared;
- new acceptance can occur after reopen;
- new completion can occur after reopen;
- old records remain immutable.

## Definition of done

The SDK correctly models the reality that accepted work may later become invalid without falsifying historical records.

---

# Phase 13 — Event and Audit Contract

## Progress

- Status: **Completed**
- Implemented: Added typed approval-stage/profile events and changes, host `causationId`, deep-cloned actors/payloads, complete event metadata propagation, and the audit-versus-event-sourcing contract in `docs/EVENTS.md`. Every committed editor mutation now emits at least one specific event.
- Tests: Exact event order/sequence, aggregate-local metadata, actor/correlation/causation propagation, payload immutability, profile/policy mutation coverage, failed-operation isolation, optimistic conflict isolation, commit output, and event wire round-trip pass. Full suite: 135 tests, 97.69% statement coverage; all gates pass.
- Deviations: None.
- Blockers: None.

## Goal

Stabilize milestone events as a reliable host integration surface.

Project Manager will likely use edit results to:

```text
update SQLite projection
append audit records
create outbox mutation
generate notifications
update UI
trigger downstream recalculation
```

The SDK must emit deterministic domain events without performing those operations itself.

## Required review

For every operation verify:

- correct event type;
- correct milestone ID;
- correct revision ID;
- actor;
- occurrence time;
- sequence;
- correlation ID;
- payload;
- deterministic order.

## Required additions

Document:

- whether event sequence is milestone-local;
- sequence conflict behavior;
- correlation ID semantics;
- event immutability;
- whether events are intended for replay or audit only.

Do not claim event sourcing unless the SDK can fully rebuild milestone state from events.

## Required tests

- sequence increments exactly once per emitted event;
- mixed editor operations preserve ordering;
- correlation ID propagates;
- actor propagates;
- commit returns emitted events;
- failed operation emits no event;
- validation failure emits no event;
- optimistic sequence conflict emits no domain mutation;
- events serialize and deserialize cleanly.

## Definition of done

Hosts can treat `MilestoneEditResult.events` as dependable audit/integration output.

---

# Phase 14 — Optimistic Concurrency Contract

## Progress

- Status: **Completed**
- Implemented: Formalized milestone-local sequence, editor open/commit checks, and the mandatory host storage compare-and-set boundary in `docs/CONCURRENCY.md`; no persistence/outbox behavior entered the SDK.
- Tests: Exact match, mismatch before draft/ID/event mutation, input immutability, sequence wire preservation, per-event advancement, and deterministic consecutive-commit handoff pass. Full suite: 139 tests; all gates pass.
- Deviations: None.
- Blockers: None.

## Goal

Make the editor safe for offline-first hosts and competing updates.

The editor already carries sequence-related concepts.

Formalize them.

## Required work

Define:

```text
milestone.sequence
expectedSequence
```

Behavior:

```text
load milestone at sequence N
→ open editor with expectedSequence N
→ another writer advances milestone to N+1
→ stale commit must be rejected by host/domain contract
```

Decide whether the SDK itself checks expected sequence or exposes enough data for host persistence to perform compare-and-set.

Project Manager will need this to integrate with:

```text
SQLite
outbox
GitHub sync
conflict records
```

## Required tests

- expected sequence matches;
- expected sequence mismatch;
- failed concurrency check does not mutate;
- failed concurrency check emits no event;
- serialization preserves sequence;
- sequence remains deterministic across commits.

## Definition of done

A host can build reliable optimistic concurrency around the SDK without inventing milestone-specific rules outside the package.

---

# Phase 15 — Serialization and Protocol Stability

## Progress

- Status: **Completed**
- Implemented: Added independent `MILESTONE_PROTOCOL_VERSION`, canonical JSON APIs, sorted object-key encoding, strict top-level unknown-field/future-version rejection, runtime state/discriminator validation, and documented ID/date/map/optional/forward/backward policies in `docs/SERIALIZATION.md`.
- Tests: Six committed v1 compatibility fixtures (minimal/full/accepted/completed/reopened/artifacts), canonical deep round-trip, lifecycle meaning, malformed/future/unknown/invalid-state rejection, insertion-order determinism, event canonicalization, declarations, and package smoke pass. Full suite: 149 tests, 97.93% statement coverage.
- Deviations: None.
- Blockers: None.

## Goal

Make persisted milestone representations safe across releases.

## Required work

Review the existing protocol/serialization layer.

Define:

- protocol version;
- serialized milestone shape;
- serialized branded IDs;
- date/time representation;
- `Map` serialization strategy;
- readonly arrays;
- optional fields;
- unknown field policy;
- forward compatibility;
- backward compatibility.

## Required additions

Add fixtures:

```text
test/fixtures/
├── milestone-minimal-v1.json
├── milestone-full-v1.json
├── milestone-accepted-v1.json
├── milestone-completed-v1.json
├── milestone-reopened-v1.json
└── milestone-artifacts-v1.json
```

Fixtures should be committed and treated as compatibility contracts.

## Required tests

- JSON round-trip;
- minimal milestone fixture;
- full milestone fixture;
- accepted milestone fixture;
- completed milestone fixture;
- reopened milestone fixture;
- artifact-integrated fixture;
- invalid fixture rejection;
- deterministic serialization;
- snapshot compatibility test.

## Definition of done

Project Manager can safely store milestone protocol data in `.pm/` and rebuild it on another machine.

---

# Phase 16 — Migration Strategy

## Progress

- Status: **Completed**
- Implemented: Added `src/migrations/` version routing, public/root and `migrations` subpath APIs, current-v1 validation/normalization, explicit `MIGRATION_UNSUPPORTED`, and the future sequential-transform contract in `docs/MIGRATIONS.md`. No fictitious v2 transformation was introduced.
- Tests: Deterministic current normalization, source immutability, stable IDs/revisions/ledgers/evidence preservation, non-object/versionless rejection, unsupported older/future versions, exports, installed declarations, and package smoke pass. Full suite: 154 tests, 97.96% statement coverage.
- Deviations: None.
- Blockers: None.

## Goal

Prepare for protocol evolution before consumers accumulate long-lived milestone records.

## Required design

Do not confuse:

```text
SDK package version
protocol version
milestone revision number
```

They are separate concepts.

Define migration architecture:

```text
serialized milestone v1
→ migrate
→ current protocol
→ validate
→ domain model
```

Possible structure:

```text
src/migrations/
├── index.ts
├── v1-to-v2.ts
└── ...
```

## Required tests

When a second protocol version exists:

- migrate old fixture;
- migration is deterministic;
- migration preserves stable IDs;
- migration preserves historical revisions;
- migration preserves acceptance/completion records;
- migration does not invent actors or evidence;
- migrated record passes current validation.

## Definition of done

The package has an explicit path for future serialized milestone evolution.

---

# Phase 17 — Bun and Runtime Compatibility

## Progress

- Status: **Completed**
- Implemented: Added Node/Bun CI jobs, `check:bun`, a Bun lifecycle/serialization smoke, conditional packed-package Bun import, published Artifact npm installation with optional mandated-local-source verification, and accurate README runtime claims. Runtime code remains modern ESM with no Node-only imports.
- Tests: Bun 1.3.14 passes typecheck, build, all 154 tests, lifecycle evaluation/edit/commit/serialization smoke, and isolated packed-package imports including export-map exclusion. Node gates remain green; npm install reports no vulnerabilities.
- Deviations: None.
- Blockers: None.

## Goal

Make Bun a tested first-class runtime because Project Manager is Bun/Electrobun based.

## Required work

Add CI coverage for:

```text
Node
Bun
```

At minimum test:

- import package;
- construct milestone;
- create editor;
- edit criterion;
- evaluate milestone;
- commit;
- serialize/deserialize.

Avoid unnecessary Node-only implementation.

If a Node engine restriction remains, document Bun support separately and verify package managers do not reject installation.

## Required tests

Run the full suite under supported runtimes where practical.

At minimum:

```text
npm test / Node
bun test or Bun-executed Vitest
build
typecheck
package smoke import
```

## Definition of done

Project Manager can depend on the package without maintaining a private compatibility patch.

---

# Phase 18 — Test Suite Expansion and Quality Gates

## Progress

- Status: **Completed**
- Implemented: Enforced global 95% statements/lines, 90% functions, and 80% branches; added `check:node`; extended the cross-domain E2E through artifact invalidation, reopen, re-accept, and re-complete; and added generated progress properties alongside generated DAG coverage. CI requires all specified Node and Bun gates.
- Tests: 24 files / 155 tests spanning unit, exhaustive state matrices, malformed invariants, graph properties, progress properties, cross-editor integration, full lifecycle, exports, Artifact compatibility, Node/Bun and package smoke. Coverage passes at 97.96% statements/lines, 97.11% functions, 89.01% branches. Mutation testing was considered but deferred because branch-targeted tests and thresholds cover current high-risk rules without adding a heavy release dependency.
- Deviations: None.
- Blockers: None.

## Goal

Raise confidence from normal unit-test coverage to domain-engine-grade confidence.

## Required test categories

### Unit tests

Focused domain operation tests.

### State transition tests

Table-driven valid/invalid transitions.

### Invariant tests

Malformed milestone structures.

### Integration tests

Multiple editors + evaluation + graph + artifacts.

### End-to-end domain tests

Example:

```text
create
→ define criteria
→ add deliverables
→ add dependency
→ submit
→ verify
→ review
→ approve
→ accept
→ complete
→ invalidate
→ reopen
→ re-accept
→ re-complete
```

### Property-based tests

Consider for:

- graph cycle behavior;
- unique ID invariants;
- progress calculation;
- approval counting;
- serialization round trips.

### Mutation testing

Consider later for evaluation/state-machine logic.

## Coverage expectations

Coverage percentage alone is not sufficient.

Require coverage for all high-risk domain branches:

- acceptance rejection reasons;
- invalid transitions;
- revision invalidation;
- reopening;
- approval revocation;
- dependency invalidation;
- artifact failures;
- concurrency.

## CI gate

A release candidate should require:

```text
build
typecheck
lint
unit tests
integration tests
end-to-end tests
export check
artifact compatibility check
Node smoke
Bun smoke
```

## Definition of done

A change to milestone rules cannot easily pass CI without exercising the relevant lifecycle behavior.

---

# Phase 19 — Documentation and Consumer Guides

## Progress

- Status: **Completed**
- Implemented: Added architecture, host/Project Manager-style integration, and lifecycle guides; linked specialized contracts from README; fixed the runnable quickstart; and added a package-name consumer example covering load/migrate/context/editor/CAS/persist/events/outbox without host concerns entering SDK source.
- Tests: `tsconfig.examples.json` compiles the consumer example after build; `check:examples` is part of Node CI/release gates. Existing lifecycle E2E executes all documented subsystem combinations.
- Deviations: None.
- Blockers: None.

## Goal

Make the package understandable without reading implementation source.

## Required documentation

### Architecture

Explain:

```text
domain engine
editor session
evaluation
graph
artifacts context
events
serialization
host responsibilities
```

### Host responsibilities

Explicitly state that the host owns:

```text
persistence
authorization
identity resolution
network
GitHub
notifications
storage
UI
portal
sync
conflict persistence
```

### Project Manager integration guide

Add a non-normative example:

```text
load milestone from persistence
load graph context
load artifact context
create editor
perform operation
commit
persist milestone + events atomically
create host outbox mutation
```

### Common lifecycle examples

- simple milestone;
- reviewed milestone;
- approved milestone;
- dependency-gated milestone;
- artifact-backed milestone;
- revision after acceptance;
- reopen after invalidation.

## Required tests

Documentation code examples should be compiled or executed in CI where practical.

## Definition of done

A consumer can correctly integrate the SDK without learning its architecture from tests or source code.

---

# Phase 20 — Project Manager Adapter Readiness

## Progress

- Status: **Completed**
- Implemented: Added a dedicated `integration/` Project Manager-style adapter outside SDK runtime/exports. It owns project/version/visibility/layout/repository/`.pm` bindings, serialized row/CAS transaction behavior, event rows, outbox, graph reconstruction, artifact resolution, restart, and rebuild while delegating all milestone rules to the SDK.
- Tests: Create/persist/reload/edit, offline shared-state restart, serialized outbox, graph reconstruction, artifact context cloning, optimistic conflict, and `.pm` snapshot rebuild pass. The adapter compiles as a consumer and is excluded from package `files`/exports.
- Deviations: The proof will remain outside the SDK public/runtime source boundary.
- Blockers: None.

## Goal

Prove that the SDK can be integrated into Project Manager without leaking application concerns into the SDK.

This phase belongs partly in Project Manager, but it acts as the final architecture validation for `@elqora/milestones`.

## Project Manager should own

```text
ProjectMilestoneBinding
projectId
versionId
visibility
graph position
repository routing
.pm path
SQLite projection
outbox status
portal publishing
permissions
notifications
AI context
```

## `@elqora/milestones` should own

```text
Milestone
criteria
deliverables
dependencies
revisions
reviews
challenges
approvals
acceptance
completion
reopening
evaluation
progress
events
```

## Integration proof

Build a thin Project Manager adapter that can:

```text
Prisma/SQLite row
→ deserialize SDK milestone
→ execute editor operation
→ receive MilestoneEditResult
→ serialize updated milestone
→ save local projection
→ append event records
→ create outbox mutation
```

all inside one host-side transaction.

## Required integration tests

Outside the SDK repository or in a dedicated integration harness:

- create milestone through SDK and persist;
- reload and edit;
- offline mutation survives restart;
- outbox payload contains serialized milestone change;
- graph context reconstructs;
- artifact context resolves;
- optimistic conflict is surfaced;
- rebuild from `.pm/` succeeds.

## Definition of done

Project Manager consumes `@elqora/milestones` as its milestone engine without maintaining a second milestone domain model.

---

# Phase 21 — `0.x` Stabilization Before `1.0`

## Progress

- Status: **Completed**
- Implemented: Froze and documented the IDs, actor, aggregate/profile, lifecycle, governance, revision, ledger, event, reason-code, wire, Artifact Protocol, and package-export contracts in `docs/STABILITY.md`; completed the 32-invariant audit in `docs/INVARIANT_AUDIT.md`; verified the package contains only the curated build, documentation, metadata, and license; verified `src/` contains no host persistence, provider, UI, repository, notification, or `.pm/` implementation; and replaced a stale local-link lockfile entry with the published `@elqora/artifacts@0.1.0` registry tarball while retaining an independent compatibility check against the mandated local source project.
- Tests: From a fresh `npm ci` registry install (0 vulnerabilities), `npm run check:node` passed typecheck, clean build, lint, 25 files / 159 tests, coverage (97.96% statements and lines, 97.11% functions, 88.98% branches), documentation/adapter example compilation, 64-root-export / 7-subpath verification, Artifact compatibility, and isolated packed-package smoke. `npm run check:bun` then passed Bun 1.3.14 typecheck, build, all 159 tests, and lifecycle/serialization smoke. `git diff --check` reported no whitespace errors (only the repository's Windows line-ending notices).
- Deviations: Mutation testing remains intentionally deferred as allowed by Phase 18; no normative behavior was deferred or omitted.
- Blockers: None.

## Goal

Use the remaining `0.x` releases to stabilize semantics rather than continuously expanding scope.

## Required review before `1.0`

Freeze or explicitly version:

- IDs;
- ActorRef contract;
- Milestone shape;
- profile contract;
- criterion states;
- deliverable states;
- dependency gates;
- challenge lifecycle;
- review lifecycle;
- approval record semantics;
- revision semantics;
- acceptance semantics;
- completion semantics;
- reopening semantics;
- event contract;
- evaluation reason codes;
- serialization format;
- artifact integration contract;
- export surface.

## Do not block `1.0` on unrelated features

The first stable milestone SDK does **not** need to own:

- tasks;
- work packages;
- versions/releases;
- messaging;
- GitHub discussions;
- portal publication;
- contracts;
- invoices;
- AI execution;
- Prisma;
- `.pm/` layout;
- React Flow;
- GitHub synchronization.

Those are separate domains or host concerns.

## Required release tests

Before `1.0.0`:

```text
clean install
build
typecheck
lint
full test suite
compatibility fixtures
artifact compatibility
Node compatibility
Bun compatibility
package tarball smoke test
API export verification
documentation example verification
```

## Definition of done

`1.0.0` represents a stable milestone domain protocol and lifecycle engine rather than a snapshot of Project Manager internals.

---

# Recommended Immediate Order

The next concrete work should be:

```text
1. Fix license/package metadata consistency
2. Split editor implementation files
3. Add editor history with undo/redo and transaction grouping
4. Review and curate exports
5. Stabilize ActorRef contract
6. Define authorization/authority extension point
7. Expand transition rules
8. Expand structural validation
9. Harden revision semantics
10. Harden acceptance/completion
11. Harden graph/dependency behavior
12. Harden artifact integration
13. Harden reopen/invalidation behavior
14. Stabilize events and concurrency
15. Freeze serialization fixtures
16. Add migration foundation
17. Add Bun CI
18. Expand quality gates
19. Improve integration documentation
20. Build Project Manager adapter proof
21. Stabilize toward 1.0
```

---

# Non-Goals

Unless the milestone SDK's responsibility changes deliberately, the following should stay outside this package:

```text
Prisma
SQLite
GitHub API
Git commits
.pm folder layout
network synchronization
outbox persistence
repository access
permission resolution
role management
client portal
notifications
email
messaging
meetings
contracts
invoices
React
React Flow
Electrobun
AI orchestration
object storage
```

The SDK may expose domain events, opaque references, serialization contracts, and host hooks that allow those systems to integrate.

It should not perform those systems' work.

---

# Final Architectural Rule

The package should continue to follow this boundary:

```text
Host application
    │
    ├── identity
    ├── authorization
    ├── persistence
    ├── synchronization
    ├── GitHub
    ├── UI
    └── notifications
          │
          ▼
@elqora/milestones
    │
    ├── milestone definition
    ├── lifecycle
    ├── revisions
    ├── criteria
    ├── deliverables
    ├── dependencies
    ├── challenges
    ├── reviews
    ├── approvals
    ├── evaluation
    ├── acceptance
    ├── completion
    ├── reopening
    └── audit events
          │
          ▼
@elqora/artifacts
```

The milestone SDK defines **what a milestone means and whether its rules are satisfied**.

The host decides **where it is stored, who is allowed to act, how it synchronizes, and how it is presented**.
