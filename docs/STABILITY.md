# Stabilization and contract freeze

The `0.1.x` line implements Milestone Protocol `1.0` while retaining a `0.x`
package version for integration feedback. The following public contracts are
frozen by the protocol version and package semantic-versioning policy:

| Contract | Stability mechanism |
|---|---|
| branded IDs and `ActorRef` | readonly public types; actor type and ID remain opaque |
| aggregate, profile, revision, and ledger records | readonly discriminated domain records plus aggregate validation |
| criterion and deliverable states | centralized transition matrices and typed transition errors |
| dependencies and gates | explicit graph snapshots, deterministic graph evaluation, and DAG validation |
| challenges, reviews, and approvals | append-only audit records, revision binding, and centralized transitions |
| acceptance, completion, and reopening | deterministic evaluations, append-only ledgers, and explicit invalidation effects |
| events and concurrency | typed event union, per-aggregate sequence, correlation/causation metadata, and host CAS guidance |
| reason codes | discriminated evaluation result contracts |
| serialization | `MILESTONE_PROTOCOL_VERSION = "1.0"`, canonical JSON, committed compatibility fixtures, and migration routing |
| Artifact Protocol integration | peer range `@elqora/artifacts >=0.1.0 <0.2.0` and protocol range `>=1.0 <2.0` |
| package API | curated root and documented subpath export map with exact export snapshots |

Any incompatible change to a protocol-owned wire shape requires a new
Milestone Protocol version. Any incompatible change to a stable TypeScript API
requires the corresponding semantic-versioning change. The migration entry
point rejects unsupported future versions rather than guessing.

Editor history and transaction convenience APIs remain the only explicitly
experimental `0.x` surface. Their atomicity, bounded-history, and no-event
behavior are supported, while convenience naming may be refined before package
`1.0.0` as documented in [API stability](./API_STABILITY.md).

The SDK does not freeze a database schema, persistence adapter, host project
model, authorization policy, UI contract, provider API, or `.pm/` layout.
Those remain host concerns.

## Release gate

The release gate is `npm run check:node` followed by `npm run check:bun`. It
covers typecheck, clean build, lint, the full coverage suite, documentation and
host-integration example compilation, exact API exports, Artifact Protocol
compatibility, packed-tarball installation/import, and Bun execution.
