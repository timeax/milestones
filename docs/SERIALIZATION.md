# Serialization protocol v1

`MILESTONE_PROTOCOL_VERSION` is `1.0`. It is independent of the npm package
version, Artifact Protocol version, and milestone revision number.

Milestone IDs remain opaque JSON strings, timestamps are ISO/RFC 3339 strings,
readonly collections serialize as JSON arrays, and absent optional fields are
omitted. Aggregate milestones contain no maps. Graph and Artifact evaluation
contexts use their dedicated adapters, which encode maps as record arrays and
reconstruct them with unique IDs.

`serializeMilestone` returns the typed v1 wire object. `serializeMilestoneJson`
returns canonical JSON by sorting every object key while preserving semantically
ordered arrays. Equivalent domain values therefore produce identical bytes
regardless of metadata insertion order. Event JSON is canonicalized the same
way.

Hydration rejects malformed records, unknown/future schema versions, unknown
top-level fields, invalid discriminators/states, and every aggregate invariant.
Unknown data belongs in defined metadata extension points; it is not silently
retained as undeclared aggregate fields. v1 readers do not guess how to consume
future versions. A host must migrate first through the package migration layer.

The committed files under `test/fixtures/` are compatibility contracts for
minimal, full, accepted, completed, reopened, and artifact-integrated v1 state.
