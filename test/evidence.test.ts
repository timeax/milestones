import type { Artifact, ArtifactVersion } from "@elqora/artifacts";
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  MilestoneDomainError,
  MilestoneEditor,
  asChallengeEvidenceId,
  resolveChallengeEvidenceSources,
  deserializeMilestoneJson,
  type MilestoneArtifactContext,
  type MilestoneArtifactLink,
} from "../src/index.js";
import { actor, create } from "./helpers.js";

function sourceContext(evidenceId: string, role: "challenge_evidence" | "response_evidence" = "challenge_evidence"): MilestoneArtifactContext {
  const artifact: Artifact = { schemaVersion: "1.1", id: "artifact", kind: "report", valueType: "file", currentVersionId: "version", createdBy: actor, createdAt: "2026-08-15T00:00:00.000Z", updatedAt: "2026-08-15T00:00:00.000Z" };
  const version: ArtifactVersion = { schemaVersion: "1.1", id: "version", artifactId: artifact.id, version: 1, source: { type: "url", url: "https://example.test/evidence" }, createdBy: actor, createdAt: "2026-08-15T00:00:00.000Z" };
  const link: MilestoneArtifactLink = { schemaVersion: "1.1", id: "z-link", artifactId: artifact.id, artifactVersionId: version.id, subject: { type: "challenge_evidence", id: evidenceId }, role, createdBy: actor, createdAt: "2026-08-15T00:00:00.000Z" };
  return { requirements: new Map(), artifacts: new Map([[artifact.id, artifact]]), versions: new Map([[version.id, version]]), submissions: new Map(), verifications: new Map(), links: [link] };
}

describe("first-class challenge evidence", () => {
  it("round-trips canonical Protocol 1.1 evidence states", async () => {
    const path = fileURLToPath(new URL("fixtures/milestone-evidence-v1.1.json", import.meta.url));
    const milestone = deserializeMilestoneJson(await readFile(path, "utf8"));
    expect(milestone.challenges[0]!.evidence.map((item) => item.state)).toEqual(["superseded", "withdrawn", "active"]);
  });
  it("is append-only, attributed, evented, and audit-only", () => {
    const h = create();
    const editor = new MilestoneEditor(h.milestone, h.profile, h);
    const challengeId = editor.challenges.raise({ type: "milestone" }, "Needs support", "non_blocking", actor);
    const evidenceId = editor.evidence.add(challengeId, { kind: "supporting", title: "Report", description: "Independent report" }, actor);
    const successorId = editor.evidence.supersede(evidenceId, { kind: "response", title: "Reply", description: "A considered response" }, actor);
    editor.evidence.withdraw(successorId, "Replaced externally", actor);
    const result = editor.commit();
    const evidence = result.milestone.challenges[0]!.evidence;
    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({ id: evidenceId, state: "superseded", createdBy: actor });
    expect(evidence[1]).toMatchObject({ id: successorId, state: "withdrawn", supersedesEvidenceId: evidenceId, withdrawalReason: "Replaced externally", withdrawnBy: actor });
    expect(result.events.map((event) => event.type)).toEqual(["challenge.raised", "challenge.evidence_added", "challenge.evidence_superseded", "challenge.evidence_withdrawn"]);
    expect(result.milestone.revisions).toHaveLength(1);
    expect(result.milestone.currentAcceptanceId).toBeUndefined();
  });

  it("resolves canonical pinned Artifact Links and keeps pending/invalid sources non-gating", () => {
    const h = create(); const draft = new MilestoneEditor(h.milestone, h.profile, h);
    const challengeId = draft.challenges.raise({ type: "milestone" }, "Audit", "non_blocking");
    const evidenceId = draft.evidence.add(challengeId, { kind: "supporting", title: "Source", description: "Source description" });
    const milestone = draft.commit().milestone; const evidence = milestone.challenges[0]!.evidence[0]!;
    expect(resolveChallengeEvidenceSources(evidence)).toMatchObject({ status: "pending", sources: [] });
    expect(resolveChallengeEvidenceSources(evidence, sourceContext(evidenceId))).toMatchObject({ status: "resolved", sources: [{ artifactVersionId: "version" }] });
    expect(resolveChallengeEvidenceSources(evidence, sourceContext(evidenceId, "response_evidence"))).toMatchObject({ status: "invalid", issues: [{ code: "evidence_source_role_mismatch" }] });
    const editor = new MilestoneEditor(milestone, h.profile, { ...h, artifacts: sourceContext(evidenceId) });
    const acceptance = editor.evaluateAcceptance();
    expect(acceptance.accepted).toBe(true);
    expect(acceptance.snapshot.challenges[0]!.evidence[0]).toMatchObject({ id: evidenceId, sourceStatus: "resolved", sources: [{ artifactVersionId: "version" }] });
  });

  it("rejects invalid command transitions and authorization", () => {
    const h = create(); const editor = new MilestoneEditor(h.milestone, h.profile, h);
    const challengeId = editor.challenges.raise({ type: "milestone" }, "Audit", "non_blocking");
    const id = editor.evidence.add(challengeId, { kind: "supporting", title: "Source", description: "Description" });
    editor.evidence.withdraw(id, "No longer reliable");
    expect(() => editor.evidence.supersede(id, { kind: "supporting", title: "x", description: "y" })).toThrowError(MilestoneDomainError);
    expect(() => editor.evidence.add(challengeId, { kind: "supporting", title: "", description: "y" })).toThrowError(MilestoneDomainError);
    expect(() => editor.evidence.withdraw(asChallengeEvidenceId("missing"), "why")).toThrowError();
  });
});
