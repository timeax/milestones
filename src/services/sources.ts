import type { ArtifactLinkId, ArtifactVersionId } from "@elqora/artifacts";
import type {
  Milestone,
  MilestoneArtifactContext,
  MilestoneSourceLink,
  MilestoneSourceSnapshot,
  MilestoneSourceSubjectType,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";

const roles = new Set([
  "reference",
  "context",
  "specification",
  "decision",
  "verification",
  "provenance",
  "audit",
]);
const subjects = new Set([
  "milestone",
  "milestone_revision",
  "task",
  "task_revision",
  "criterion",
  "deliverable_requirement",
  "challenge",
  "review",
]);

export function isDefinitionBearing(link: MilestoneSourceLink): boolean {
  return link.role === "specification" || link.role === "decision";
}

export function assertValidSourceLink(link: MilestoneSourceLink): void {
  invariant(link.schemaVersion === "1.1", "ARTIFACT_CONTEXT_INVALID", "Source link must use Artifact Protocol 1.1");
  invariant(link.id.length > 0 && link.artifactId.length > 0, "INVALID_ARGUMENT", "Source link IDs must be non-empty");
  invariant(roles.has(link.role), "INVALID_ARGUMENT", "Source link role is invalid");
  invariant(subjects.has(link.subject.type) && link.subject.id.length > 0, "INVALID_ARGUMENT", "Source link subject is invalid");
  invariant(!isDefinitionBearing(link) || link.artifactVersionId !== undefined, "INVALID_ARGUMENT", "Definition-bearing Sources must pin an Artifact Version");
}

export function resolveSourceLink(link: MilestoneSourceLink, context?: MilestoneArtifactContext): MilestoneSourceSnapshot {
  assertValidSourceLink(link);
  invariant(
    link.artifactVersionId !== undefined || context !== undefined,
    "ARTIFACT_CONTEXT_INVALID",
    `Unpinned Source link ${link.id} requires an Artifact context for historical resolution`,
  );
  let artifactVersionId = link.artifactVersionId;
  if (artifactVersionId === undefined && context !== undefined) {
    const artifact = context.artifacts.get(link.artifactId);
    invariant(artifact !== undefined, "ARTIFACT_CONTEXT_INVALID", `Source link ${link.id} references an absent Artifact`);
    artifactVersionId = artifact?.currentVersionId;
  }
  if (artifactVersionId !== undefined && context !== undefined) {
    invariant(
      context.versions.get(artifactVersionId)?.artifactId === link.artifactId,
      "ARTIFACT_CONTEXT_INVALID",
      `Source link ${link.id} resolves to an absent or mismatched Artifact Version`,
    );
  }
  return {
    linkId: link.id,
    artifactId: link.artifactId,
    ...(artifactVersionId === undefined ? {} : { artifactVersionId }),
    subject: structuredClone(link.subject),
    role: link.role,
    ...(link.note === undefined ? {} : { note: link.note }),
    ...(link.metadata === undefined ? {} : { metadata: structuredClone(link.metadata) }),
  };
}

export function sourceLinksForRevision(milestone: Milestone, revisionId: string): readonly MilestoneSourceLink[] {
  const revision = milestone.revisions.find((item) => item.id === revisionId);
  return [
    ...(milestone.sourceLinks ?? []),
    ...(revision?.sourceLinks ?? []),
    ...milestone.criteria.flatMap((item) => item.sourceLinks ?? []),
    ...milestone.deliverables.flatMap((item) => item.sourceLinks ?? []),
    ...milestone.challenges.filter((item) => item.milestoneRevisionId === revisionId).flatMap((item) => item.sourceLinks ?? []),
    ...milestone.reviews.filter((item) => item.milestoneRevisionId === revisionId).flatMap((item) => item.sourceLinks ?? []),
  ];
}

export function resolveSources(links: readonly MilestoneSourceLink[], context?: MilestoneArtifactContext): readonly MilestoneSourceSnapshot[] {
  const ids = new Set<ArtifactLinkId>();
  for (const link of links) {
    assertValidSourceLink(link);
    invariant(!ids.has(link.id), "DUPLICATE_ID", `Duplicate source link ${link.id}`);
    ids.add(link.id);
  }
  return links.map((link) => resolveSourceLink(link, context));
}

export function sourceSnapshotHasVersion(snapshot: MilestoneSourceSnapshot): snapshot is MilestoneSourceSnapshot & { readonly artifactVersionId: ArtifactVersionId } {
  return snapshot.artifactVersionId !== undefined;
}

export function sourceSubjectOwnsLink(
  link: MilestoneSourceLink,
  subject: { readonly type: MilestoneSourceSubjectType; readonly id: string },
): boolean {
  return link.subject.type === subject.type && link.subject.id === subject.id;
}
