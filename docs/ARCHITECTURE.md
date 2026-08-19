# Architecture

`@timeax/milestones` is a storage-neutral aggregate/domain engine.

```text
explicit Milestone + profile + graph/artifact contexts
                        ↓
       one draft-based MilestoneEditor session
 definition / sources / criteria / deliverables / dependencies
 challenges / reviews / approvals / revisions / history
                        ↓
 deterministic evaluation + aggregate validation
                        ↓
 MilestoneEditResult { milestone, changes, events, invalidations }
```

The `Milestone` aggregate owns current definition/execution state plus append-only
revision, approval, acceptance, and completion truth. Current acceptance and
completion derive only from their pointers.

An editor session clones the aggregate and explicit graph/artifact contexts.
Focused sub-editors share that one draft, event buffer, sequence, revision,
invalidations, clock, IDs, authorization callback, and history. `commit` validates
and returns immutable-by-contract cloned values; `rollback` closes without output.

Evaluation services are pure and consume only arguments. Graph services operate
on `MilestoneGraphSnapshot`, not persistence. Artifact evaluation and source
resolution use canonical `@elqora/artifacts` records. Sources are canonical
ArtifactLink relationships, not embedded Artifact aggregates. Events are typed audit/integration output, not a
claim that the aggregate is fully event-sourced. Serialization and migration
adapters provide the protocol boundary.

The SDK owns no repositories, transactions, databases, Git/GitHub, provider
calls, networking, UI, projects/releases, tasks, authorization policy, identity
resolution, or notifications.
