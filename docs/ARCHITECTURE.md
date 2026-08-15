# Architecture

## Package layout

```text
src/
├── index.ts                         deliberate public export surface
├── model/
│   ├── domain.ts                    IDs, aggregates, snapshots, ledgers, events, wire contracts
│   ├── errors.ts                    typed domain and validation errors
│   └── protocol.ts                  Artifact package/protocol compatibility and re-exports
├── services/
│   ├── evaluation.ts                progress, artifacts, approvals, acceptance, completion
│   ├── graph.ts                     graph validation, gates, cycles, unlocking, impact
│   └── validation.ts                aggregate, profile, revision, and lifecycle invariants
├── editors/
│   └── milestone-editor.ts          shared draft session, facade, and focused sub-editors
├── adapters/
│   └── serialization.ts             aggregate/event/context/Map wire adapters
└── runtime/
    └── infrastructure.ts            injectable clocks, deterministic IDs, ID coercion helpers
```

Tests are grouped by lifecycle, governance, Artifact Protocol integration,
dependency graph, and serialization/validation behavior.

## Editor transaction model

One `MilestoneEditor` owns a private cloned draft and one edit context. Its
`DefinitionEditor`, `CriteriaEditor`, `DeliverableEditor`, `DependencyEditor`,
`ChallengeEditor`, `ReviewEditor`, `ApprovalEditor`, and `RevisionEditor` all
operate on that same context.

Operational changes update the current materialized view. The first material
change in a session creates a new revision, clears current lifecycle pointers,
and records invalidations. Commit finalizes the revision snapshot, validates the
aggregate and supplied graph, and returns state, changes, events, invalidations,
and downstream impact without performing I/O.

## Artifact Protocol binding

- npm package compatibility: `@elqora/artifacts >=0.1.0 <0.2.0`
- protocol compatibility: `>=1.0 <2.0`
- binding validated locally: package `0.1.0`, protocol `1.0`

Milestones only retain Artifact Protocol IDs and consume canonical Artifact,
ArtifactVersion, ArtifactRequirement, ArtifactLink, ArtifactSubmission, and
ArtifactVerification records through an explicit immutable context.

An Artifact Protocol link identifies a milestone subject but has no dedicated
`artifactRequirementId` field. Evaluation therefore matches subject links to
requirements using canonical artifact kind/value constraints. A host may remove
ambiguity for subjects with overlapping requirements by setting the link's
protocol-supported metadata key `artifactRequirementId`. This is association
metadata on the canonical link, not a parallel artifact or submission ledger.
