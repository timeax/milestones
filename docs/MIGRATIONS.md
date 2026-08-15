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

`migrateMilestoneWire` currently accepts protocol 1.0, validates it, and returns
a normalized current wire with no applied migrations. There is no protocol v2,
so no synthetic transform is provided. Older or future version values fail with
`MIGRATION_UNSUPPORTED`; hosts must not strip/change the version and hope that
current validation is sufficient.

When v2 is specified, its `v1-to-v2` transform will be added under
`src/migrations/`, registered in order, and tested against all committed v1
fixtures. A migration must preserve stable IDs, revisions, actors, ledger facts,
and exact evidence unless the new normative protocol explicitly says otherwise.
