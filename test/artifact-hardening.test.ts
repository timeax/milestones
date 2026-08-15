import type {
  Artifact,
  ArtifactRequirement,
  ArtifactSubmission,
  ArtifactVerification,
  ArtifactVersion,
} from "@elqora/artifacts";
import { describe, expect, it } from "vitest";
import {
  MilestoneEditor,
  deserializeArtifactContext,
  evaluateArtifacts,
  serializeArtifactContext,
  type MilestoneArtifactContext,
  type MilestoneArtifactLink,
  type MilestoneArtifactRole,
  type MilestoneArtifactSubjectType,
} from "../src/index.js";
import { actor, create } from "./helpers.js";

function contextFor(
  subject: { readonly type: MilestoneArtifactSubjectType; readonly id: string },
  role: MilestoneArtifactRole = "evidence",
): MilestoneArtifactContext {
  const requirement: ArtifactRequirement = { schemaVersion: "1.0", id: "req", required: true, minimumCount: 1, allowedKinds: ["report"], allowedValueTypes: ["file"] };
  const artifact: Artifact = { schemaVersion: "1.0", id: "artifact", kind: "report", valueType: "file", currentVersionId: "v1", createdBy: { type: "user", id: "author" }, createdAt: "2026-08-15T00:00:00Z", updatedAt: "2026-08-15T00:00:00Z" };
  const version: ArtifactVersion = { schemaVersion: "1.0", id: "v1", artifactId: artifact.id, version: 1, source: { type: "url", url: "https://example.test/v1" }, createdBy: { type: "user", id: "author" }, createdAt: "2026-08-15T00:00:00Z" };
  const submission: ArtifactSubmission = { schemaVersion: "1.0", id: "submission", artifactId: artifact.id, artifactVersionId: version.id, submittedBy: { type: "user", id: "author" }, submittedAt: "2026-08-15T01:00:00Z" };
  const verification: ArtifactVerification = { schemaVersion: "1.0", id: "verification", artifactId: artifact.id, artifactVersionId: version.id, submissionId: submission.id, status: "verified", createdAt: "2026-08-15T02:00:00Z", verifiedAt: "2026-08-15T02:00:00Z", verifiedBy: { type: "user", id: "verifier" } };
  const link: MilestoneArtifactLink = { schemaVersion: "1.0", id: "link", artifactId: artifact.id, artifactVersionId: version.id, subject, role, createdBy: { type: "user", id: "author" }, createdAt: "2026-08-15T01:00:00Z", metadata: { artifactRequirementId: requirement.id } };
  return {
    requirements: new Map([[requirement.id, requirement]]),
    artifacts: new Map([[artifact.id, artifact]]),
    versions: new Map([[version.id, version]]),
    submissions: new Map([[submission.id, submission]]),
    verifications: new Map([[verification.id, verification]]),
    links: [link],
  };
}

