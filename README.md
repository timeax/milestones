# Milestones & Structured Execution Domain

A storage-neutral TypeScript domain engine for structured execution, definition, revision,
evaluation, acceptance, completion, reopening, and auditing across three core domain aggregates:

1. **Milestone**: Formal planned outcome with rigorous acceptance/completion ledgers and full backward compatibility.
2. **Task**: Structured execution unit with flexible scoping (project, milestone, breakdown, parent task), timing, reminders, and mixed cross-entity dependencies.
3. **Breakdown**: Planning container aggregate decomposing a parent milestone into child milestones without conflating child completion with parent completion.

It integrates with the canonical `@elqora/artifacts` protocol through explicit immutable contexts.

The normative behavior is specified in `OVERVIEW.md`.

## Quick Start

### Milestone (Planned Outcome)

```ts
import {
  FixedMilestoneClock,
  MilestoneEditor,
  SequenceMilestoneIdGenerator,
} from "@timeax/milestones";

const ids = new SequenceMilestoneIdGenerator("demo");
const clock = new FixedMilestoneClock("2026-08-15T00:00:00.000Z");
const created = MilestoneEditor.create(
  {
    profile,
    definition: { title: "Release candidate" },
    criteria: [{ title: "Tests pass", required: true, state: "submitted" }],
  },
  { ids, clock },
);

const editor = new MilestoneEditor(created.milestone, profile, { ids, clock });
editor.criteria.verify(created.milestone.criteria[0]!.id, { id: "reviewer", type: "user" });
const result = editor.commit();
```

### Task (Execution Unit)

```ts
import {
  FixedTaskClock,
  SequenceTaskIdGenerator,
  TaskEditor,
} from "@timeax/milestones";

const ids = new SequenceTaskIdGenerator("task-demo");
const clock = new FixedTaskClock("2026-08-20T12:00:00.000Z");

const taskEditor = TaskEditor.create(
  {
    profile: taskProfile,
    scope: { type: "milestone", milestoneId: "ms-1" as any },
    definition: { title: "Implement feature" },
    timing: {
      startsAt: "2026-08-20T12:00:00.000Z",
      dueAt: "2026-08-25T12:00:00.000Z",
      timeZone: "UTC",
    },
    reminders: [
      { trigger: { type: "before_due", durationMinutes: 120 } },
    ],
  },
  { ids, clock },
);

taskEditor.start();
taskEditor.complete();
const taskResult = taskEditor.commit();
```

### Breakdown (Milestone Plan Container)

```ts
import {
  BreakdownEditor,
  FixedBreakdownClock,
  SequenceBreakdownIdGenerator,
} from "@timeax/milestones";

const ids = new SequenceBreakdownIdGenerator("bd-demo");
const clock = new FixedBreakdownClock("2026-08-20T12:00:00.000Z");

const breakdownEditor = BreakdownEditor.create(
  {
    parentMilestoneId: "parent-ms-1" as any,
    definition: { title: "Phase 1 Decomposition" },
    milestones: [childMilestone1, childMilestone2],
  },
  { ids, clock },
);

const breakdownResult = breakdownEditor.commit();
```

The package performs no persistence, network, authorization, notification,
provider, Git, or artifact-storage operations.

## Guides

- [Architecture](./docs/ARCHITECTURE.md)
- [Host and Project Manager-style integration](./docs/HOST_INTEGRATION.md)
- [Lifecycle examples](./docs/LIFECYCLE_EXAMPLES.md)
- [API stability and subpaths](./docs/API_STABILITY.md)
- [Stabilization and contract freeze](./docs/STABILITY.md)
- [Artifact Protocol integration](./docs/ARTIFACT_PROTOCOL.md)
- [Serialization and migrations](./docs/SERIALIZATION.md)

## Runtime support

- Node.js 20 or newer is the supported release runtime.
- The published ESM contains no Node-specific runtime imports and is designed
  to work in modern ESM runtimes and browsers that provide `structuredClone`.
- Bun 1.3.x is a tested first-class runtime. CI runs typecheck, build, the full
  Vitest suite, lifecycle serialization smoke, and packed-package import under
  Bun 1.3.14.

## Compatibility

`@timeax/milestones` 0.1.x supports `@elqora/artifacts >=0.2.0 <0.3.0`
and Artifact Protocol `>=1.1 <2.0`. Challenge evidence is append-only audit
material with canonical, version-pinned Artifact Links; it is not an acceptance gate.

## License

Released under the [Unlicense](./LICENSE).
