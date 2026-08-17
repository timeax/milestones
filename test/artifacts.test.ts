import type { Artifact, ArtifactLink, ArtifactRequirement, ArtifactSubmission, ArtifactVerification, ArtifactVersion } from "@elqora/artifacts";
import { describe, expect, it } from "vitest";
import { ARTIFACT_PACKAGE_COMPATIBILITY, ARTIFACT_PROTOCOL_COMPATIBILITY, ARTIFACT_PROTOCOL_VERSION, MilestoneEditor, deserializeArtifactContext, evaluateArtifacts, serializeArtifactContext, type MilestoneArtifactContext, type MilestoneArtifactLink } from "../src/index.js";
import { actor, create } from "./helpers.js";

function artifactContext(subjectId: string, status: ArtifactVerification["status"] = "verified"): MilestoneArtifactContext {
  const requirement: ArtifactRequirement = { schemaVersion: "1.1", id: "req-1", required: true, minimumCount: 1, allowedKinds: ["report"], allowedValueTypes: ["file"] };
  const artifact: Artifact = { schemaVersion: "1.1", id: "artifact-1", kind: "report", valueType: "file", currentVersionId: "version-1", createdBy: { type: "user", id: "author" }, createdAt: "2026-08-15T00:00:00Z", updatedAt: "2026-08-15T00:00:00Z" };
  const version: ArtifactVersion = { schemaVersion: "1.1", id: "version-1", artifactId: artifact.id, version: 1, source: { type: "url", url: "https://example.test/report" }, createdBy: { type: "user", id: "author" }, createdAt: "2026-08-15T00:00:00Z" };
  const submission: ArtifactSubmission = { schemaVersion: "1.1", id: "submission-1", artifactId: artifact.id, artifactVersionId: version.id, submittedBy: { type: "user", id: "author" }, submittedAt: "2026-08-15T01:00:00Z" };
  const verification: ArtifactVerification = { schemaVersion: "1.1", id: "verification-1", artifactId: artifact.id, artifactVersionId: version.id, submissionId: submission.id, status, createdAt: "2026-08-15T02:00:00Z", verifiedAt: "2026-08-15T02:00:00Z", verifiedBy: { type: "user", id: "verifier" } };
  const link: MilestoneArtifactLink = { schemaVersion: "1.1", id: "link-1", artifactId: artifact.id, artifactVersionId: version.id, subject: { type: "criterion", id: subjectId }, role: "evidence", createdBy: { type: "user", id: "author" }, createdAt: "2026-08-15T01:00:00Z", metadata: { artifactRequirementId: requirement.id } };
  return { requirements: new Map([[requirement.id, requirement]]), artifacts: new Map([[artifact.id, artifact]]), versions: new Map([[version.id, version]]), submissions: new Map([[submission.id, submission]]), verifications: new Map([[verification.id, verification]]), links: [link] };
}

describe("Artifact Protocol integration", () => {
  it("pins the supported package and protocol compatibility", () => {
    expect(ARTIFACT_PROTOCOL_VERSION).toBe("1.1");
    expect(ARTIFACT_PACKAGE_COMPATIBILITY).toBe(">=0.2.0 <0.3.0");
    expect(ARTIFACT_PROTOCOL_COMPATIBILITY).toBe(">=1.1 <2.0");
  });

  it("evaluates canonical requirements/submissions/verifications and captures exact version records", () => {
    const h = create({ criteria: [{ title: "Evidence", required: true, state: "verified", artifactRequirementIds: ["req-1"] }] });
    const criterion = h.milestone.criteria[0]!; const artifacts = artifactContext(criterion.id);
    const roundTrip = deserializeArtifactContext(JSON.parse(JSON.stringify(serializeArtifactContext(artifacts))) as unknown as ReturnType<typeof serializeArtifactContext>);
    expect(roundTrip.requirements.get("req-1")?.id).toBe("req-1");
    const editor = new MilestoneEditor(h.milestone, h.profile, { ...h, artifacts });
    expect(editor.evaluateAcceptance().accepted).toBe(true); editor.accept(actor); const accepted = editor.commit().milestone;
    expect(accepted.acceptanceRecords[0]?.snapshot.artifacts).toEqual([{ artifactRequirementId: "req-1", artifactId: "artifact-1", artifactVersionId: "version-1", submissionId: "submission-1", verificationId: "verification-1", outcome: "satisfied" }]);

    const newerArtifact = { ...artifacts.artifacts.get("artifact-1")!, currentVersionId: "version-2" };
    const version2: ArtifactVersion = { ...artifacts.versions.get("version-1")!, id: "version-2", version: 2, createdAt: "2026-08-16T00:00:00Z" };
    const evolved = { ...artifacts, artifacts: new Map([[newerArtifact.id, newerArtifact]]), versions: new Map([...artifacts.versions, [version2.id, version2]]) };
    expect(accepted.acceptanceRecords[0]?.snapshot.artifacts[0]?.artifactVersionId).toBe("version-1");
    expect(evaluateArtifacts({ type: "criterion", id: criterion.id, requirementIds: ["req-1"] }, evolved).snapshots[0]?.artifactVersionId).toBe("version-1");
  });

  it("explains missing, rejected, and version-inconsistent artifact evidence", () => {
    const missing = evaluateArtifacts({ type: "criterion", id: "criterion", requirementIds: ["req-x"] });
    expect(missing.satisfied).toBe(false); expect(missing.reasons[0]?.code).toBe("artifact_requirement_missing");
    const rejected = artifactContext("criterion", "rejected");
    expect(evaluateArtifacts({ type: "criterion", id: "criterion", requirementIds: ["req-1"] }, rejected).reasons.some((reason) => reason.code === "artifact_verification_failed")).toBe(true);
    const badLink = { ...rejected.links[0]!, artifactVersionId: "missing-version" } as ArtifactLink;
    const inconsistent = { ...rejected, links: [badLink as MilestoneArtifactLink] };
    expect(evaluateArtifacts({ type: "criterion", id: "criterion", requirementIds: ["req-1"] }, inconsistent).reasons.some((reason) => reason.code === "artifact_version_missing")).toBe(true);
  });
});
