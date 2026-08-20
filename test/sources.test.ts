import type { MilestoneSourceLink } from "../src/index.js";
import { describe, expect, it } from "vitest";
import { MilestoneEditor } from "../src/index.js";
import { create } from "./helpers.js";

function source(subject: MilestoneSourceLink["subject"], role: MilestoneSourceLink["role"] = "context", id = "source-link"): MilestoneSourceLink {
  return { schemaVersion: "1.1", id, artifactId: "artifact", ...(role === "specification" || role === "decision" ? { artifactVersionId: "version" } : {}), subject, role, createdBy: { type: "user", id: "author" }, createdAt: "2026-08-15T00:00:00.000Z" };
}

describe("milestone Sources", () => {
  it("attaches contextual Sources without creating a revision or acceptance gate", () => {
    const h = create(); const editor = new MilestoneEditor(h.milestone, h.profile, h);
    editor.sources.attach(source({ type: "milestone", id: h.milestone.id }));
    const result = editor.commit();
    expect(result.milestone.revisions).toHaveLength(1);
    expect(result.milestone.sourceLinks).toHaveLength(1);
    expect(result.events.map((event) => event.type)).toContain("source.attached");
  });

  it("revises, snapshots, and pins a definition-bearing Source", () => {
    const h = create(); const editor = new MilestoneEditor(h.milestone, h.profile, h);
    editor.sources.attach(source({ type: "milestone", id: h.milestone.id }, "specification"));
    const result = editor.commit();
    expect(result.milestone.currentRevisionId).not.toBe(h.milestone.currentRevisionId);
    expect(result.revision?.snapshot.sources).toMatchObject([{ artifactId: "artifact", artifactVersionId: "version", role: "specification" }]);
  });

  it("returns an open revision ID for revision-scoped canonical sources", () => {
    const h = create(); const editor = new MilestoneEditor(h.milestone, h.profile, h);
    const revisionId = editor.revisions.begin("Add revision source");
    editor.sources.attach(source({ type: "milestone_revision", id: revisionId }, "decision"));
    const result = editor.commit();
    expect(result.revision?.sourceLinks).toHaveLength(1);
  });

  it("rejects mutating sources on committed historical revisions", () => {
    const h = create();
    const ed1 = new MilestoneEditor(h.milestone, h.profile, h);
    const revId = ed1.revisions.begin("Add revision source");
    const srcId = "rev-src-1";
    ed1.sources.attach(source({ type: "milestone_revision", id: revId }, "decision", srcId));
    const committed = ed1.commit().milestone;

    // Open a new editor session where revId is now committed/historical
    const ed2 = new MilestoneEditor(committed, h.profile, h);

    expect(() => ed2.sources.remove(srcId as never)).toThrow("Sources on historical revisions are immutable");
    expect(() =>
      ed2.sources.replace(
        srcId as never,
        source({ type: "milestone_revision", id: revId }, "decision", "replacement-src"),
      ),
    ).toThrow("Sources on historical revisions are immutable");
    expect(() => ed2.sources.updateRole(srcId as never, "specification")).toThrow("Sources on historical revisions are immutable");
    expect(() => ed2.sources.update(srcId as never, { note: "New note" })).toThrow("Sources on historical revisions are immutable");
  });
});
