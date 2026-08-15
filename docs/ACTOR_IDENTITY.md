# Actor identity contract

`ActorRef` is an opaque, host-supplied audit identity:

```ts
interface ActorRef {
  readonly id: string;
  readonly type?: string;
}
```

The host must provide an `id` that remains stable for as long as milestone audit
records are retained. An ID need only be unique within the host's identity
namespace. Federated hosts should namespace IDs themselves; the milestone SDK
does not prepend, parse, resolve, normalize, or otherwise interpret them.

`type` is an optional, open-string discriminator. Hosts may use values such as
`person`, `service`, `automation`, `ai`, or `system`, but this package defines no
closed vocabulary. The identity of an actor is the pair `(type, id)`: the same
ID with two different types represents two distinct actors for operations such
as approval counting.

Examples such as `github-user:12345678`, `automation:deploy-bot`, `ai:codex`,
and `system:project-manager` are illustrative only. Their separators and
prefixes have no SDK meaning.

Display names, avatars, email addresses, provider profiles, permissions,
ownership, and identity resolution are host concerns and must not be embedded
in `ActorRef`. The SDK stores supplied references unchanged in events,
revisions, reviews, approvals, challenges, acceptance records, and completion
records. Supplying an actor is optional where the corresponding domain contract
allows anonymous or unattributed audit facts.
