# @elqora/milestones

A storage-neutral TypeScript domain engine for milestone definition, revision,
evaluation, acceptance, completion, reopening, and auditing. It integrates with
the canonical `@elqora/artifacts` protocol through explicit immutable contexts.

The normative behavior is specified in `OVERVIEW.md`.

```ts
import {
  FixedMilestoneClock,
  MilestoneEditor,
  SequenceMilestoneIdGenerator,
} from "@elqora/milestones";

const ids = new SequenceMilestoneIdGenerator("demo");
const clock = new FixedMilestoneClock("2026-08-15T00:00:00.000Z");
const created = MilestoneEditor.create(
  { profile, definition: { title: "Release candidate" } },
  { ids, clock },
);

const editor = new MilestoneEditor(created.milestone, profile, { ids, clock });
editor.criteria.verify(created.milestone.criteria[0]!.id, { id: "reviewer" });
const result = editor.commit();
```

The package performs no persistence, network, authorization, notification,
provider, Git, or artifact-storage operations.
