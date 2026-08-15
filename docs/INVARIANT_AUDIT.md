# Normative invariant audit

All 32 invariants in `OVERVIEW.md` are implemented. This checklist identifies
the primary enforcement point and test area.

| # | Enforcement | Primary tests |
|---:|---|---|
| 1 | Branded stable IDs; editors never mutate IDs | lifecycle, graph |
| 2 | Revisions and all ledgers use append-only array operations | lifecycle, governance |
| 3 | `deriveMilestoneState` reads only current pointers | lifecycle |
| 4 | aggregate validation and completion evaluation | lifecycle, serialization |
| 5 | material revision creation clears both pointers only | lifecycle |
| 6 | discriminated `ReopenEffect` and `applyReopen` | lifecycle |
| 7 | challenge resolution outcome explicitly selects reopening | governance |
| 8 | review/approval records carry current revision ID | governance |
| 9 | separate requested/assigned/completed actor fields | governance |
| 10 | effective approvals deduplicate actor type+ID | governance |
| 11 | all artifact records/IDs imported from `@elqora/artifacts` | artifacts, typecheck |
| 12 | child requirement-ID relationship plus milestone evaluator | artifacts |
| 13 | aggregate children store only ArtifactRequirement IDs | artifacts |
| 14 | verification is matched to the evaluated version | artifacts |
| 15 | immutable review records and acceptance artifact snapshots pin versions | artifacts |
| 16 | acceptance artifact snapshots record all canonical references | artifacts |
| 17 | explicit context uses canonical link/submission/version/verification records | artifacts |
| 18 | graph validator and dependency editor reject self/cycles | graph |
| 19 | all graph services require `MilestoneGraphSnapshot` | graph |
| 20 | artifact evaluator requires explicit context | artifacts |
| 21 | progress and lifecycle state are separate services | lifecycle |
| 22 | profile ref and evaluation policy are revision-snapshotted | lifecycle |
| 23 | actors are attribution only; no authorization logic exists | boundary tests |
| 24 | no host planning/task/issue/discussion types | export audit |
| 25 | editors contain no persistence/transport/provider calls | boundary tests, source audit |
| 26 | lifecycle booleans are derived projections | lifecycle |
| 27 | emit increments draft sequence; validation checks sequence | lifecycle |
| 28 | every semantic mutation calls typed emit; material policy edits emit revision | all editor tests |
| 29 | update preserves ID; explicit replace allocates ID | lifecycle, graph |
| 30 | reopening never removes historical records | lifecycle, governance |
| 31 | context contains artifact records but no storage concerns | artifacts, source audit |
| 32 | exported package/protocol compatibility constants and peer range | artifacts, exports |
