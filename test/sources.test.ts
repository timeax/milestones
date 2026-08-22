import type { MilestoneSourceLink, TaskProfile, TaskSourceLink } from "../src/index.js";
import { describe, expect, it } from "vitest";
import { asTaskProfileId, FixedTaskClock, MilestoneEditor, SequenceTaskIdGenerator, TaskEditor } from "../src/index.js";
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

    expect(() => ed2.sources.remove(srcId)).toThrow("Sources on historical revisions are immutable");
    expect(() =>
      ed2.sources.replace(
        srcId,
        source({ type: "milestone_revision", id: revId }, "decision", "replacement-src"),
      ),
    ).toThrow("Sources on historical revisions are immutable");
    expect(() => ed2.sources.updateRole(srcId, "specification")).toThrow("Sources on historical revisions are immutable");
    expect(() => ed2.sources.update(srcId, { note: "New note" })).toThrow("Sources on historical revisions are immutable");
    expect(() => ed2.sources.remove("non-existent-source")).toThrow("Source link non-existent-source was not found");
  });
});

describe("task Sources", () => {
  it("keeps Sources on committed Task revisions historically immutable", () => {
    const taskProfile: TaskProfile = {
      ref: { id: asTaskProfileId("task-source-profile"), version: 1 },
      criteria: { enabled: false }, deliverables: { enabled: false },
      dependencies: { enabled: false, participatesInGraph: false }, revisions: { enabled: true },
      challenges: { enabled: false }, reviews: { enabled: false, required: false },
      approvals: { enabled: false, required: false },
      completion: { enabled: true, requiresAcceptance: false, closeImmediatelyOnAcceptance: false },
    };
    const dependencies = {
      clock: new FixedTaskClock("2026-08-20T00:00:00.000Z"),
      ids: new SequenceTaskIdGenerator("task-source"),
    };
    const first = TaskEditor.create(
      { profile: taskProfile, scope: { type: "project", projectId: "source-project" }, definition: { title: "Source task" } },
      dependencies,
    );
    const revisionId = first.revisions.begin("Attach historical Source");
    const sourceId = "task-revision-source";
    const revisionSource: TaskSourceLink = {
      schemaVersion: "1.1", id: sourceId, artifactId: "artifact", artifactVersionId: "version",
      subject: { type: "task_revision", id: revisionId }, role: "decision",
      createdBy: { type: "user", id: "author" }, createdAt: "2026-08-20T00:00:00.000Z",
    };
    first.sources.attach(revisionSource);
    const second = TaskEditor.open(first.commit().task, taskProfile, dependencies);

    expect(() => second.sources.remove(sourceId)).toThrow("Sources on historical revisions are immutable");
    expect(() => second.sources.replace(sourceId, { ...revisionSource, id: "replacement" })).toThrow("Sources on historical revisions are immutable");
    expect(() => second.sources.updateRole(sourceId, "specification")).toThrow("Sources on historical revisions are immutable");
    expect(() => second.sources.update(sourceId, { note: "rewrite" })).toThrow("Sources on historical revisions are immutable");
  });
});
