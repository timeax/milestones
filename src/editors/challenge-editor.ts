import type {
  ActorRef,
  ChallengeId,
  ChallengeResolutionOutcome,
  ChallengeState,
  ChallengeTarget,
  Milestone,
  TaskChallengeTarget,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { assertChallengeTransition } from "../services/transitions/challenges.js";
import { emit, emitTask } from "./internal/events.js";
import {
  authorize,
  authorizeTask,
  clone,
  ensureOpen,
  feature,
  requiredText,
} from "./internal/helpers.js";
import type { Mutable } from "./internal/draft.js";
import { applyReopen, applyTaskReopen } from "./internal/revision.js";
import { resolveSources } from "../services/sources.js";
import type { EditorSession, TaskEditorSession } from "./internal/session.js";

function isTaskSession(session: EditorSession | TaskEditorSession): session is TaskEditorSession {
  return "scope" in session.draft;
}

export class ChallengeEditor {
  private readonly session: EditorSession | TaskEditorSession;

  public constructor(session: never) {
    this.session = session as EditorSession | TaskEditorSession;
  }

  public raise(
    target: ChallengeTarget | TaskChallengeTarget,
    reason: string,
    severity: "non_blocking" | "blocking",
    raisedBy?: ActorRef,
  ): ChallengeId {
    ensureOpen(this.session);
    feature(this.session.profile.challenges.enabled, "challenges");
    requiredText(reason, "Challenge reason");
    this.assertTarget(target);
    const isTask = isTaskSession(this.session);
    if (isTask) {
      authorizeTask(this.session as TaskEditorSession, "challenge.raise", raisedBy, {
        type: "challenge_target",
        target: target as TaskChallengeTarget,
      });
    } else {
      authorize(this.session as EditorSession, "challenge.raise", raisedBy, {
        type: "challenge_target",
        target: target as ChallengeTarget,
      });
    }
    const id = this.session.ids.challenge();
    if (isTask) {
      const challenge = {
        id,
        taskId: this.session.draft.id as any,
        taskRevisionId: this.session.draft.currentRevisionId as any,
        target: clone(target) as TaskChallengeTarget,
        reason,
        severity,
        state: "open" as const,
        evidence: [],
        sourceLinks: [],
        ...(raisedBy === undefined ? {} : { raisedBy }),
        createdAt: this.session.clock.now(),
      };
      (this.session.draft.challenges as any[]).push(challenge);
      this.session.changes.push({ type: "challenge_changed", challengeId: id });
      emitTask(this.session as TaskEditorSession, "task.challenge_raised", { challenge: clone(challenge) as any }, raisedBy);
    } else {
      const challenge = {
        id,
        milestoneId: this.session.draft.id,
        milestoneRevisionId: this.session.draft.currentRevisionId,
        target: clone(target) as ChallengeTarget,
        reason,
        severity,
        state: "open" as const,
        evidence: [],
        sourceLinks: [],
        ...(raisedBy === undefined ? {} : { raisedBy }),
        createdAt: this.session.clock.now(),
      };
      this.session.draft.challenges.push(challenge);
      this.session.changes.push({ type: "challenge_changed", challengeId: id });
      emit(this.session as EditorSession, "challenge.raised", { challenge }, raisedBy);
    }
    return id;
  }

  public startReview(id: ChallengeId, actor?: ActorRef): void { this.transition(id, "under_review", actor); }
  public reject(id: ChallengeId, actor?: ActorRef): void { this.transition(id, "rejected", actor); }
  public withdraw(id: ChallengeId, actor?: ActorRef): void { this.transition(id, "withdrawn", actor); }
  public reopen(id: ChallengeId, actor?: ActorRef): void { this.transition(id, "reopened", actor); }

  public resolve(
    id: ChallengeId,
    outcome: ChallengeResolutionOutcome,
    options: { readonly summary?: string; readonly actor?: ActorRef } = {},
  ): void {
    ensureOpen(this.session);
    const challenge = this.get(id);
    assertChallengeTransition(challenge.state, "resolved");
    const isTask = isTaskSession(this.session);
    if (isTask) {
      authorizeTask(this.session as TaskEditorSession, "challenge.resolve", options.actor, { type: "challenge", challengeId: id });
    } else {
      authorize(this.session as EditorSession, "challenge.resolve", options.actor, { type: "challenge", challengeId: id });
    }
    const resolution = {
      outcome,
      ...(options.summary === undefined ? {} : { summary: options.summary }),
      ...(options.actor === undefined ? {} : { resolvedBy: options.actor }),
      resolvedAt: this.session.clock.now(),
      sourceSnapshot: resolveSources(challenge.sourceLinks ?? [], this.session.artifacts as any) as any,
    };
    challenge.state = "resolved";
    challenge.resolution = resolution;
    this.session.changes.push({ type: "challenge_changed", challengeId: id });
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.challenge_resolved", { challengeId: id, resolution }, options.actor);
      if (outcome !== "no_effect" && this.session.draft.currentAcceptanceId !== undefined) {
        applyTaskReopen(this.session as TaskEditorSession, {
          effect: "invalidate_acceptance_and_completion",
          reason: `Challenge ${id} resolved with ${outcome}`,
          ...(options.actor === undefined ? {} : { actor: options.actor }),
          cause: { type: "challenge", challengeId: id },
        });
      }
    } else {
      emit(this.session as EditorSession, "challenge.resolved", { challengeId: id, resolution }, options.actor);
      if (outcome !== "no_effect" && this.session.draft.currentAcceptanceId !== undefined) {
        applyReopen(this.session as EditorSession, {
          effect: "invalidate_acceptance_and_completion",
          reason: `Challenge ${id} resolved with ${outcome}`,
          ...(options.actor === undefined ? {} : { actor: options.actor }),
          cause: { type: "challenge", challengeId: id },
        });
      }
    }
  }

  private transition(id: ChallengeId, state: ChallengeState, actor?: ActorRef): void {
    ensureOpen(this.session);
    const challenge = this.get(id);
    assertChallengeTransition(challenge.state, state);
    challenge.state = state;
    if (state !== "resolved") delete challenge.resolution;
    this.session.changes.push({ type: "challenge_changed", challengeId: id });
    if (isTaskSession(this.session)) {
      emitTask(this.session as TaskEditorSession, "task.challenge_changed", { challengeId: id, state }, actor);
    } else {
      emit(this.session as EditorSession, "challenge.changed", { challengeId: id, state }, actor);
    }
  }

  private get(id: ChallengeId): Mutable<Milestone["challenges"][number]> {
    const value = (this.session.draft.challenges as any[]).find((item) => item.id === id);
    invariant(value !== undefined, "NOT_FOUND", `Challenge ${id} was not found`);
    return value;
  }

  private assertTarget(target: ChallengeTarget | TaskChallengeTarget): void {
    if (target.type === "criterion") {
      invariant(
        (this.session.draft.criteria as any[]).some((item) => item.id === target.criterionId),
        "NOT_FOUND",
        `Challenge criterion ${target.criterionId} was not found`,
      );
    } else if (target.type === "deliverable_requirement") {
      invariant(
        (this.session.draft.deliverables as any[]).some(
          (item) => item.id === target.deliverableRequirementId,
        ),
        "NOT_FOUND",
        `Challenge deliverable ${target.deliverableRequirementId} was not found`,
      );
    } else if (target.type === "review") {
      invariant(
        (this.session.draft.reviews as any[]).some((item) => item.id === target.reviewId),
        "NOT_FOUND",
        `Challenge review ${target.reviewId} was not found`,
      );
    } else if (target.type === "artifact" && this.session.artifacts !== undefined) {
      invariant(
        this.session.artifacts.artifacts.has(target.artifactId) &&
          (target.artifactVersionId === undefined ||
            this.session.artifacts.versions.get(target.artifactVersionId)?.artifactId ===
              target.artifactId),
        "NOT_FOUND",
        "Challenge artifact target was not found in the supplied artifact context",
      );
    }
  }
}

export type TaskChallengeEditor = ChallengeEditor;

export function createChallengeEditor(session: EditorSession | TaskEditorSession): ChallengeEditor {
  return new ChallengeEditor(session as never);
}
