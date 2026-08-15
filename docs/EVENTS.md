# Event and audit contract

`MilestoneEditResult.events` is a typed, deterministic, milestone-local audit
and integration stream. Sequence starts at one for `milestone.created`; every
emitted event increments the aggregate sequence exactly once, and the committed
`milestone.sequence` equals the last incorporated event sequence.

`expectedSequence` protects the editor's loaded aggregate. `correlationId` is an
opaque host value copied to every event in a session so related work can be
grouped. `causationId` optionally identifies the host/domain event that caused
the session and is likewise copied unchanged. The SDK does not generate tracing
hierarchies or interpret either value.

Actors and payloads are cloned when emitted, and edit results are cloned at
commit. Later draft mutations, undo/redo, or caller mutation cannot rewrite an
earlier event. Failed atomic operations contribute no event or sequence change;
events from undone operations are absent from commit.

Events are suitable for audit rows, outbox messages, projections, notifications,
and downstream recalculation performed by a host. They are not claimed as a
complete event-sourcing log: hosts must persist milestone snapshots/wire records,
and this package provides no event replay engine capable of reconstructing every
aggregate version from events alone.
