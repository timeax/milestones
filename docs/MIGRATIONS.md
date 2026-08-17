# Protocol migration strategy

The npm package version, `MILESTONE_PROTOCOL_VERSION`, Artifact Protocol
version, and each milestone's domain revision number are independent values.

Hydration of long-lived data follows this pipeline:

```text
unknown serialized record
→ inspect schemaVersion
→ apply registered sequential migrations
→ validate current wire shape and domain invariants
→ hydrate current Milestone
```

`migrateMilestoneWire` accepts legacy protocol 1.0 and applies the registered
`1.0-to-1.1` transform, adding `evidence: []` to every challenge while preserving
all stable IDs, revisions, ledgers, events, and lifecycle pointers. Current 1.1
wires normalize without a migration. Older or future version values fail with
`MIGRATION_UNSUPPORTED`; hosts must not strip/change the version and hope that
current validation is sufficient.

When a later protocol is specified, its transform will be added under
`src/migrations/`, registered in order, and tested against all committed v1
fixtures. A migration must preserve stable IDs, revisions, actors, ledger facts,
and exact evidence unless the new normative protocol explicitly says otherwise.
