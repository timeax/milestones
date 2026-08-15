# Optimistic concurrency

`milestone.sequence` is the aggregate-local sequence of the last incorporated
domain event. Open an editor with the sequence observed when the aggregate was
loaded:

```ts
const editor = new MilestoneEditor(milestone, profile, {
  clock,
  ids,
  expectedSequence: milestone.sequence,
});
```

The SDK rejects a mismatch before creating a draft or emitting an event, and
rechecks the loaded original at commit. A successful result advances sequence
once per returned event.

The SDK cannot observe a database or another process. A persistence host must
perform compare-and-set in the same transaction that writes the result, using
the loaded/expected sequence:

```text
UPDATE milestone
SET snapshot = result, sequence = result.sequence
WHERE id = milestone.id AND sequence = expectedSequence
```

Zero affected rows is a host concurrency conflict; the host should reload and
choose whether to retry, merge, or present a conflict. The editor performs no
database access, retries, locks, outbox writes, or conflict persistence.
