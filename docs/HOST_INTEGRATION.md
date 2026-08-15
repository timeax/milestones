# Host integration guide

A Project Manager-style host owns persistence, projects/releases, visibility,
authorization policy, identity resolution, graph layout, `.pm/` paths, SQLite
projection, outbox delivery, Git/GitHub sync, portal publishing, notifications,
artifact storage/providers, UI, and conflict records.

The normal operation is:

```text
1. Load serialized milestone and its profile.
2. Migrate, validate, and deserialize the milestone.
3. Construct current graph and Artifact Protocol contexts.
4. Authorize at the host boundary or inject a host authorization callback.
5. Open MilestoneEditor with expectedSequence.
6. Perform one or more semantic operations and commit.
7. In one host transaction, compare-and-set expectedSequence, persist the
   canonical milestone, append returned events, and create an outbox mutation.
8. Publish/sync/notify after the host transaction, never from the editor.
```

The compiled example at [`examples/host-integration.ts`](../examples/host-integration.ts)
shows these ports without introducing a persistence implementation into the SDK.
If compare-and-set affects no row, discard the result, reload current state, and
let the host decide whether to retry, merge, or surface a conflict.

Events may update projections and outboxes, but snapshots remain the persistence
source because events are audit/integration records rather than a complete replay
log. Graph and artifact contexts should be rebuilt from their owning sources for
each operation; the editor snapshots them for that session.
