# Agent Instructions

## Source of truth

`OVERVIEW.md` is the normative specification for `@timeax/milestones`.

Before implementing or changing structured-execution behavior, read `OVERVIEW.md` in full and treat its MUST / MUST NOT / SHOULD / MAY rules and invariants as authoritative.

Do not silently redesign the domain. If implementation exposes a genuine contradiction or ambiguity in `OVERVIEW.md`, report it explicitly and continue with unaffected work.

The package now has three first-class top-level domain concepts:

- `Milestone`: a formal planned outcome;
- `Task`: a structured execution unit;
- `Breakdown`: a planning container that decomposes one parent Milestone into ordinary child Milestones.

Do not reintroduce the former rule that Tasks are outside this package. Do not make Breakdown an execution unit or a Milestone subtype.

## Artifact Protocol

Artifact-related work MUST be based on the actual local Artifact Protocol TypeScript project:

`D:\Projects\GitHub\elqora\artifacts\packages\typescript`

Inspect its public exports and protocol/package versions before implementing artifact integration.

Reuse its canonical artifact IDs and records. Do not redefine or duplicate Artifact, ArtifactVersion, ArtifactRequirement, ArtifactLink, ArtifactSubmission, ArtifactVerification, or their IDs inside this package.

`@timeax/milestones` owns structured-execution relationships to artifact requirements and the Milestone/Task-domain consequences of artifact state. Artifact identity, requirement lifecycle, submissions, verification, versions, provenance, and storage remain owned by the Artifact Protocol or host.

A domain Source is an Artifact Link used as informational context. Source, evidence, deliverable, verification, and Artifact Requirement semantics MUST remain distinct as specified by `OVERVIEW.md`.

## Package boundary

This package owns structured-execution internal truth and lifecycle for Milestones and Tasks, and decomposition-plan truth for Breakdowns.

It owns, where applicable:

- Milestone and Task identity;
- Milestone and Task profiles;
- definitions and revisions;
- criteria and deliverable requirements;
- Sources;
- artifact-requirement relationships and evaluation consequences;
- Milestone and Task technical dependencies;
- dependency and scope graph evaluation;
- challenges, reviews, approvals, acceptance, completion, and reopening for execution units;
- Task timing and reminder intent;
- Breakdown parent-Milestone linkage and ordinary child-Milestone membership;
- Breakdown hierarchy validation;
- typed domain events;
- editors;
- semantic DOM/read models;
- deterministic evaluation;
- storage-neutral serialization and migrations.

Keep host concerns outside it, including:

- issues;
- discussions;
- messaging;
- comments;
- notification delivery;
- authorization policy;
- host ownership/visibility policy;
- Project implementation;
- Project Version / release-plan membership;
- planning evolution such as `upgrades` / `extends` / `replaces`;
- databases;
- persistence layout;
- Git;
- GitHub;
- `.pm/`;
- UI;
- provider/network infrastructure;
- artifact storage.

A Task MAY carry an opaque host-owned `projectId` in its scope. A Breakdown MAY carry an opaque owner/actor reference. These facts do not move Project semantics, authorization policy, persistence, visibility, or identity-provider logic into this package.

Technical dependencies remain inside this package because they affect readiness and evaluation.

## Implementation rules

Implement the specification fully rather than creating placeholder interfaces or shallow stubs.

Use:

- strict TypeScript;
- stable opaque IDs;
- readonly public contracts where appropriate;
- discriminated unions;
- deterministic, explicit-input evaluation;
- typed domain errors;
- typed domain events;
- injectable clocks and ID generation;
- composed editors rather than god classes;
- draft-based editor transactions;
- explicit graph and artifact evaluation contexts;
- append-only historical records where required by `OVERVIEW.md`;
- shared execution internals where Milestone and Task semantics genuinely match;
- Milestone-native and Task-native public records instead of unsafe cross-aggregate casts.

Do not introduce hidden I/O or global mutable state.

Editors MUST NOT own persistence, provider calls, authorization policy, notification delivery, Git operations, database access, or artifact storage.

Every committed domain-state mutation MUST emit at least one typed event and advance the mutated aggregate's sequence according to `OVERVIEW.md`.

Milestone and Task historical acceptance/review/approval/challenge/source records MUST use the correct aggregate and revision identity. Do not represent a Task revision as a `MilestoneRevisionId` merely to reuse implementation code.

## Structure

Keep the implementation modular and coherent.

`MilestoneEditor` and `TaskEditor` are execution orchestration facades with focused sub-editors where behavior is shared or specialized.

`BreakdownEditor` is a planning-container editor. It edits Breakdown definition/membership and reuses ordinary `MilestoneEditor` behavior for child Milestones; it MUST NOT grow criteria, deliverables, acceptance, completion, reviews, or approvals of its own.

`MilestoneDocument`, `TaskDocument`, and `BreakdownDocument` are semantic read models. Keep reusable DOM internals shared where appropriate while preserving aggregate-correct public contracts.

Keep `src/index.ts` deliberate and export only intended public API.

Avoid giant files, unnecessary abstraction layers, unsafe type erasure, and needless fragmentation.

## Testing and validation

Inspect the repository before assuming tooling or implementation state.

Implement comprehensive tests for the behavior defined by `OVERVIEW.md`, including full lifecycle, historical reproducibility, editor history/transactions, Task scope/dependency graphs, Breakdown hierarchy, serialization, DOM, and cross-domain scenarios.

Before declaring the work complete:

1. run typecheck;
2. run build;
3. run the full Node test/check pipeline;
4. run the full Bun test/check pipeline;
5. run lint;
6. verify package exports and packed-package imports;
7. verify Artifact Protocol imports against the supported package;
8. verify Milestone wire compatibility;
9. verify Task and Breakdown wire round-trips;
10. check every normative invariant in `OVERVIEW.md` against implementation and tests.

Do not report completion while known typecheck, build, lint, test, package, or runtime failures remain.
