import type {
  ActorRef,
  MilestoneProfile,
  MilestoneRevisionId,
  TaskProfile,
  TaskRevisionId,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { defaultEvaluationPolicy } from "../services/evaluation.js";
import { currentTaskPolicy, resolveTaskEvaluationPolicy, taskEvaluationPolicyOverrides } from "../services/task-evaluation.js";
import { validateProfile } from "../services/validation.js";
import { validateTaskProfile } from "../services/validation/task.js";
import { emit, emitTask } from "./internal/events.js";
import { clone, ensureOpen, equalDomainValue, requiredText } from "./internal/helpers.js";
import { beginMaterialRevision, beginMaterialTaskRevision } from "./internal/revision.js";
import type { EditorSession, TaskEditorSession } from "./internal/session.js";

function isTaskSession(session: EditorSession | TaskEditorSession): session is TaskEditorSession {
  return session.aggregateType === "task";
}

export class RevisionEditor {
  private readonly session: EditorSession | TaskEditorSession;

  public constructor(session: EditorSession | TaskEditorSession) { this.session = session; }

  public begin(reason: string, actor?: ActorRef): MilestoneRevisionId | TaskRevisionId {
    ensureOpen(this.session);
    requiredText(reason, "Revision reason");
    if (isTaskSession(this.session)) {
      return beginMaterialTaskRevision(this.session, reason, actor);
    } else {
      return beginMaterialRevision(this.session, reason, actor);
    }
  }

  public applyProfile(profile: MilestoneProfile | TaskProfile, reason: string, actor?: ActorRef): void {
    ensureOpen(this.session);
    requiredText(reason, "Profile revision reason");
    const isTask = isTaskSession(this.session);
    if (isTask) {
      const issues = validateTaskProfile(profile as TaskProfile);
      invariant(issues.length === 0, "INVALID_ARGUMENT", "Invalid task profile", { issues });
      if (equalDomainValue(this.session.profile, profile)) return;
      beginMaterialTaskRevision(
        this.session,
        reason,
        actor,
        resolveTaskEvaluationPolicy(
          profile as TaskProfile,
          taskEvaluationPolicyOverrides(currentTaskPolicy(this.session.draft)),
        ),
      );
      this.session.profile = clone(profile as TaskProfile);
      (this.session as TaskEditorSession).draft.profile = clone(profile.ref as import("../model/domain.js").TaskProfileRef);
      this.session.changes.push({ type: "profile_changed", profile: clone(profile.ref as import("../model/domain.js").TaskProfileRef) });
      emitTask(this.session as TaskEditorSession, "task.profile_changed", { profile: clone(profile.ref as import("../model/domain.js").TaskProfileRef) }, actor);
    } else {
      const issues = validateProfile(profile as MilestoneProfile);
      invariant(issues.length === 0, "INVALID_ARGUMENT", "Invalid milestone profile", { issues });
      if (equalDomainValue(this.session.profile, profile)) return;
      beginMaterialRevision(
        this.session,
        reason,
        actor,
        defaultEvaluationPolicy(profile as MilestoneProfile),
      );
      this.session.profile = clone(profile as MilestoneProfile);
      (this.session as EditorSession).draft.profile = clone(profile.ref as import("../model/domain.js").MilestoneProfileRef);
      this.session.changes.push({ type: "profile_changed", profile: clone(profile.ref as import("../model/domain.js").MilestoneProfileRef) });
      emit(this.session as EditorSession, "profile.changed", { profile: clone(profile.ref as import("../model/domain.js").MilestoneProfileRef) }, actor);
    }
  }
}

export type TaskRevisionEditor = RevisionEditor;

export function createRevisionEditor(session: EditorSession | TaskEditorSession): RevisionEditor {
  return new RevisionEditor(session);
}
