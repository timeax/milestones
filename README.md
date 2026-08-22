# `@timeax/milestones`

A storage-neutral TypeScript domain engine for planning and executing structured work through Milestones, Tasks, and Breakdowns.

The package provides strongly typed aggregates, draft-based editors, deterministic evaluation, dependency and hierarchy validation, append-only lifecycle history, semantic read models, and versioned wire formats. It performs no persistence, networking, authorization policy, notification delivery, Git operations, or artifact storage.

> [`OVERVIEW.md`](./OVERVIEW.md) is the normative specification. If this README and the specification ever differ, the specification is authoritative.

## Domain model

| Concept | Meaning | Lifecycle |
| --- | --- | --- |
| **Milestone** | A formal planned outcome | Criteria, deliverables, dependencies, challenges, reviews, approvals, acceptance, completion, and reopening |
| **Task** | A structured execution unit scoped to a project, Milestone, Breakdown, or parent Task | Profile-driven: lightweight Tasks can complete directly; formal Tasks can require acceptance and the full execution ceremony |
| **Breakdown** | A reusable plan that decomposes one parent Milestone into ordered child Milestones | No execution lifecycle of its own; its children are ordinary Milestones |

These distinctions are intentional:

```text
progress != acceptance != completion

Breakdown child completion != parent Milestone completion

Source != evidence != deliverable != Artifact Requirement != verification
```

## Highlights

