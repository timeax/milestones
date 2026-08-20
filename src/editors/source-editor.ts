import type { ArtifactLinkId, ArtifactMetadata, ArtifactVersionId } from "@elqora/artifacts";
import type { ActorRef, MilestoneSourceLink, MilestoneSourceRole, MilestoneSourceSubjectType } from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { assertValidSourceLink, isDefinitionBearing, sourceSubjectOwnsLink } from "../services/sources.js";
import { emit } from "./internal/events.js";
import { authorize, clone, ensureOpen, equalDomainValue } from "./internal/helpers.js";
import { beginMaterialRevision } from "./internal/revision.js";
import type { EditorSession } from "./internal/session.js";

interface SourceTarget { readonly type: MilestoneSourceSubjectType; readonly id: string }

export class MilestoneSourceEditor {
  public constructor(private readonly session: EditorSession) {}

  public attach(source: MilestoneSourceLink, actor?: ActorRef): void {
    ensureOpen(this.session); assertValidSourceLink(source); this.assertOwned(source);
    if (source.subject.type === "milestone_revision") invariant(this.session.revision?.id === source.subject.id, "INVALID_ARGUMENT", "Revision Sources must target the open draft revision");
    authorize(this.session, "source.attach", actor, { type: "source", subject: source.subject, linkId: source.id });
    this.materialIfNeeded(source, undefined, actor);
    const links = this.links(source.subject); invariant(!links.some((item) => item.id === source.id), "DUPLICATE_ID", `Source link ${source.id} already exists`);
    links.push(clone(source)); this.changed(source.id); emit(this.session, "source.attached", { source: clone(source) }, actor);
  }

  public remove(linkId: ArtifactLinkId, actor?: ActorRef): void {
    ensureOpen(this.session); const found = this.find(linkId);
    authorize(this.session, "source.remove", actor, { type: "source", subject: found.link.subject, linkId });
    this.materialIfNeeded(undefined, found.link, actor);
    found.links.splice(found.index, 1); this.changed(linkId); emit(this.session, "source.detached", { linkId, subject: clone(found.link.subject) }, actor);
  }

  public replace(linkId: ArtifactLinkId, source: MilestoneSourceLink, actor?: ActorRef): void {
    ensureOpen(this.session); assertValidSourceLink(source); const found = this.find(linkId);
    invariant(sourceSubjectOwnsLink(source, found.link.subject), "INVALID_ARGUMENT", "Replacement Source must keep the same subject");
    authorize(this.session, "source.replace", actor, { type: "source", subject: found.link.subject, linkId });
    this.materialIfNeeded(source, found.link, actor);
    found.links[found.index] = clone(source); this.changed(linkId); this.changed(source.id);
    emit(this.session, "source.replaced", { previousLinkId: linkId, source: clone(source) }, actor);
  }

  public updateRole(linkId: ArtifactLinkId, role: MilestoneSourceRole, actor?: ActorRef): void {
    const found = this.find(linkId); const source = { ...found.link, role } as MilestoneSourceLink;
    assertValidSourceLink(source); authorize(this.session, "source.change_role", actor, { type: "source", subject: found.link.subject, linkId });
    this.materialIfNeeded(source, found.link, actor); found.links[found.index] = source; this.changed(linkId);
    emit(this.session, "source.role_changed", { linkId, previousRole: found.link.role, role }, actor);
  }

  public update(linkId: ArtifactLinkId, patch: { readonly note?: string; readonly metadata?: ArtifactMetadata; readonly artifactVersionId?: ArtifactVersionId }, actor?: ActorRef): void {
    const found = this.find(linkId); const source = { ...found.link, ...clone(patch) } as MilestoneSourceLink;
    assertValidSourceLink(source); if (equalDomainValue(source, found.link)) return;
    authorize(this.session, "source.update", actor, { type: "source", subject: found.link.subject, linkId });
    this.materialIfNeeded(source, found.link, actor); found.links[found.index] = source; this.changed(linkId);
    const changed = (["note", "metadata", "artifactVersionId"] as const).filter((key) => !equalDomainValue(source[key], found.link[key])).map((key) => key === "artifactVersionId" ? "artifact_version" : key);
    emit(this.session, "source.changed", { source: clone(source), changed }, actor);
  }

