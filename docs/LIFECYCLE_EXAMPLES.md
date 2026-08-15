# Lifecycle examples

## Simple milestone

Create with `MilestoneEditor.create`, move a submitted criterion through
`criteria.verify`, confirm `evaluateAcceptance`, then `accept` and `complete`.
Use injected IDs and clock in every environment.

## Reviewed milestone

Use a profile whose reviews are enabled/required. Call `reviews.request`,
optionally `start`, then `complete(reviewId, "accepted", { completedBy })` for the
current revision. Acceptance snapshots the review and exact artifact version IDs.

## Approved milestone

Define stable approval stages and counts. Append grants with `approvals.grant`.
Distinct effective `(actor.type, actor.id)` pairs count; rejection and revocation
do not. `authorityRef` is an opaque selector passed to host authorization.

## Dependency-gated milestone

Build an immutable graph context from current upstream aggregates. Accepted,
completed, verified-criterion, and satisfied-deliverable gates are supported.
Use `evaluateGraph` for blocked/runnable scheduling and `affectedMilestoneIds`
after an upstream invalidation.

## Artifact-backed milestone

Reference canonical Artifact Protocol requirement IDs from criteria/deliverables,
and pass a context containing requirements, artifacts, exact versions,
submissions, verifications, and milestone links. Acceptance pins the exact facts.

## Revision after acceptance

A real definition/rule change creates one session revision, clears both current
pointers, reports invalidations, and preserves historical acceptance/completion.
Criterion and deliverable definition edits explicitly choose whether prior
verification/satisfaction is preserved or invalidated.

## Reopen after invalidation

Administrative reopening may clear completion only. Revision, challenge,
approval-revocation, dependency, and artifact invalidation clear acceptance and
completion. Once gates are satisfied, accepting/completing again appends new
records; old facts remain unchanged.

Executable combinations of all these flows live in
[`test/end-to-end.test.ts`](../test/end-to-end.test.ts) and the compiled consumer
example.
