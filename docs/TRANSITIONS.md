# Domain state transitions

Editors enforce the following state machines. Definition edits may explicitly
invalidate verified/satisfied state as part of a material revision; that is a
revision rule, not a normal workflow transition.

## Criteria

- `not_started` → `in_progress`, `waived`
- `in_progress` → `not_started`, `submitted`, `failed`, `waived`
- `submitted` → `not_started`, `verified`, `failed`, `waived`
- `verified` → `not_started`
- `failed` → `not_started`, `in_progress`, `waived`
- `waived` → `not_started`

Verification therefore requires submission. A verified or waived criterion must
be reset before work resumes.

## Deliverables

- `missing` → `submitted`, `waived`
- `submitted` → `missing`, `satisfied`, `rejected`, `waived`
- `satisfied` → `missing`
- `rejected` → `missing`, `submitted`, `waived`
- `waived` → `missing`

Satisfaction requires submission. Satisfied or waived deliverables must be reset
before another submission.

## Challenges

- `open` → `under_review`, `resolved`, `rejected`, `withdrawn`
- `under_review` → `resolved`, `rejected`, `withdrawn`
- `resolved`, `rejected`, or `withdrawn` → `reopened`
- `reopened` → `under_review`, `resolved`, `rejected`, `withdrawn`

## Reviews

- `requested` → `in_progress`, `completed`, `cancelled`
- `in_progress` → `completed`, `cancelled`
- `completed` and `cancelled` are terminal

Approval records and lifecycle ledgers are append-only. A revocation must point
to an effective grant owned by the same milestone, current revision, and a stage
in the current policy. Completion requires a current acceptance record for the
same revision.
