# Host authorization extension

Authorization remains a host concern. A host may provide an optional
`MilestoneAuthorizationContext` in `MilestoneEditorOptions`; when absent, editor
behavior is unchanged and the host is responsible for guarding access before
calling the SDK.

The callback receives a typed action, the supplied opaque actor, an isolated
snapshot of the current draft milestone, and (where applicable) a typed subject.
It returns either a boolean or an `AuthorizationDecision`. A denial throws
`MilestoneDomainError` with code `AUTHORIZATION_DENIED` before IDs are allocated,
state changes, events are emitted, or aggregate sequence advances.

The guarded actions are criterion verification/waiver, deliverable
satisfaction/waiver, challenge raise/resolve, review completion, approval
grant/reject/revoke/waive, milestone acceptance/completion/reopening, and every
material edit. The SDK does not define roles, permissions, provider identities,
or governance policies.

Approval stages may carry an opaque `authorityRef`. It is passed to the host
authorization callback and retained in revision snapshots and serialized
milestones. The SDK never resolves or evaluates the selector.

```ts
const editor = new MilestoneEditor(milestone, profile, {
  clock,
  ids,
  authorization: {
    canPerform({ action, actor, subject }) {
      return hostPolicy.allows({ action, actor, subject });
    },
  },
});
```
