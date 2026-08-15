# Editor history

`MilestoneEditor.history` is an in-memory editing-session facility. It is not
milestone revision history, event history, or persisted milestone state.

Each history point captures the complete mutable session state:

- draft milestone and sequence;
- active profile;
- pending changes and typed events;
- pending invalidations;
- pending material revision marker.

Undo and redo restore that complete checkpoint. They emit no domain events and
create no milestone revisions. Redo restores the original IDs, timestamps,
event ordering, and sequence values from its checkpoint.

```ts
editor.history.canUndo;
editor.history.canRedo;
editor.history.undo();
editor.history.redo();
editor.history.clear();
```

History is linear. A mutation made after undo discards the abandoned redo
branch. The initial editor state is always the first history point.

The default retained undo depth is 100 and the maximum is 1,000. The configured
`historyLimit` counts undo steps; the current point is retained in addition to
that limit. A limit of zero disables undo retention while preserving the active
state.

Use `editor.transact(label, callback)` to group related operations into one
undo step. Nested transactions collapse into the outer transaction. A failed
transaction restores its complete starting checkpoint and records no history
point. History navigation and commit/rollback are rejected while a transaction
is active.

Commit and rollback close the editor. Undo, redo, and clear then raise the
existing `EDITOR_CLOSED` domain error. Open a new editor to change a committed
milestone.
