# Public API and stability

`@elqora/milestones` exposes a deliberately small root API plus focused subpath
exports. Files below `dist/` that are not listed in the package export map are
implementation details and cannot be imported through the package name.

## Stable contracts

The following contracts follow semantic-versioning compatibility rules:

- branded milestone-domain identifiers and readonly domain records;
- milestone profiles, lifecycle records, typed events, and typed errors;
- `MilestoneEditor`, `MilestoneEditorOptions`, and the focused sub-editors
  obtained from an editor instance;
- deterministic evaluation, dependency-graph, validation, and serialization
  entry points;
- Artifact Protocol compatibility constants and canonical Artifact Protocol
  types re-exported from `@elqora/artifacts`;
- clock, identifier, and branded-ID runtime utilities.

Serialized milestone, event, graph, and artifact-context shapes are wire
contracts. Changes to those shapes require an explicit compatible evolution or
a major release. Runtime aggregate objects are domain values, not a database or
persistence schema.

## Experimental contracts

Editor history and transaction grouping are available in `0.x`, but remain
experimental until `1.0`. Their documented atomicity, no-event behavior, and
bounded-history guarantees are supported; convenience method names and history
inspection detail may evolve in a documented minor release before `1.0`.

## Testing-only contracts

`@elqora/milestones/testing` contains deterministic clocks, sequential ID
generators, and branded-ID helpers intended for test fixtures. Production code
should inject its own `MilestoneClock` and `MilestoneIdGenerator` where suitable.

## Internal contracts

Draft/session state, editor factories, event buffering, revision helpers,
invariants, and low-level lookup/evaluation helpers are internal. They are not
exported through the package export map and may change without notice.

## Subpath exports

- `@elqora/milestones` — normal SDK usage and editor facade
- `@elqora/milestones/model` — domain types, protocol types, and errors
- `@elqora/milestones/evaluation` — deterministic lifecycle evaluation
- `@elqora/milestones/graph` — dependency graph construction and analysis
- `@elqora/milestones/serialization` — supported wire serializers
- `@elqora/milestones/validation` — aggregate/profile/revision validation
- `@elqora/milestones/testing` — deterministic test utilities
- `@elqora/milestones/migrations` — protocol-version routing and migration

Sub-editors are created by `MilestoneEditor`; their constructors are not a
supported construction API.
