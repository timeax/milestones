import { describe, expect, it } from "vitest";
import {
  MilestoneEditor,
  SequenceMilestoneIdGenerator,
  type MilestoneArtifactContext,
} from "../../src/index.js";
import {
  ProjectManagerMilestoneAdapter,
  type ProjectManagerHostState,
  type ProjectMilestoneBinding,
} from "../../integration/project-manager-adapter.js";
import { actor, create } from "../helpers.js";

const binding: ProjectMilestoneBinding = {
  projectId: "project-1",
  versionId: "version-1",
  visibility: "internal",
  graphPosition: { x: 10, y: 20 },
  repositoryRoute: "owner/repository",
  pmPath: ".pm/milestones/m1.json",
};

function state(): ProjectManagerHostState {
  return { eventRows: [], outbox: [] };
}

describe("host-side Project Manager adapter proof", () => {
  it("persists, reloads, edits atomically, creates outbox, and survives restart", () => {
    const harness = create({ criteria: [{ title: "C", required: true, state: "submitted" }] }, "pm-adapter");
    const shared = state();
    const adapter = new ProjectManagerMilestoneAdapter(shared);
    adapter.create(binding, harness.milestone);
    const loaded = adapter.load();
    const editor = new MilestoneEditor(loaded, harness.profile, { ...harness, expectedSequence: loaded.sequence });
    editor.criteria.verify(loaded.criteria[0]!.id, actor);
    const result = editor.commit();
    expect(adapter.commit(loaded.sequence, result)).toBe(true);
    expect(shared.eventRows).toHaveLength(1);
    expect(shared.outbox[0]).toMatchObject({ projectId: "project-1", milestoneId: loaded.id, expectedSequence: 1, sequence: 2 });

    const restarted = new ProjectManagerMilestoneAdapter(shared);
    expect(restarted.load().criteria[0]?.state).toBe("verified");
    expect(restarted.load().sequence).toBe(2);
  });

  it("reconstructs graph and resolves host-owned Artifact Protocol context", () => {
    const harness = create({}, "pm-contexts");
    const artifacts: MilestoneArtifactContext = {
      requirements: new Map(), artifacts: new Map(), versions: new Map(),
      submissions: new Map(), verifications: new Map(), links: [],
    };
    const adapter = new ProjectManagerMilestoneAdapter(state(), artifacts);
    adapter.create(binding, harness.milestone);
    expect(adapter.reconstructGraph().milestones.get(harness.milestone.id)?.revisionId).toBe(harness.milestone.currentRevisionId);
    expect(adapter.resolveArtifacts()).toEqual(artifacts);
    expect(adapter.resolveArtifacts()).not.toBe(artifacts);
  });

  it("surfaces optimistic conflict without overwriting the winning transaction", () => {
    const harness = create({ criteria: [{ title: "C", required: true, state: "submitted" }] }, "pm-conflict");
    const shared = state();
    const adapter = new ProjectManagerMilestoneAdapter(shared);
    adapter.create(binding, harness.milestone);
    const firstLoaded = adapter.load();
    const secondLoaded = adapter.load();
    const first = new MilestoneEditor(firstLoaded, harness.profile, harness);
    first.criteria.verify(firstLoaded.criteria[0]!.id, actor);
    const second = new MilestoneEditor(secondLoaded, harness.profile, {
      clock: harness.clock,
      ids: new SequenceMilestoneIdGenerator("loser"),
    });
    second.criteria.verify(secondLoaded.criteria[0]!.id, actor);
    expect(adapter.commit(1, first.commit())).toBe(true);
    expect(adapter.commit(1, second.commit())).toBe(false);
    expect(adapter.load().sequence).toBe(2);
    expect(shared.outbox).toHaveLength(1);
  });

  it("rebuilds canonical SDK state from a host-owned .pm snapshot", () => {
    const harness = create({}, "pm-rebuild");
    const adapter = new ProjectManagerMilestoneAdapter(state());
    adapter.create(binding, harness.milestone);
    const rebuiltState = ProjectManagerMilestoneAdapter.rebuildFromPmSnapshot(adapter.exportPmSnapshot());
    const rebuilt = new ProjectManagerMilestoneAdapter(rebuiltState);
    expect(rebuilt.load()).toEqual(harness.milestone);
    expect(rebuiltState.row?.binding).toEqual(binding);
  });
});
