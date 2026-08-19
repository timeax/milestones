# Artifact Protocol compatibility and evidence

This package consumes canonical records from `@elqora/artifacts` and declares
package compatibility `>=0.2.0 <0.3.0` with Artifact Protocol compatibility
`>=1.1 <2.0`. Development and compatibility checks use the local
`@elqora/artifacts` 0.2.0 TypeScript project; packed consumer checks install the
published npm package.

Milestones own only Source and requirement references, milestone-specific link roles and
subjects, explicit evaluation context, acceptance evidence snapshots, and the
milestone lifecycle consequence of invalidation. Artifact identity, versions,
submissions, verification, provenance, providers, storage, and persistence stay
owned by Artifact Protocol and the host.

An editor clones its supplied artifact context at construction. Incomplete
context fails closed with deterministic reason codes. Evidence must include a
submission and version-consistent verification. A pinned link evaluates its
exact immutable `artifactVersionId`; an unpinned link follows the logical
artifact's `currentVersionId`, so an old submission becomes stale after the
logical artifact advances.

Acceptance snapshots retain exact requirement, artifact, version, submission,
and verification IDs. They never follow later versions. Because the SDK has no
artifact store or event subscription, a host that detects later invalidation
reopens with cause `{ type: "artifact_invalidation", ref }`; the SDK clears
current pointers and preserves the historical acceptance/completion facts.

Sources use the same Artifact Link contract with bounded milestone roles
`reference`, `context`, `specification`, and `decision`. Specification and decision
links pin an Artifact Version; source relationships are context and never become
evidence, deliverables, requirements, or acceptance gates by implication.
