import type { ActorRef, ChallengeEvidenceId, ChallengeEvidenceKind, ChallengeId, Milestone } from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { emit } from "./internal/events.js";
import { authorize, ensureOpen, feature, requiredText } from "./internal/helpers.js";
import type { Mutable } from "./internal/draft.js";
import type { EditorSession } from "./internal/session.js";

export interface ChallengeEvidenceInput { readonly kind: ChallengeEvidenceKind; readonly title: string; readonly description: string }

/** Command-only editor facade. Read/query APIs belong on direct readers, not this proxy-wrapped facade. */
export class EvidenceEditor {
  private readonly session: EditorSession;
  public constructor(session: never) { this.session = session as EditorSession; }

  public add(challengeId: ChallengeId, input: ChallengeEvidenceInput, actor?: ActorRef): ChallengeEvidenceId {
    ensureOpen(this.session); feature(this.session.profile.challenges.enabled, "challenges");
    const challenge = this.challenge(challengeId);
    this.validateInput(input);
    authorize(this.session, "evidence.add", actor, { type: "challenge_evidence", challengeId });
    const evidence = this.newEvidence(challengeId, challenge.milestoneRevisionId, input, actor);
    challenge.evidence.push(evidence);
    this.changed(challengeId, evidence.id);
    emit(this.session, "challenge.evidence_added", { evidence }, actor);
    return evidence.id;
  }

  public supersede(evidenceId: ChallengeEvidenceId, input: ChallengeEvidenceInput, actor?: ActorRef): ChallengeEvidenceId {
    ensureOpen(this.session); feature(this.session.profile.challenges.enabled, "challenges");
    const found = this.evidence(evidenceId);
    invariant(found.evidence.state === "active", "INVALID_STATE_TRANSITION", `Evidence ${evidenceId} is not active`);
    this.validateInput(input);
    authorize(this.session, "evidence.supersede", actor, { type: "challenge_evidence", challengeId: found.challenge.id, challengeEvidenceId: evidenceId });
    const successor = this.newEvidence(found.challenge.id, found.challenge.milestoneRevisionId, input, actor, evidenceId);
    found.evidence.state = "superseded";
    found.challenge.evidence.push(successor);
    this.changed(found.challenge.id, evidenceId);
    this.changed(found.challenge.id, successor.id);
    emit(this.session, "challenge.evidence_superseded", { previousEvidenceId: evidenceId, evidence: successor }, actor);
    return successor.id;
  }

  public withdraw(evidenceId: ChallengeEvidenceId, reason: string, actor?: ActorRef): void {
    ensureOpen(this.session); feature(this.session.profile.challenges.enabled, "challenges"); requiredText(reason, "Evidence withdrawal reason");
    const found = this.evidence(evidenceId);
    invariant(found.evidence.state === "active", "INVALID_STATE_TRANSITION", `Evidence ${evidenceId} is not active`);
    authorize(this.session, "evidence.withdraw", actor, { type: "challenge_evidence", challengeId: found.challenge.id, challengeEvidenceId: evidenceId });
    found.evidence.state = "withdrawn";
    found.evidence.withdrawalReason = reason;
    found.evidence.withdrawnAt = this.session.clock.now();
    if (actor !== undefined) found.evidence.withdrawnBy = actor;
    this.changed(found.challenge.id, evidenceId);
    emit(this.session, "challenge.evidence_withdrawn", { challengeId: found.challenge.id, challengeEvidenceId: evidenceId, reason }, actor);
  }

  private newEvidence(challengeId: ChallengeId, revisionId: Milestone["currentRevisionId"], input: ChallengeEvidenceInput, actor?: ActorRef, supersedesEvidenceId?: ChallengeEvidenceId) {
    return { id: this.session.ids.challengeEvidence(), milestoneId: this.session.draft.id, challengeId, milestoneRevisionId: revisionId, kind: input.kind, title: input.title, description: input.description, state: "active" as const, ...(supersedesEvidenceId === undefined ? {} : { supersedesEvidenceId }), ...(actor === undefined ? {} : { createdBy: actor }), createdAt: this.session.clock.now() };
  }
  private validateInput(input: ChallengeEvidenceInput): void { invariant(input.kind === "supporting" || input.kind === "response", "INVALID_ARGUMENT", "Evidence kind is invalid"); requiredText(input.title, "Evidence title"); requiredText(input.description, "Evidence description"); }
  private challenge(id: ChallengeId) { const challenge = this.session.draft.challenges.find((value) => value.id === id); invariant(challenge !== undefined, "NOT_FOUND", `Challenge ${id} was not found`); return challenge; }
  private evidence(id: ChallengeEvidenceId): { challenge: ReturnType<EvidenceEditor["challenge"]>; evidence: Mutable<Milestone["challenges"][number]["evidence"][number]> } { for (const challenge of this.session.draft.challenges) { const evidence = challenge.evidence.find((value) => value.id === id); if (evidence !== undefined) return { challenge, evidence }; } invariant(false, "NOT_FOUND", `Evidence ${id} was not found`); }
  private changed(challengeId: ChallengeId, challengeEvidenceId: ChallengeEvidenceId): void { this.session.changes.push({ type: "challenge_evidence_changed", challengeId, challengeEvidenceId }); }
}
export function createEvidenceEditor(session: EditorSession): EvidenceEditor { return new EvidenceEditor(session as never); }
