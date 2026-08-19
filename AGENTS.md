# Agent Instructions

## Source of truth

`OVERVIEW.md` is the normative specification for `@timeax/milestones`.

Before implementing or changing milestone behavior, read `OVERVIEW.md` in full and treat its MUST / MUST NOT / SHOULD / MAY rules and invariants as authoritative.

Do not silently redesign the domain. If implementation exposes a genuine contradiction or ambiguity in `OVERVIEW.md`, report it explicitly and continue with unaffected work.

## Artifact Protocol

Artifact-related work MUST be based on the actual local Artifact Protocol TypeScript project:

`D:\Projects\GitHub\elqora\artifacts\packages\typescript`

Inspect its public exports and protocol/package versions before implementing artifact integration.

Reuse its canonical artifact IDs and records. Do not redefine or duplicate Artifact, ArtifactVersion, ArtifactRequirement, ArtifactLink, ArtifactSubmission, ArtifactVerification, or their IDs inside this package.

`@timeax/milestones` owns milestone relationships to artifact requirements and the milestone-domain consequences of artifact state. Artifact identity, requirement lifecycle, submissions, verification, versions, and provenance remain owned by the Artifact Protocol.

## Package boundary

This package owns milestone internal truth and lifecycle.

Keep host concerns outside it, including:

- tasks;
- issues;
- discussions;
- messaging;
- notifications;
- authorization;
- ownership;
- visibility;
- projects;
- version/release-plan membership;
- `upgrades` / `extends` / `replaces`;
- databases;
- Git;
- GitHub;
- `.pm/`;
- UI;
- provider/network infrastructure.

Technical milestone dependencies remain inside this package because they affect milestone readiness and evaluation.

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
- injectable clock and ID generation;
- composed editors rather than god classes;
- draft-based editor transactions;
- explicit graph and artifact evaluation contexts;
- append-only historical records where required by `OVERVIEW.md`.

Do not introduce hidden I/O or global mutable state.

Editors MUST NOT own persistence, provider calls, authorization, notifications, Git operations, database access, or artifact storage.

Every committed domain-state mutation MUST emit a typed event and advance the aggregate sequence according to `OVERVIEW.md`.

## Structure

Keep the implementation modular and coherent.

`MilestoneEditor` is an orchestration facade. Complex milestone subdomains should use focused sub-editors where appropriate.

Keep `src/index.ts` deliberate and export only intended public API.

Avoid giant files, unnecessary abstraction layers, and needless fragmentation.

## Testing and validation

The repository may begin bare. Inspect it before assuming tooling exists.

Create the TypeScript package, build, test, and lint setup needed for a production-quality reusable NPM package, without adding application frameworks or unrelated dependencies.

Implement comprehensive tests for the behavior defined by `OVERVIEW.md`, including full lifecycle and cross-domain scenarios.

Before declaring the work complete:

1. run typecheck;
2. run build;
3. run the full test suite;
4. run lint if configured;
5. verify package exports;
6. verify Artifact Protocol imports against the local package;
7. check every normative invariant in `OVERVIEW.md` against implementation and tests.

Do not report completion while known typecheck, build, or test failures remain.