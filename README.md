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
  {
    profile,
    definition: { title: "Release candidate" },
    criteria: [{ title: "Tests pass", required: true, state: "submitted" }],
  },
  { ids, clock },
);

const editor = new MilestoneEditor(created.milestone, profile, { ids, clock });
editor.criteria.verify(created.milestone.criteria[0]!.id, { id: "reviewer" });
const result = editor.commit();
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

`@elqora/milestones` 0.1.x supports `@elqora/artifacts >=0.2.0 <0.3.0`
and Artifact Protocol `>=1.1 <2.0`. Challenge evidence is append-only audit
material with canonical, version-pinned Artifact Links; it is not an acceptance gate.

## License

Released under the [Unlicense](./LICENSE).
