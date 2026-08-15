import type { ActorRef, MilestoneProfile } from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { defaultEvaluationPolicy } from "../services/evaluation.js";
import { validateProfile } from "../services/validation.js";
import { emit } from "./internal/events.js";
import { clone, ensureOpen, equalDomainValue, requiredText } from "./internal/helpers.js";
import { beginMaterialRevision } from "./internal/revision.js";
import type { EditorSession } from "./internal/session.js";

export class RevisionEditor {
  private readonly session: EditorSession;

  public constructor(session: never) {
    this.session = session as EditorSession;
  }

  public begin(reason: string, actor?: ActorRef): void {
    ensureOpen(this.session);
    requiredText(reason, "Revision reason");
    beginMaterialRevision(this.session, reason, actor);
  }

  public applyProfile(profile: MilestoneProfile, reason: string, actor?: ActorRef): void {
    ensureOpen(this.session);
    requiredText(reason, "Profile revision reason");
    const issues = validateProfile(profile);
    invariant(
      issues.length === 0,
      "INVALID_ARGUMENT",
      "Invalid milestone profile",
      { issues },
    );
    if (equalDomainValue(this.session.profile, profile)) return;
    beginMaterialRevision(this.session, reason, actor, defaultEvaluationPolicy(profile));
    this.session.profile = clone(profile);
    this.session.draft.profile = clone(profile.ref);
    this.session.changes.push({ type: "profile_changed", profile: clone(profile.ref) });
    emit(this.session, "profile.changed", { profile: clone(profile.ref) }, actor);
  }
}

export function createRevisionEditor(session: EditorSession): RevisionEditor {
  return new RevisionEditor(session as never);
}
