# Technical dependency graph

Graph APIs consume an explicit immutable `MilestoneGraphSnapshot`; they never
load milestones or perform host I/O. Supported gates are current upstream
acceptance, completion, verified criterion state, and satisfied deliverable
state.

`evaluateGraph` validates the graph and returns dependency results plus sorted
blocked, unblocked, and runnable milestone IDs. A milestone is blocked only by
an unsatisfied dependency whose `blocking` flag is true. Runnable milestones are
unblocked and not already completed; accepted-but-not-completed milestones stay
runnable so a scheduler can perform completion work.

`affectedMilestoneIds` returns the unique transitive downstream set for an
invalidation. `downstreamImpact` provides the same topology calculation without
implying the cause. All returned ID lists and dependency evaluations use stable
lexicographic ordering.

Graph validation rejects missing nodes, missing criterion/deliverable gate
targets, self-dependencies, semantic duplicates, and cycles. Hosts must rebuild
graph nodes from current aggregate pointers after acceptance, completion,
revision, or reopening; a cleared upstream pointer then deterministically makes
the corresponding gate unsatisfied.