- Strict, readonly TypeScript contracts with opaque IDs and discriminated unions.
- Focused `MilestoneEditor`, `TaskEditor`, and `BreakdownEditor` facades backed by shared draft transactions.
- Deterministic evaluation with explicit clocks, ID generators, dependency graphs, and Artifact contexts.
- Typed domain errors, changes, and events with monotonic per-aggregate sequences.
- Revision-bound reviews plus append-only revisions, approval history, acceptances, completions, and challenge evidence.
- Explicit lifecycle invalidation and reopening without deleting historical facts.
- Milestone dependency graphs, mixed Task dependency graphs, Task-scope cycle detection, and Breakdown hierarchy validation.
- Semantic read-only documents for hosts, CLIs, UIs, and AI consumers.
- Stable JSON serialization, validation, and independent migration seams for each aggregate.
- Canonical integration with [`@elqora/artifacts`](https://github.com/elqora/artifacts) for Artifact identity, versions, links, requirements, submissions, and verification.

## Installation

```sh
npm install @timeax/milestones @elqora/artifacts
```

The package is ESM-only and requires Node.js 20 or newer. `@elqora/artifacts` is a peer dependency; the `0.1.x` line supports `@elqora/artifacts >=0.2.0 <0.3.0` and Artifact Protocol `>=1.1 <2.0`.

## Quick start

This complete example creates and directly completes a lightweight Task. Fixed clocks, sequential IDs, and branded-ID helpers are imported from the testing subpath to keep the example reproducible.

```ts
import { TaskEditor, type TaskProfile } from "@timeax/milestones";
import {
  FixedTaskClock,
  SequenceTaskIdGenerator,
  asTaskProfileId,
} from "@timeax/milestones/testing";

const profile: TaskProfile = {
  ref: { id: asTaskProfileId("lightweight-task"), version: 1 },
  criteria: { enabled: false },
  deliverables: { enabled: false },
  dependencies: { enabled: false, participatesInGraph: false },
  revisions: { enabled: true },
  challenges: { enabled: false },
  reviews: { enabled: false, required: false },
  approvals: { enabled: false, required: false },
  completion: {
    enabled: true,
    requiresAcceptance: false,
    closeImmediatelyOnAcceptance: false,
  },
};

const clock = new FixedTaskClock("2026-08-22T12:00:00.000Z");
const ids = new SequenceTaskIdGenerator("readme");

const editor = TaskEditor.create(
  {
    profile,
    scope: { type: "project", projectId: "project-42" },
    definition: {
      key: "TASK-7",
      title: "Publish the release notes",
    },
    timing: {
      dueAt: "2026-08-25T17:00:00.000Z",
      timeZone: "UTC",
    },
    reminders: [
      { trigger: { type: "before_due", duration: "PT2H" } },
    ],
    actor: { id: "user-1", type: "user" },
  },
  { clock, ids },
);

editor.complete({ id: "user-1", type: "user" }, "Release notes published");

const result = editor.commit();

console.log(result.task.currentCompletionId); // defined
console.log(result.task.sequence);            // last incorporated event sequence
console.log(result.events.map((event) => event.type));
// ["task.created", "task.completed"]
```

The deterministic helpers are convenient for examples and fixtures. Production hosts should inject clocks and durable opaque-ID generators appropriate to their environment.

## Working with editors

Editors are the write API. Each editor owns one in-memory draft; its focused sub-editors share the same event buffer, revision state, clock, ID generator, authorization callback, and history boundary.

```ts
const editor = TaskEditor.open(task, profile, {
  clock,
  ids,
  expectedSequence: task.sequence,
});

editor.transact("reschedule", (draft) => {
  draft.definition.update({
    ...draft.task.definition,
    title: "Publish and announce the release notes",
  });
  draft.timing.setDue("2026-08-26T17:00:00.000Z");
});

const { task: updatedTask, events, changes, revision } = editor.commit();
```

Use semantic operations such as `criteria.verify`, `deliverables.satisfy`, `sources.attach`, `challenges.resolve`, `reviews.complete`, `approvals.grant`, `accept`, `complete`, and `reopen`. A failed transaction rolls back all draft, event, change, and revision state created inside it. After `commit()` or `rollback()`, the editor is closed.

`commit()` returns domain state and integration facts; it does not save or publish them:

```ts
interface TaskEditResult {
  readonly task: Task;
  readonly changes: readonly TaskChange[];
  readonly events: readonly TaskEvent[];
  readonly revision?: TaskRevision;
  readonly invalidations?: readonly EvaluationInvalidation[];
  readonly affectedTaskIds?: readonly TaskId[];
}
```

Milestone and Breakdown results follow the same pattern with aggregate-native types.

## Milestones

A Milestone represents a formal outcome. Its current acceptance and completion are determined only by `currentAcceptanceId` and `currentCompletionId`; ledger records remain immutable history after either pointer is invalidated.

Milestone profiles configure enabled capabilities and required ceremony. A typical flow is:

```text
create -> satisfy requirements -> review/approve -> accept -> complete
                                      ^                         |
                                      +--------- reopen --------+
```

Material changes create a revision when revisions are enabled, preserve prior revision history, and clear current acceptance and completion. Administrative reopening can clear completion while preserving acceptance; stronger invalidation clears both.

## Tasks

A Task has one explicit scope:

```ts
type TaskScope =
  | { type: "project"; projectId: string }
  | { type: "milestone"; milestoneId: MilestoneId }
  | { type: "breakdown"; breakdownId: BreakdownId }
  | { type: "task"; taskId: TaskId };
```

Project identity is opaque host-owned data. Task-to-Task scope nesting is supported, while self-scope and scope cycles are rejected.

Task profiles support both lightweight and formal execution:

- `requiresAcceptance: false` permits explicit completion after enabled gates pass and stores the evaluation proof on the completion record.
- `requiresAcceptance: true` requires current formal acceptance before completion.
- `closeImmediatelyOnAcceptance: true` makes acceptance and automatic completion one coherent mutation/history boundary.

Timing and reminders are declarative domain state. The package validates their meaning and can calculate deterministic time-relative reads, but the host schedules and delivers notifications.

## Breakdowns

A Breakdown links one parent Milestone to an ordered collection of ordinary child Milestones:

```text
Parent Milestone
└── Breakdown
    ├── Child Milestone A
    ├── Child Milestone B
    └── Child Milestone C
```

Use `BreakdownEditor` to edit the plan definition and add, remove, replace, or reorder children. Use the ordinary `MilestoneEditor` to edit a child Milestone. Nested decomposition is supported through further Breakdowns, and hierarchy validation rejects ancestry cycles without imposing a depth limit.

Multiple Breakdowns may target the same parent Milestone. A Breakdown never gains criteria, reviews, acceptance, or completion merely because its children have them.

## Deterministic evaluation and graphs

Evaluation is pure and explainable. Callers provide all state that can affect an answer:

- the aggregate and immutable profile version;
- the current Milestone or mixed Task dependency graph;
- the Artifact evaluation context, when Artifact Requirements participate;
- an explicit `asOf` timestamp for time-relative Task reads.

Evaluators report structured reasons such as missing criteria, unsatisfied deliverables or dependencies, blocking challenges, incomplete reviews, pending approvals, and Artifact failures. Unknown graph context remains unknown; it is not silently treated as blocked or satisfied.

Graph services include construction, validation, cycle detection, readiness evaluation, downstream impact analysis, Task-scope validation, and Breakdown hierarchy validation. They never load storage themselves.

## Artifact Protocol integration

`@timeax/milestones` imports the canonical Artifact records and IDs from `@elqora/artifacts`; it does not redefine them. The division of responsibility is:

| `@timeax/milestones` owns | Artifact Protocol or host owns |
| --- | --- |
| Why an Artifact is relevant to a Milestone or Task | Artifact identity and immutable versions |
| Links from criteria/deliverables to Artifact Requirement IDs | Artifact Requirement lifecycle |
| Execution consequences of submission and verification state | Submissions and verification records |
| Version-pinned evaluation and lifecycle snapshots | Provenance, providers, transport, and storage |

A Source is an informational Artifact Link with one of four roles: `reference`, `context`, `specification`, or `decision`. `specification` and `decision` Sources are definition-bearing, version-pinned, and revision-bearing. `reference` and `context` Sources are contextual and do not independently change progress or lifecycle state.

Artifact state is supplied as an explicit immutable `MilestoneArtifactContext` or `TaskArtifactContext`. Historical reviews, acceptances, and completions snapshot the exact Artifact versions, submissions, verifications, requirements, and resolved Sources used in the decision.

See [Artifact Protocol integration](./docs/ARTIFACT_PROTOCOL.md) for the detailed boundary.

## Semantic documents

Editors are for writes; semantic documents are for reads. They expose domain-oriented navigation without forcing a host to traverse raw aggregate or wire objects.

```ts
import {
  createBreakdownDocument,
  createMilestoneDocument,
  createTaskDocument,
} from "@timeax/milestones/dom";

const milestoneDocument = createMilestoneDocument({ milestone, profile });
const taskDocument = createTaskDocument({ task, profile: taskProfile });
const breakdownDocument = createBreakdownDocument({
  breakdown,
  profileResolver,
});
```

Document builders accept graph and Artifact contexts where richer readiness or satisfaction reads require them. The DOM is read-only and never becomes a competing source of truth.

## Serialization and protocol versions

Each aggregate has its own wire protocol and migration path:

| Aggregate | Current protocol |
| --- | --- |
| Milestone | `1.2` |
| Task | `1.0` |
| Breakdown | `1.0` |

```ts
import {
  serializeTaskJson,
} from "@timeax/milestones/serialization";
import { migrateAndDeserializeTask } from "@timeax/milestones/migrations";

const json = serializeTaskJson(task);
const hydrated = migrateAndDeserializeTask(JSON.parse(json) as unknown);
```

Milestone, Task, Breakdown, event, graph, and Artifact-context adapters handle runtime structures such as `ReadonlyMap` explicitly. Breakdown serialization delegates child encoding to the canonical Milestone serializer. Runtime aggregates are domain values, not a prescribed database schema.

## Host integration

A typical host operation is:

```text
load aggregate + profile + explicit contexts
                    |
                    v
          open editor with expectedSequence
                    |
                    v
          perform semantic operations
                    |
                    v
       commit -> aggregate + events + changes
                    |
                    v
  host compare-and-set + persistence + outbox
```

The host owns persistence, transactions, authorization and visibility policy, Project semantics, identity resolution, notifications, repositories, Git/GitHub, providers, and UI. It may use `expectedSequence` for optimistic concurrency and persist the aggregate, append returned events, and enqueue integration work in one host transaction.

See the compiled [`examples/host-integration.ts`](./examples/host-integration.ts) and [host integration guide](./docs/HOST_INTEGRATION.md).

## Package exports

| Import | Purpose |
| --- | --- |
| `@timeax/milestones` | Editors, domain types, services, runtime infrastructure, serializers, migrations, and DOM factories |
| `@timeax/milestones/model` | Domain/protocol types, editor option contracts, and typed errors |
| `@timeax/milestones/evaluation` | Deterministic progress, lifecycle, dependency, and Artifact evaluation |
| `@timeax/milestones/graph` | Milestone/Task dependency graphs, Task scope graphs, and Breakdown hierarchy |
| `@timeax/milestones/serialization` | Supported wire and JSON adapters |
| `@timeax/milestones/validation` | Aggregate, profile, graph, scope, and hierarchy validation |
| `@timeax/milestones/migrations` | Independent protocol migration routers |
| `@timeax/milestones/dom` | Semantic document contracts, builders, and factories |
| `@timeax/milestones/testing` | Fixed clocks, sequential ID generators, and branded-ID helpers for tests and examples |

Only paths in the package export map are public. Files below `dist/` are implementation details unless exported there.

## Documentation

- [Normative domain specification](./OVERVIEW.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Lifecycle examples](./docs/LIFECYCLE_EXAMPLES.md)
- [Transitions](./docs/TRANSITIONS.md)
- [Revision semantics](./docs/REVISION_SEMANTICS.md)
- [Reopening and invalidation](./docs/REOPENING.md)
- [Dependency graphs](./docs/GRAPH.md)
- [Events and sequences](./docs/EVENTS.md)
- [Editor history and transactions](./docs/EDITOR_HISTORY.md)
- [Concurrency](./docs/CONCURRENCY.md)
- [Authorization boundary](./docs/AUTHORIZATION.md)
- [Actor identity](./docs/ACTOR_IDENTITY.md)
- [Serialization](./docs/SERIALIZATION.md)
- [Migrations](./docs/MIGRATIONS.md)
- [API stability](./docs/API_STABILITY.md)
- [Invariant audit](./docs/INVARIANT_AUDIT.md)

## Development

Install exact dependencies:

```sh
npm ci
```

Run the complete Node.js validation pipeline:

```sh
npm run check:node
```

Run the complete Bun pipeline (CI uses Bun 1.3.14):

```sh
npm run check:bun
```

Useful individual commands:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Strict TypeScript checking |
| `npm run build` | Clean and compile `dist/` |
| `npm run lint` | ESLint with zero warnings allowed |
| `npm test` | Full Vitest suite with coverage |
| `npm run check:examples` | Build and typecheck consumer examples |
| `npm run check:exports` | Verify the deliberate public API |
| `npm run check:artifact` | Verify Artifact package/protocol compatibility |
| `npm run check:package` | Pack and import the package as a consumer |

## License

Released into the public domain under [The Unlicense](./LICENSE).
