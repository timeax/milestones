# Revision semantics

A revision snapshots the milestone rules and definitions used for evaluation.
Actual changes to the definition, criterion definitions (including required,
weight, and Artifact Protocol requirement references), deliverable definitions,
dependency gates, approval stages, profile, or evaluation policy must create a
revision. Multiple material edits in one editor session coalesce into one new
revision containing the final draft.

`editor.revisions.begin(reason, actor)` may create an explicit administrative
revision even when its initial snapshot is equivalent. Idempotent update calls
that produce no value change do not create a revision, event, change record, ID,
or history entry.

Criterion and deliverable workflow state, challenge/review lifecycles, approval
ledger records, acceptance, completion, and reopening must not themselves create
a revision.

Every material revision clears current acceptance and completion pointers while
retaining append-only acceptance/completion records and execution evidence. The
edit result reports explicit invalidations so a host can react without the SDK
performing I/O.

Criterion definition updates preserve `verified`/`waived` state by default and
may explicitly use `verificationEffect: "invalidate"` to reset it. Deliverable
definition updates likewise preserve `satisfied`/`waived` by default and may use
`satisfactionEffect: "invalidate"`. Invalidation only applies when the
definition actually changes.
