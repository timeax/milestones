import type { ActorRef, ClaimId, MilestoneClaim } from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { emit } from "./internal/events.js";
import { authorize, clone, ensureOpen, requiredText } from "./internal/helpers.js";
import type { EditorSession } from "./internal/session.js";

export class MilestoneClaimEditor {
  public constructor(private readonly session: EditorSession) {}

  public claim(claimant: ActorRef, actor: ActorRef = claimant): ClaimId {
    ensureOpen(this.session);
    requiredText(claimant.id, "Claimant ID");
    authorize(this.session, "claim.create", actor, { type: "milestone" });
    invariant(this.session.draft.currentCompletionId === undefined, "LIFECYCLE_CONFLICT", "A completed milestone cannot receive a new claim");
    invariant(!this.session.draft.claims.some((claim) => claim.state === "active" && claim.claimant.id === claimant.id && claim.claimant.type === claimant.type), "LIFECYCLE_CONFLICT", "Actor already has an active claim on this milestone");
    const claim: Extract<MilestoneClaim, { readonly state: "active" }> = {
      id: this.session.ids.claim(),
      milestoneId: this.session.draft.id,
      claimant: clone(claimant),
      createdBy: clone(actor),
      state: "active",
      claimedAt: this.session.clock.now(),
    };
    this.session.draft.claims.push(claim);
    this.session.changes.push({ type: "claim_created", claimId: claim.id });
    emit(this.session, "claim.created", { claim: clone(claim) }, actor);
    return claim.id;
  }

  public release(id: ClaimId, actor?: ActorRef): void {
    ensureOpen(this.session);
    const index = this.session.draft.claims.findIndex((claim) => claim.id === id);
    invariant(index !== -1, "NOT_FOUND", `Claim ${id} was not found`, { claimId: id });
    authorize(this.session, "claim.release", actor, { type: "claim", claimId: id });
    const current = this.session.draft.claims[index]!;
    invariant(current.state === "active", "LIFECYCLE_CONFLICT", `Claim ${id} is already released`, { claimId: id });
    const releasedAt = this.session.clock.now();
    this.session.draft.claims[index] = {
      ...current,
      state: "released",
      releasedAt,
      ...(actor === undefined ? {} : { releasedBy: clone(actor) }),
    };
    this.session.changes.push({ type: "claim_released", claimId: id });
    emit(this.session, "claim.released", { claimId: id, releasedAt, ...(actor === undefined ? {} : { releasedBy: clone(actor) }) }, actor);
  }

  public get(id: ClaimId): MilestoneClaim | undefined {
    const found = this.session.draft.claims.find((claim) => claim.id === id);
    return found === undefined ? undefined : clone(found);
  }

  public list(): readonly MilestoneClaim[] { return clone(this.session.draft.claims); }
  public active(): readonly MilestoneClaim[] { return clone(this.session.draft.claims.filter((claim) => claim.state === "active")); }
}
