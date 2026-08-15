# Reopening and invalidation

Reopening changes only current lifecycle pointers. Acceptance and completion
records are append-only historical facts and are never edited or deleted.

- `invalidate_completion` clears only `currentCompletionId` and retains current
  acceptance. It is appropriate for ordinary administrative reopening and may
  be selected by a host request.
- `invalidate_acceptance_and_completion` clears both pointers. It is required
  for revision, challenge, approval-revocation, dependency, and artifact causes,
  because those causes invalidate the truth that justified acceptance.

Material revisions perform the second effect directly and report acceptance and
completion invalidations alongside the revision event. Resolving a challenge
with an invalidating outcome and revoking an effective required approval reopen
automatically. Dependency and artifact state are explicit external contexts, so
their owners detect the change and call `reopen` with the corresponding typed
cause. Administrative and `host_requested` causes may use either effect.

Every explicit reopening emits `milestone.reopened`, advances aggregate
sequence, and reports one invalidation per pointer actually cleared. Once gates
are satisfied again, new acceptance and completion records append after the old
records.
