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

`migrateMilestoneWire` accepts legacy protocol 1.0, 1.1, and 1.2. It first applies
`1.0-to-1.1` where required, then applies `1.1-to-1.2`, adding empty Source-link
and source-snapshot collections without fabricating Artifact IDs, links, versions,
or metadata. It then applies `1.2-to-1.3`, adding an empty claims collection. Current 1.3 wires normalize without a migration. Older or future version values fail with
`MIGRATION_UNSUPPORTED`; hosts must not strip/change the version and hope that
current validation is sufficient.

When a later protocol is specified, its transform will be added under
`src/migrations/`, registered in order, and tested against all committed v1
fixtures. A migration must preserve stable IDs, revisions, actors, ledger facts,
and exact evidence unless the new normative protocol explicitly says otherwise.

Breakdown Protocol 1.0 remains independent. Its migration entry point upgrades
embedded legacy Milestone wires through the canonical Milestone migration path
before hydrating the Breakdown.
