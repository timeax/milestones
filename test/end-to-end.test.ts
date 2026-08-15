import type { Artifact, ArtifactRequirement, ArtifactSubmission, ArtifactVerification, ArtifactVersion } from "@elqora/artifacts";
import { describe, expect, it } from "vitest";
import { MilestoneEditor, createGraphSnapshot, type MilestoneArtifactContext, type MilestoneArtifactLink } from "../src/index.js";
import { actor, create, profile } from "./helpers.js";

describe("cross-domain lifecycle", () => {
  it("evaluates artifacts, graph, challenge, review, and approvals into pinned acceptance and completion", () => {
    const upstreamHarness = create({}, "e2e-up"); const upstreamEditor = new MilestoneEditor(upstreamHarness.milestone, upstreamHarness.profile, upstreamHarness); upstreamEditor.accept(); upstreamEditor.complete(); const upstream = upstreamEditor.commit().milestone;
    const p = profile({ reviews: { enabled: true, required: true }, approvals: { enabled: true, required: true } });
    const downstreamHarness = create({
      profile: p,
      criteria: [{ title: "Verified evidence", required: true, state: "verified", artifactRequirementIds: ["req"] }],
      deliverables: [{ title: "Handover", required: true, state: "satisfied" }],
      dependencies: [{ dependsOnMilestoneId: upstream.id, gate: { type: "completed" }, blocking: true }],
      approvalPolicy: { stages: [{ label: "Release", required: true, requiredApprovalCount: 1, scope: "milestone" }] },
    }, "e2e-down");
    const downstream = downstreamHarness.milestone; const criterion = downstream.criteria[0]!;
    const requirement: ArtifactRequirement = { schemaVersion: "1.0", id: "req", required: true };
    const artifact: Artifact = { schemaVersion: "1.0", id: "artifact", kind: "report", valueType: "file", currentVersionId: "v1", createdBy: { type: "user", id: "author" }, createdAt: "2026-08-15T00:00:00Z", updatedAt: "2026-08-15T00:00:00Z" };
    const version: ArtifactVersion = { schemaVersion: "1.0", id: "v1", artifactId: artifact.id, version: 1, source: { type: "url", url: "https://example.test/v1" }, createdBy: { type: "user", id: "author" }, createdAt: "2026-08-15T00:00:00Z" };
    const submission: ArtifactSubmission = { schemaVersion: "1.0", id: "submission", artifactId: artifact.id, artifactVersionId: version.id, submittedBy: { type: "user", id: "author" }, submittedAt: "2026-08-15T01:00:00Z" };
    const verification: ArtifactVerification = { schemaVersion: "1.0", id: "verification", artifactId: artifact.id, artifactVersionId: version.id, submissionId: submission.id, status: "verified", createdAt: "2026-08-15T02:00:00Z" };
    const link: MilestoneArtifactLink = { schemaVersion: "1.0", id: "link", artifactId: artifact.id, artifactVersionId: version.id, subject: { type: "criterion", id: criterion.id }, role: "evidence", createdBy: { type: "user", id: "author" }, createdAt: "2026-08-15T01:00:00Z", metadata: { artifactRequirementId: requirement.id } };
    const artifacts: MilestoneArtifactContext = { requirements: new Map([[requirement.id, requirement]]), artifacts: new Map([[artifact.id, artifact]]), versions: new Map([[version.id, version]]), submissions: new Map([[submission.id, submission]]), verifications: new Map([[verification.id, verification]]), links: [link] };
    const graph = createGraphSnapshot([upstream, downstream]);
    const editor = new MilestoneEditor(downstream, p, { ...downstreamHarness, graph, artifacts });
    const challenge = editor.challenges.raise({ type: "criterion", criterionId: criterion.id }, "Confirm evidence", "blocking", actor); editor.challenges.resolve(challenge, "no_effect", { actor });
    const review = editor.reviews.request({ requestedBy: actor, assignedReviewer: { id: "reviewer" } }); editor.reviews.complete(review, "accepted", { completedBy: { id: "reviewer" }, artifactVersionIds: [version.id] });
    editor.approvals.grant(downstream.approvalPolicy!.stages[0]!.id, { id: "approver" }); editor.accept(actor); editor.complete(actor, "closed"); const result = editor.commit().milestone;
    const snapshot = result.acceptanceRecords[0]!.snapshot;
    expect(snapshot.dependencies[0]).toMatchObject({ dependsOnMilestoneId: upstream.id, dependsOnRevisionId: upstream.currentRevisionId, gate: { type: "completed" }, satisfied: true });
    expect(snapshot.challenges[0]).toMatchObject({ id: challenge, state: "resolved", blocking: false });
    expect(snapshot.reviews[0]).toMatchObject({ id: review, artifactVersionIds: ["v1"], satisfied: true });
    expect(snapshot.approvals[0]).toMatchObject({ effectiveApprovalCount: 1, waived: false, satisfied: true });
    expect(snapshot.artifacts[0]).toMatchObject({ artifactVersionId: "v1", submissionId: "submission", verificationId: "verification" });
    expect(result.currentCompletionId).toBeDefined();
  });
});