  private materialIfNeeded(next: MilestoneSourceLink | undefined, previous: MilestoneSourceLink | undefined, actor?: ActorRef): void {
    if ((next !== undefined && isDefinitionBearing(next)) || (previous !== undefined && isDefinitionBearing(previous))) beginMaterialRevision(this.session, "Definition-bearing Source changed", actor);
  }
  private changed(linkId: ArtifactLinkId): void { this.session.changes.push({ type: "source_changed", linkId }); }
  private assertOwned(link: MilestoneSourceLink): void {
    const subject = link.subject;
    if (subject.type === "milestone") invariant(subject.id === this.session.draft.id, "INVALID_ARGUMENT", "Source does not belong to this milestone");
    else if (subject.type === "milestone_revision") invariant(this.session.revision?.id === subject.id || this.session.draft.revisions.some((item) => item.id === subject.id), "INVALID_ARGUMENT", "Revision Sources must target a revision of this milestone");
    else if (subject.type === "criterion") invariant(this.session.draft.criteria.some((item) => item.id === subject.id), "NOT_FOUND", "Source criterion does not exist");
    else if (subject.type === "deliverable_requirement") invariant(this.session.draft.deliverables.some((item) => item.id === subject.id), "NOT_FOUND", "Source deliverable does not exist");
    else if (subject.type === "challenge") invariant(this.session.draft.challenges.some((item) => item.id === subject.id), "NOT_FOUND", "Source challenge does not exist");
    else invariant(this.session.draft.reviews.some((item) => item.id === subject.id), "NOT_FOUND", "Source review does not exist");
  }
  private links(subject: SourceTarget): MilestoneSourceLink[] {
    this.assertOwned({ subject } as MilestoneSourceLink);
    if (subject.type === "milestone") return ((this.session.draft as unknown as { sourceLinks?: MilestoneSourceLink[] }).sourceLinks ??= []);
    if (subject.type === "milestone_revision") return ((this.session.draft.revisions.find((item) => item.id === subject.id)! as unknown as { sourceLinks?: MilestoneSourceLink[] }).sourceLinks ??= []);
    if (subject.type === "criterion") return ((this.session.draft.criteria.find((item) => item.id === subject.id)! as unknown as { sourceLinks?: MilestoneSourceLink[] }).sourceLinks ??= []);
    if (subject.type === "deliverable_requirement") return ((this.session.draft.deliverables.find((item) => item.id === subject.id)! as unknown as { sourceLinks?: MilestoneSourceLink[] }).sourceLinks ??= []);
    if (subject.type === "challenge") return ((this.session.draft.challenges.find((item) => item.id === subject.id)! as unknown as { sourceLinks?: MilestoneSourceLink[] }).sourceLinks ??= []);
    return ((this.session.draft.reviews.find((item) => item.id === subject.id)! as unknown as { sourceLinks?: MilestoneSourceLink[] }).sourceLinks ??= []);
  }
  private find(linkId: ArtifactLinkId): { link: MilestoneSourceLink; links: MilestoneSourceLink[]; index: number } {
    const all: SourceTarget[] = [{ type: "milestone", id: this.session.draft.id }, ...this.session.draft.revisions.map((item) => ({ type: "milestone_revision" as const, id: item.id })), ...this.session.draft.criteria.map((item) => ({ type: "criterion" as const, id: item.id })), ...this.session.draft.deliverables.map((item) => ({ type: "deliverable_requirement" as const, id: item.id })), ...this.session.draft.challenges.map((item) => ({ type: "challenge" as const, id: item.id })), ...this.session.draft.reviews.map((item) => ({ type: "review" as const, id: item.id }))];
    for (const subject of all) { const links = this.links(subject); const index = links.findIndex((item) => item.id === linkId); if (index >= 0) return { link: links[index]!, links, index }; }
    invariant(false, "NOT_FOUND", `Source link ${linkId} was not found`);
  }
}

export const SourceEditor = MilestoneSourceEditor;
export function createSourceEditor(session: EditorSession): MilestoneSourceEditor { return new MilestoneSourceEditor(session); }
