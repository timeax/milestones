import type {
  ChallengeEvidence,
  ChallengeEvidenceSource,
  ChallengeEvidenceSourceIssue,
  ChallengeEvidenceSourceResolution,
  MilestoneArtifactContext,
  TaskArtifactContext,
  TaskChallengeEvidence,
} from "../model/domain.js";

/**
 * Resolves host-owned canonical Artifact Links for one evidence record. This is
 * audit information only; callers must not use its result as an acceptance gate.
 */
export function resolveChallengeEvidenceSources(
  evidence: ChallengeEvidence | TaskChallengeEvidence,
  context?: MilestoneArtifactContext | TaskArtifactContext,
): ChallengeEvidenceSourceResolution {
  if (context === undefined) return { evidenceId: evidence.id, status: "pending", sources: [], issues: [] };
  const expectedRole = evidence.kind === "supporting" ? "challenge_evidence" : "response_evidence";
  const links = context.links
    .filter((link) => link.subject.type === "challenge_evidence" && link.subject.id === evidence.id)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  if (links.length === 0) return { evidenceId: evidence.id, status: "pending", sources: [], issues: [] };

  const sources: ChallengeEvidenceSource[] = [];
  const issues: ChallengeEvidenceSourceIssue[] = [];
  for (const link of links) {
    if (link.role !== expectedRole) {
      issues.push({ code: "evidence_source_role_mismatch", linkId: link.id, message: `Evidence ${evidence.id} requires Artifact Link role ${expectedRole}` });
      continue;
    }
    if (link.artifactVersionId === undefined) {
      issues.push({ code: "evidence_source_unpinned", linkId: link.id, message: `Evidence source ${link.id} must pin an artifact version` });
      continue;
    }
    const artifact = context.artifacts.get(link.artifactId);
    if (artifact === undefined) {
      issues.push({ code: "evidence_source_artifact_missing", linkId: link.id, message: `Evidence source ${link.id} references absent artifact ${link.artifactId}` });
      continue;
    }
    const version = context.versions.get(link.artifactVersionId);
    if (version === undefined || version.artifactId !== artifact.id) {
      issues.push({ code: "evidence_source_version_missing", linkId: link.id, message: `Evidence source ${link.id} references an absent or mismatched artifact version ${link.artifactVersionId}` });
      continue;
    }
    sources.push({ linkId: link.id, role: expectedRole, artifactId: artifact.id, artifactVersionId: version.id });
  }
  return { evidenceId: evidence.id, status: issues.length === 0 ? "resolved" : "invalid", sources, issues };
}
