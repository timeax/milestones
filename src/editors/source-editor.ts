import type { ArtifactLinkId, ArtifactMetadata, ArtifactVersionId } from "@elqora/artifacts";
import type {
  ActorRef,
  MilestoneSourceLink,
  MilestoneSourceRole,
  MilestoneSourceSubjectType,
  TaskSourceLink,
  TaskSourceSubjectType,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { assertValidSourceLink, isDefinitionBearing, sourceSubjectOwnsLink } from "../services/sources.js";
import { emit, emitTask } from "./internal/events.js";
import {
  authorize,
  authorizeTask,
  clone,
  ensureOpen,
  equalDomainValue,
} from "./internal/helpers.js";
import { beginMaterialRevision, beginMaterialTaskRevision } from "./internal/revision.js";
import type { EditorSession, TaskEditorSession } from "./internal/session.js";

function isTaskSession(session: EditorSession | TaskEditorSession): session is TaskEditorSession {
  return "scope" in session.draft;
}

interface SourceTarget {
  readonly type: MilestoneSourceSubjectType | TaskSourceSubjectType;
  readonly id: string;
}

export class MilestoneSourceEditor {
  public constructor(private readonly session: EditorSession | TaskEditorSession) {}

  public attach(source: MilestoneSourceLink | TaskSourceLink, actor?: ActorRef): void {
    ensureOpen(this.session);
    assertValidSourceLink(source as any);
    this.assertOwned(source);
    const isTask = isTaskSession(this.session);
    if (source.subject.type === "milestone_revision" || source.subject.type === "task_revision") {
      invariant(
        this.session.revision?.id === source.subject.id,
        "INVALID_ARGUMENT",
        "Revision Sources must target the open draft revision",
      );
    }
    if (isTask) {
      authorizeTask(this.session as TaskEditorSession, "source.attach", actor, {
        type: "source",
        subject: source.subject as TaskSourceLink["subject"],
        linkId: source.id,
      });
    } else {
      authorize(this.session as EditorSession, "source.attach", actor, {
        type: "source",
        subject: source.subject as MilestoneSourceLink["subject"],
        linkId: source.id,
      });
    }
    this.materialIfNeeded(source, undefined, actor);
    const links = this.links(source.subject);
    invariant(!links.some((item) => item.id === source.id), "DUPLICATE_ID", `Source link ${source.id} already exists`);
    links.push(clone(source) as any);
    this.changed(source.id);
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.source_attached", { source: clone(source) as any }, actor);
    } else {
      emit(this.session as EditorSession, "source.attached", { source: clone(source) as any }, actor);
    }
  }

  public remove(linkId: ArtifactLinkId, actor?: ActorRef): void {
    ensureOpen(this.session);
    const found = this.find(linkId);
    this.assertMutableSubject(found.link.subject);
    const isTask = isTaskSession(this.session);
    if (isTask) {
      authorizeTask(this.session as TaskEditorSession, "source.remove", actor, {
        type: "source",
        subject: found.link.subject as any,
        linkId,
      });
    } else {
      authorize(this.session as EditorSession, "source.remove", actor, {
        type: "source",
        subject: found.link.subject as any,
        linkId,
      });
    }
    this.materialIfNeeded(undefined, found.link, actor);
    found.links.splice(found.index, 1);
    this.changed(linkId);
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.source_detached", { linkId, subject: clone(found.link.subject) as any }, actor);
    } else {
      emit(this.session as EditorSession, "source.detached", { linkId, subject: clone(found.link.subject) as any }, actor);
    }
  }

  public replace(linkId: ArtifactLinkId, source: MilestoneSourceLink | TaskSourceLink, actor?: ActorRef): void {
    ensureOpen(this.session);
    assertValidSourceLink(source as any);
    const found = this.find(linkId);
    this.assertMutableSubject(found.link.subject);
    invariant(sourceSubjectOwnsLink(source as any, found.link.subject as any), "INVALID_ARGUMENT", "Replacement Source must keep the same subject");
    const isTask = isTaskSession(this.session);
    if (isTask) {
      authorizeTask(this.session as TaskEditorSession, "source.replace", actor, {
        type: "source",
        subject: found.link.subject as any,
        linkId,
      });
    } else {
      authorize(this.session as EditorSession, "source.replace", actor, {
        type: "source",
        subject: found.link.subject as any,
        linkId,
      });
    }
    this.materialIfNeeded(source, found.link, actor);
    found.links[found.index] = clone(source) as any;
    this.changed(linkId);
    this.changed(source.id);
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.source_replaced", { previousLinkId: linkId, source: clone(source) as any }, actor);
    } else {
      emit(this.session as EditorSession, "source.replaced", { previousLinkId: linkId, source: clone(source) as any }, actor);
    }
  }

  public updateRole(linkId: ArtifactLinkId, role: MilestoneSourceRole, actor?: ActorRef): void {
    const found = this.find(linkId);
    this.assertMutableSubject(found.link.subject);
    const source = { ...found.link, role } as MilestoneSourceLink;
    assertValidSourceLink(source);
    const isTask = isTaskSession(this.session);
    if (isTask) {
      authorizeTask(this.session as TaskEditorSession, "source.change_role", actor, {
        type: "source",
        subject: found.link.subject as any,
        linkId,
      });
    } else {
      authorize(this.session as EditorSession, "source.change_role", actor, {
        type: "source",
        subject: found.link.subject as any,
        linkId,
      });
    }
    this.materialIfNeeded(source, found.link, actor);
    found.links[found.index] = source;
    this.changed(linkId);
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.source_role_changed", { linkId, previousRole: found.link.role, role }, actor);
    } else {
      emit(this.session as EditorSession, "source.role_changed", { linkId, previousRole: found.link.role, role }, actor);
    }
  }

  public update(
    linkId: ArtifactLinkId,
    patch: { readonly note?: string; readonly metadata?: ArtifactMetadata; readonly artifactVersionId?: ArtifactVersionId },
    actor?: ActorRef,
  ): void {
    const found = this.find(linkId);
    this.assertMutableSubject(found.link.subject);
    const source = { ...found.link, ...clone(patch) } as MilestoneSourceLink;
    assertValidSourceLink(source);
    if (equalDomainValue(source, found.link)) return;
    const isTask = isTaskSession(this.session);
    if (isTask) {
      authorizeTask(this.session as TaskEditorSession, "source.update", actor, {
        type: "source",
        subject: found.link.subject as any,
        linkId,
      });
    } else {
      authorize(this.session as EditorSession, "source.update", actor, {
        type: "source",
        subject: found.link.subject as any,
        linkId,
      });
    }
    this.materialIfNeeded(source, found.link, actor);
    found.links[found.index] = source;
    this.changed(linkId);
    const changed = (["note", "metadata", "artifactVersionId"] as const)
      .filter((key) => !equalDomainValue(source[key], found.link[key]))
      .map((key) => (key === "artifactVersionId" ? "artifact_version" : key));
    if (isTask) {
      emitTask(this.session as TaskEditorSession, "task.source_changed", { source: clone(source) as any, changed: changed as any }, actor);
    } else {
      emit(this.session as EditorSession, "source.changed", { source: clone(source), changed }, actor);
    }
  }

  private assertMutableSubject(subject: SourceTarget): void {
    if (subject.type === "milestone_revision" || subject.type === "task_revision") {
      invariant(
        this.session.revision?.id === subject.id,
        "INVALID_ARGUMENT",
        "Sources on historical revisions are immutable",
      );
    }
  }

  private materialIfNeeded(
    next: MilestoneSourceLink | TaskSourceLink | undefined,
    previous: MilestoneSourceLink | TaskSourceLink | undefined,
    actor?: ActorRef,
  ): void {
    if ((next !== undefined && isDefinitionBearing(next as any)) || (previous !== undefined && isDefinitionBearing(previous as any))) {
      if (isTaskSession(this.session)) {
        beginMaterialTaskRevision(this.session, "Definition-bearing Source changed", actor);
      } else {
        beginMaterialRevision(this.session, "Definition-bearing Source changed", actor);
      }
    }
  }

  private changed(linkId: ArtifactLinkId): void {
    this.session.changes.push({ type: "source_changed", linkId });
  }

  private assertOwned(link: MilestoneSourceLink | TaskSourceLink): void {
    const subject = link.subject;
    if (subject.type === "milestone" || subject.type === "task") {
      invariant(subject.id === this.session.draft.id, "INVALID_ARGUMENT", "Source does not belong to this aggregate");
    } else if (subject.type === "milestone_revision" || subject.type === "task_revision") {
      invariant(
        this.session.revision?.id === subject.id || (this.session.draft.revisions as any[]).some((item) => item.id === subject.id),
        "INVALID_ARGUMENT",
        "Revision Sources must target a revision of this aggregate",
      );
    } else if (subject.type === "criterion") {
      invariant((this.session.draft.criteria as any[]).some((item) => item.id === subject.id), "NOT_FOUND", "Source criterion does not exist");
    } else if (subject.type === "deliverable_requirement") {
      invariant((this.session.draft.deliverables as any[]).some((item) => item.id === subject.id), "NOT_FOUND", "Source deliverable does not exist");
    } else if (subject.type === "challenge") {
      invariant((this.session.draft.challenges as any[]).some((item) => item.id === subject.id), "NOT_FOUND", "Source challenge does not exist");
    } else {
      invariant((this.session.draft.reviews as any[]).some((item) => item.id === subject.id), "NOT_FOUND", "Source review does not exist");
    }
  }

  private links(subject: SourceTarget): (MilestoneSourceLink | TaskSourceLink)[] {
    this.assertOwned({ subject } as any);
    if (subject.type === "milestone" || subject.type === "task") {
      return ((this.session.draft as unknown as { sourceLinks?: any[] }).sourceLinks ??= []);
    }
    if (subject.type === "milestone_revision" || subject.type === "task_revision") {
      return (((this.session.draft.revisions as any[]).find((item) => item.id === subject.id)! as unknown as { sourceLinks?: any[] }).sourceLinks ??= []);
    }
    if (subject.type === "criterion") {
      return (((this.session.draft.criteria as any[]).find((item) => item.id === subject.id)! as unknown as { sourceLinks?: any[] }).sourceLinks ??= []);
    }
    if (subject.type === "deliverable_requirement") {
      return (((this.session.draft.deliverables as any[]).find((item) => item.id === subject.id)! as unknown as { sourceLinks?: any[] }).sourceLinks ??= []);
    }
    if (subject.type === "challenge") {
      return (((this.session.draft.challenges as any[]).find((item) => item.id === subject.id)! as unknown as { sourceLinks?: any[] }).sourceLinks ??= []);
    }
    return (((this.session.draft.reviews as any[]).find((item) => item.id === subject.id)! as unknown as { sourceLinks?: any[] }).sourceLinks ??= []);
  }

  private find(linkId: ArtifactLinkId): {
    link: MilestoneSourceLink | TaskSourceLink;
    links: (MilestoneSourceLink | TaskSourceLink)[];
    index: number;
  } {
    const isTask = isTaskSession(this.session);
    const all: SourceTarget[] = [
      { type: isTask ? "task" : "milestone", id: this.session.draft.id },
      ...this.session.draft.revisions.map((item) => ({ type: isTask ? ("task_revision" as const) : ("milestone_revision" as const), id: item.id })),
      ...this.session.draft.criteria.map((item) => ({ type: "criterion" as const, id: item.id })),
      ...this.session.draft.deliverables.map((item) => ({ type: "deliverable_requirement" as const, id: item.id })),
      ...this.session.draft.challenges.map((item) => ({ type: "challenge" as const, id: item.id })),
      ...this.session.draft.reviews.map((item) => ({ type: "review" as const, id: item.id })),
    ];
    for (const subject of all) {
      const links = this.links(subject);
      const index = links.findIndex((item) => item.id === linkId);
      if (index >= 0) return { link: links[index]!, links, index };
    }
    invariant(false, "NOT_FOUND", `Source link ${linkId} was not found`);
  }
}

export const SourceEditor = MilestoneSourceEditor;
export type TaskSourceEditor = MilestoneSourceEditor;
export function createSourceEditor(session: EditorSession | TaskEditorSession): MilestoneSourceEditor {
  return new MilestoneSourceEditor(session);
}