describe("Artifact Protocol evidence hardening", () => {
  it("reports each incomplete or failed context condition specifically", () => {
    const complete = contextFor({ type: "criterion", id: "criterion" });
    const subject = { type: "criterion" as const, id: "criterion", requirementIds: ["req"] };
    expect(evaluateArtifacts(subject, { ...complete, requirements: new Map() }).reasons.map((value) => value.code)).toContain("artifact_requirement_missing");
    expect(evaluateArtifacts(subject, { ...complete, submissions: new Map() }).reasons.map((value) => value.code)).toContain("artifact_submission_missing");
    expect(evaluateArtifacts(subject, { ...complete, verifications: new Map() }).reasons.map((value) => value.code)).toContain("artifact_verification_missing");
    const failed = { ...complete.verifications.get("verification")!, status: "rejected" as const };
    expect(evaluateArtifacts(subject, { ...complete, verifications: new Map([[failed.id, failed]]) }).reasons.map((value) => value.code)).toContain("artifact_verification_failed");
    const wrongVersionLink = { ...complete.links[0]!, artifactVersionId: "absent" };
    expect(evaluateArtifacts(subject, { ...complete, links: [wrongVersionLink] }).reasons.map((value) => value.code)).toContain("artifact_version_missing");
  });

  it("distinguishes pinned immutable evidence from a stale logical-artifact link", () => {
    const original = contextFor({ type: "criterion", id: "criterion" });
    const artifact = original.artifacts.get("artifact")!;
    const version1 = original.versions.get("v1")!;
    const version2: ArtifactVersion = { ...version1, id: "v2", version: 2, source: { type: "url", url: "https://example.test/v2" }, createdAt: "2026-08-16T00:00:00Z" };
    const evolved = {
      ...original,
      artifacts: new Map([[artifact.id, { ...artifact, currentVersionId: version2.id }]]),
      versions: new Map([[version1.id, version1], [version2.id, version2]]),
    };
    const subject = { type: "criterion" as const, id: "criterion", requirementIds: ["req"] };
    expect(evaluateArtifacts(subject, evolved).satisfied).toBe(true);

    const { artifactVersionId: _pin, ...logicalLink } = evolved.links[0]!;
    const stale = evaluateArtifacts(subject, { ...evolved, links: [logicalLink] });
    expect(stale.satisfied).toBe(false);
    expect(stale.reasons.map((value) => value.code)).toContain("artifact_submission_missing");
  });

  it("evaluates criterion and deliverable links and preserves review/challenge links", () => {
    const criterion = contextFor({ type: "criterion", id: "criterion" });
    const deliverable = contextFor({ type: "deliverable_requirement", id: "deliverable" }, "deliverable");
    expect(evaluateArtifacts({ type: "criterion", id: "criterion", requirementIds: ["req"] }, criterion).satisfied).toBe(true);
    expect(evaluateArtifacts({ type: "deliverable_requirement", id: "deliverable", requirementIds: ["req"] }, deliverable).satisfied).toBe(true);

    const reviewLink = { ...criterion.links[0]!, id: "review-link", subject: { type: "review" as const, id: "review" }, role: "review_evidence" as const };
    const challengeLink = { ...criterion.links[0]!, id: "challenge-link", subject: { type: "challenge" as const, id: "challenge" }, role: "challenge_evidence" as const };
    const hydrated = deserializeArtifactContext(JSON.parse(JSON.stringify(serializeArtifactContext({ ...criterion, links: [reviewLink, challengeLink] }))) as ReturnType<typeof serializeArtifactContext>);
    expect(hydrated.links.map((value) => [value.subject.type, value.role])).toEqual([
      ["review", "review_evidence"],
      ["challenge", "challenge_evidence"],
    ]);
  });

  it("snapshots context per editor and maps host-detected invalidation to reopening", () => {
    const harness = create({ criteria: [{ title: "Evidence", required: true, state: "verified", artifactRequirementIds: ["req"] }] }, "artifact-snapshot");
    const context = contextFor({ type: "criterion", id: harness.milestone.criteria[0]!.id });
    const editor = new MilestoneEditor(harness.milestone, harness.profile, { ...harness, artifacts: context });
    (context.verifications as Map<string, ArtifactVerification>).clear();
    expect(editor.evaluateAcceptance().accepted).toBe(true);
    editor.accept(actor); editor.complete(actor);
    const completed = editor.commit().milestone;

    const reopen = new MilestoneEditor(completed, harness.profile, harness);
    reopen.reopen({
      effect: "invalidate_acceptance_and_completion",
      reason: "Pinned artifact verification was invalidated by its owner",
      actor,
      cause: { type: "artifact_invalidation", ref: "verification" },
    });
    const result = reopen.commit();
    expect(result.milestone.acceptanceRecords).toHaveLength(1);
    expect(result.milestone.completionRecords).toHaveLength(1);
    expect(result.milestone.currentAcceptanceId).toBeUndefined();
    expect(result.events[0]).toMatchObject({ type: "milestone.reopened", payload: { cause: { type: "artifact_invalidation", ref: "verification" } } });
  });
});
