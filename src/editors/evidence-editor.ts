import type {
  ActorRef,
  ChallengeEvidenceId,
  ChallengeEvidenceKind,
  ChallengeId,
  Milestone,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { emit, emitTask } from "./internal/events.js";
import { authorize, authorizeTask, ensureOpen, feature, requiredText } from "./internal/helpers.js";
import type { Mutable } from "./internal/draft.js";
import type { EditorSession, TaskEditorSession } from "./internal/session.js";

function isTaskSession(session: EditorSession | TaskEditorSession): session is TaskEditorSession {
  return "scope" in session.draft;
}

export interface ChallengeEvidenceInput {
  readonly kind: ChallengeEvidenceKind;
  readonly title: string;
  readonly description: string;
}

/** Command-only editor facade. Read/query APIs belong on direct readers, not this proxy-wrapped facade. */
export class EvidenceEditor {
  private readonly session: EditorSession | TaskEditorSession;
  public constructor(session: never) {
    this.session = session as EditorSession | TaskEditorSession;
  }

  public add(
    challengeId: ChallengeId,
    input: ChallengeEvidenceInput,
    actor?: ActorRef,
  ): ChallengeEvidenceId {
    ensureOpen(this.session);
    feature(this.session.profile.challenges.enabled, "challenges");
    const challenge = this.challenge(challengeId);
    this.validateInput(input);
    const isTask = isTaskSession(this.session);
    if (isTask) {
      authorizeTask(this.session as TaskEditorSession, "evidence.add", actor, {
        type: "challenge_evidence",
        challengeId,
      });
    } else {
      authorize(this.session as EditorSession, "evidence.add", actor, {
        type: "challenge_evidence",
        challengeId,
      });
    }
    const revisionId = (challenge as any).taskRevisionId ?? challenge.milestoneRevisionId;
    const evidence = this.newEvidence(challengeId, revisionId, input, actor);
    challenge.evidence.push(evidence as any);
    this.changed(challengeId, evidence.id);
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.challenge_evidence_added", { evidence: evidence as any }, actor);
    } else {
      emit(this.session as EditorSession, "challenge.evidence_added", { evidence: evidence as any }, actor);
    }
    return evidence.id;
  }

  public supersede(
    evidenceId: ChallengeEvidenceId,
    input: ChallengeEvidenceInput,
    actor?: ActorRef,
  ): ChallengeEvidenceId {
    ensureOpen(this.session);
    feature(this.session.profile.challenges.enabled, "challenges");
    const found = this.evidence(evidenceId);
    invariant(
      found.evidence.state === "active",
      "INVALID_STATE_TRANSITION",
      `Evidence ${evidenceId} is not active`,
    );
    this.validateInput(input);
    const isTask = isTaskSession(this.session);
    if (isTask) {
      authorizeTask(this.session as TaskEditorSession, "evidence.supersede", actor, {
        type: "challenge_evidence",
        challengeId: found.challenge.id,
        challengeEvidenceId: evidenceId,
      });
    } else {
      authorize(this.session as EditorSession, "evidence.supersede", actor, {
        type: "challenge_evidence",
        challengeId: found.challenge.id,
        challengeEvidenceId: evidenceId,
      });
    }
    const revisionId = (found.challenge as any).taskRevisionId ?? found.challenge.milestoneRevisionId;
    const successor = this.newEvidence(found.challenge.id, revisionId, input, actor, evidenceId);
    found.evidence.state = "superseded";
    found.challenge.evidence.push(successor as any);
    this.changed(found.challenge.id, evidenceId);
    this.changed(found.challenge.id, successor.id);
    if (isTask) {
      emitTask(
        this.session as TaskEditorSession,
        "task.challenge_evidence_superseded",
        { previousEvidenceId: evidenceId, evidence: successor as any },
        actor,
      );
    } else {
      emit(
        this.session as EditorSession,
        "challenge.evidence_superseded",
        { previousEvidenceId: evidenceId, evidence: successor as any },
        actor,
      );
    }
    return successor.id;
  }

  public withdraw(evidenceId: ChallengeEvidenceId, reason: string, actor?: ActorRef): void {
    ensureOpen(this.session);
    feature(this.session.profile.challenges.enabled, "challenges");
    requiredText(reason, "Evidence withdrawal reason");
    const found = this.evidence(evidenceId);
    invariant(
      found.evidence.state === "active",
      "INVALID_STATE_TRANSITION",
      `Evidence ${evidenceId} is not active`,
    );
    const isTask = isTaskSession(this.session);
    if (isTask) {
      authorizeTask(this.session as TaskEditorSession, "evidence.withdraw", actor, {
        type: "challenge_evidence",
        challengeId: found.challenge.id,
        challengeEvidenceId: evidenceId,
      });
    } else {
      authorize(this.session as EditorSession, "evidence.withdraw", actor, {
        type: "challenge_evidence",
        challengeId: found.challenge.id,
        challengeEvidenceId: evidenceId,
      });
    }
    found.evidence.state = "withdrawn";
    found.evidence.withdrawalReason = reason;
    found.evidence.withdrawnAt = this.session.clock.now();
    if (actor !== undefined) found.evidence.withdrawnBy = actor;
    this.changed(found.challenge.id, evidenceId);
    if (isTask) {
      emitTask(
        this.session as TaskEditorSession,
        "task.challenge_evidence_withdrawn",
        { challengeId: found.challenge.id, challengeEvidenceId: evidenceId, reason },
        actor,
      );
    } else {
      emit(
        this.session as EditorSession,
        "challenge.evidence_withdrawn",
        { challengeId: found.challenge.id, challengeEvidenceId: evidenceId, reason },
        actor,
      );
    }
  }

  private newEvidence(
    challengeId: ChallengeId,
    revisionId: string,
    input: ChallengeEvidenceInput,
    actor?: ActorRef,
    supersedesEvidenceId?: ChallengeEvidenceId,
  ) {
    const isTask = isTaskSession(this.session);
    return {
      id: this.session.ids.challengeEvidence(),
      ...(isTask ? { taskId: this.session.draft.id, taskRevisionId: revisionId } : { milestoneId: this.session.draft.id, milestoneRevisionId: revisionId }),
      challengeId,
      kind: input.kind,
      title: input.title,
      description: input.description,
      state: "active" as const,
      ...(supersedesEvidenceId === undefined ? {} : { supersedesEvidenceId }),
      ...(actor === undefined ? {} : { createdBy: actor }),
      createdAt: this.session.clock.now(),
    };
  }

  private validateInput(input: ChallengeEvidenceInput): void {
    invariant(
      input.kind === "supporting" || input.kind === "response",
      "INVALID_ARGUMENT",
      "Evidence kind is invalid",
    );
    requiredText(input.title, "Evidence title");
    requiredText(input.description, "Evidence description");
  }

  private challenge(id: ChallengeId) {
    const challenge = (this.session.draft.challenges as any[]).find((value) => value.id === id);
    invariant(challenge !== undefined, "NOT_FOUND", `Challenge ${id} was not found`);
    return challenge;
  }

  private evidence(id: ChallengeEvidenceId): {
    challenge: ReturnType<EvidenceEditor["challenge"]>;
    evidence: Mutable<Milestone["challenges"][number]["evidence"][number]>;
  } {
    for (const challenge of this.session.draft.challenges as any[]) {
      const evidence = challenge.evidence.find((value: any) => value.id === id);
      if (evidence !== undefined) return { challenge, evidence };
    }
    invariant(false, "NOT_FOUND", `Evidence ${id} was not found`);
  }

  private changed(challengeId: ChallengeId, challengeEvidenceId: ChallengeEvidenceId): void {
    this.session.changes.push({
      type: "challenge_evidence_changed",
      challengeId,
      challengeEvidenceId,
    });
  }
}

export type TaskEvidenceEditor = EvidenceEditor;

export function createEvidenceEditor(session: EditorSession | TaskEditorSession): EvidenceEditor {
  return new EvidenceEditor(session as never);
}
