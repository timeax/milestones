import { describe, expect, it } from "vitest";
import {
  MAX_EDITOR_HISTORY_LIMIT,
  MilestoneDomainError,
  MilestoneEditor,
  asMilestoneId,
} from "../src/index.js";
import { actor, create } from "./helpers.js";

describe("editor session history", () => {
  it("starts at one initial point and supports basic undo and redo", () => {
    const harness = create({}, "history-basic");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);

    expect(editor.history).toMatchObject({
      canUndo: false,
      canRedo: false,
      index: 0,
      length: 1,
    });
    expect(editor.history.undo()).toBe(false);
    expect(editor.history.redo()).toBe(false);

    editor.definition.update({ title: "Changed" }, { reason: "Edit" });
    expect(editor.history.canUndo).toBe(true);
    expect(editor.history.length).toBe(2);
    expect(editor.history.undo()).toBe(true);
    expect(editor.history.canUndo).toBe(false);
    expect(editor.history.canRedo).toBe(true);
    expect(editor.history.redo()).toBe(true);
    expect(editor.history.canRedo).toBe(false);
    expect(editor.commit().milestone.definition.title).toBe("Changed");
  });

  it("undo restores the complete pending revision, invalidation, event, change, and sequence state", () => {
    const harness = create({
      criteria: [{ title: "C", required: true, state: "verified" }],
    }, "history-restore");
    const close = new MilestoneEditor(harness.milestone, harness.profile, harness);
    close.accept(actor);
    close.complete(actor);
    const original = close.commit().milestone;

    const editor = new MilestoneEditor(original, harness.profile, harness);
    editor.criteria.update(
      original.criteria[0]!.id,
      { description: "material" },
      { reason: "Material edit", verificationEffect: "invalidate" },
    );
    expect(editor.history.canUndo).toBe(true);
    expect(editor.history.undo()).toBe(true);
    const result = editor.commit();

    expect(result.milestone).toEqual(original);
    expect(result.events).toEqual([]);
    expect(result.changes).toEqual([]);
    expect(result.revision).toBeUndefined();
    expect(result.invalidations).toBeUndefined();
    expect(result.milestone.sequence).toBe(original.sequence);
    expect(result.milestone.currentAcceptanceId).toBe(original.currentAcceptanceId);
    expect(result.milestone.currentCompletionId).toBe(original.currentCompletionId);
  });

  it("redo restores the exact material revision and invalidations without duplication", () => {
    const harness = create({
      criteria: [{ title: "C", required: true, state: "verified" }],
    }, "history-redo");
    const close = new MilestoneEditor(harness.milestone, harness.profile, harness);
    close.accept(actor);
    close.complete(actor);
    const original = close.commit().milestone;

    const editor = new MilestoneEditor(original, harness.profile, harness);
    editor.criteria.update(original.criteria[0]!.id, { title: "Changed" }, { reason: "Edit" });
    editor.history.undo();
    editor.history.redo();
    editor.history.undo();
    editor.history.redo();
    const result = editor.commit();

    expect(result.milestone.revisions).toHaveLength(original.revisions.length + 1);
    expect(result.events.map((event) => event.type)).toEqual([
      "milestone.revised",
      "criterion.changed",
    ]);
    expect(result.invalidations).toHaveLength(2);
    expect(result.milestone.acceptanceRecords).toEqual(original.acceptanceRecords);
    expect(result.milestone.completionRecords).toEqual(original.completionRecords);
  });

  it("uses one linear history across sub-editors and truncates abandoned redo", () => {
    const harness = create({}, "history-linear");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.definition.update({ title: "A" }, { reason: "A" });
    const criterionId = editor.criteria.add({
      title: "B",
      required: false,
      state: "not_started",
    });
    editor.dependencies.add(asMilestoneId("upstream"), { type: "accepted" });
    expect(editor.history.length).toBe(4);

    editor.history.undo();
    editor.history.undo();
    editor.history.redo();
    editor.deliverables.add({ title: "D", required: false, state: "missing" });
    expect(editor.history.canRedo).toBe(false);
    const result = editor.commit();

    expect(result.milestone.definition.title).toBe("A");
    expect(result.milestone.criteria[0]?.id).toBe(criterionId);
    expect(result.milestone.deliverables).toHaveLength(1);
    expect(result.milestone.dependencies).toHaveLength(0);
  });

  it("groups nested transactions into one undo step", () => {
    const harness = create({}, "history-transaction");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    const value = editor.transact("Configure", () => {
      editor.definition.update({ title: "Configured" }, { reason: "Configure" });
      editor.transact("Nested", () => {
        editor.criteria.add({ title: "C", required: false, state: "not_started" });
        editor.deliverables.add({ title: "D", required: false, state: "missing" });
      });
      return 42;
    });

    expect(value).toBe(42);
    expect(editor.history.length).toBe(2);
    expect(editor.history.undo()).toBe(true);
    expect(editor.commit().milestone).toEqual(harness.milestone);
  });

  it("keeps review and approval operations on the same history stack", () => {
    const harness = create({
      approvalPolicy: {
        stages: [{
          label: "Optional",
          required: false,
          requiredApprovalCount: 0,
          scope: "milestone",
        }],
      },
    }, "history-governance");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    const reviewId = editor.reviews.request({ requestedBy: actor });
    editor.approvals.grant(harness.milestone.approvalPolicy!.stages[0]!.id, actor);
    expect(editor.history.length).toBe(3);
    editor.history.undo();
    editor.history.undo();
    editor.history.redo();
    const result = editor.commit().milestone;
    expect(result.reviews[0]?.id).toBe(reviewId);
    expect(result.approvalRecords).toEqual([]);
  });

  it("restores mutable profile state and groups immediate acceptance completion", () => {
    const immediate = {
      ...create({}, "profile-template").profile,
      ref: { ...create({}, "profile-template-ref").profile.ref, version: 2 },
      completion: { enabled: true, closeImmediatelyOnAcceptance: true },
    };
    const profileHarness = create({}, "history-profile");
    const profileEditor = new MilestoneEditor(
      profileHarness.milestone,
      profileHarness.profile,
      profileHarness,
    );
    profileEditor.revisions.applyProfile(immediate, "Profile update");
    profileEditor.history.undo();
    expect(profileEditor.commit().milestone.profile).toEqual(profileHarness.profile.ref);

    const immediateHarness = create({ profile: immediate }, "history-immediate");
    const lifecycleEditor = new MilestoneEditor(
      immediateHarness.milestone,
      immediateHarness.profile,
      immediateHarness,
    );
    lifecycleEditor.accept();
    expect(lifecycleEditor.history.length).toBe(2);
    lifecycleEditor.history.undo();
    const result = lifecycleEditor.commit();
    expect(result.milestone.currentAcceptanceId).toBeUndefined();
    expect(result.milestone.currentCompletionId).toBeUndefined();
    expect(result.events).toEqual([]);
  });

  it("rolls back a failed transaction without stale domain state", () => {
    const harness = create({}, "history-failed-transaction");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);

    expect(() => editor.transact("Fails", () => {
      editor.definition.update({ title: "Never committed" }, { reason: "Temporary" });
      editor.criteria.add({ title: "Invalid", required: true, weight: -1, state: "not_started" });
    })).toThrowError(MilestoneDomainError);

    expect(editor.history).toMatchObject({ length: 1, index: 0, canUndo: false });
    const result = editor.commit();
    expect(result.milestone).toEqual(harness.milestone);
    expect(result.events).toEqual([]);
    expect(result.changes).toEqual([]);
    expect(result.invalidations).toBeUndefined();
    expect(result.revision).toBeUndefined();
  });

  it("restores a failed transaction that had pending lifecycle invalidations", () => {
    const harness = create({}, "history-failed-invalidation");
    const close = new MilestoneEditor(harness.milestone, harness.profile, harness);
    close.accept();
    close.complete();
    const original = close.commit().milestone;
    const editor = new MilestoneEditor(original, harness.profile, harness);

    expect(() => editor.transact("Abort material edit", () => {
      editor.definition.update({ title: "Temporary" }, { reason: "Temporary" });
      throw new Error("abort");
    })).toThrow("abort");

    expect(editor.commit().milestone).toEqual(original);
  });

  it("retains exact event order and IDs across redo", () => {
    const directHarness = create({}, "history-events");
    const direct = new MilestoneEditor(
      directHarness.milestone,
      directHarness.profile,
      directHarness,
    );
    direct.definition.update({ title: "Changed" }, { reason: "Change", actor });
    const directResult = direct.commit();

    const redoHarness = create({}, "history-events");
    const redo = new MilestoneEditor(redoHarness.milestone, redoHarness.profile, redoHarness);
    redo.definition.update({ title: "Changed" }, { reason: "Change", actor });
    redo.history.undo();
    redo.history.redo();
    const redoResult = redo.commit();

    expect(redoResult.events).toEqual(directResult.events);
    expect(redoResult.changes).toEqual(directResult.changes);
  });

  it("respects the configured limit while never trimming the current state", () => {
    const harness = create({
      criteria: [{ title: "C", required: false, state: "not_started" }],
    }, "history-limit");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, {
      ...harness,
      historyLimit: 2,
    });
    const id = harness.milestone.criteria[0]!.id;
    editor.criteria.start(id);
    editor.criteria.submit(id);
    editor.criteria.verify(id);

    expect(editor.history.length).toBe(3);
    expect(editor.history.index).toBe(2);
    expect(editor.history.undo()).toBe(true);
    expect(editor.history.undo()).toBe(true);
    expect(editor.history.undo()).toBe(false);
    expect(editor.commit().milestone.criteria[0]?.state).toBe("in_progress");
  });

  it("clear retains current state but removes undo/redo points", () => {
    const harness = create({}, "history-clear");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.definition.update({ title: "Keep" }, { reason: "Keep" });
    editor.history.clear();
    expect(editor.history).toMatchObject({ length: 1, index: 0, canUndo: false, canRedo: false });
    expect(editor.commit().milestone.definition.title).toBe("Keep");
  });

  it("treats reordered nested domain values as unchanged and keeps queries out of history", () => {
    const harness = create({
      definition: {
        title: "M1",
        metadata: {
          first: 1,
          nested: { alpha: true, beta: false },
        },
      },
    }, "history-semantic-equality");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);

    editor.definition.update({
      metadata: {
        nested: { beta: false, alpha: true },
        first: 1,
      },
      title: "M1",
    }, { reason: "Property order only" });
    editor.evaluateAcceptance();
    editor.evaluateCompletion();

    expect(editor.history).toMatchObject({
      length: 1,
      index: 0,
      canUndo: false,
      canRedo: false,
    });
    const result = editor.commit();
    expect(result.changes).toEqual([]);
    expect(result.events).toEqual([]);
    expect(result.revision).toBeUndefined();
  });

  it("uses a zero limit to disable undo retention without discarding current edits", () => {
    const harness = create({}, "history-disabled");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, {
      ...harness,
      historyLimit: 0,
    });

    editor.definition.update({ title: "Still committed" }, { reason: "Edit" });

    expect(editor.history).toMatchObject({
      length: 1,
      index: 0,
      canUndo: false,
      canRedo: false,
    });
    expect(editor.history.undo()).toBe(false);
    expect(editor.history.redo()).toBe(false);
    expect(editor.commit().milestone.definition.title).toBe("Still committed");
  });

  it("validates limits and rejects history mutations after commit", () => {
    const harness = create({}, "history-closed");
    expect(() => new MilestoneEditor(harness.milestone, harness.profile, {
      ...harness,
      historyLimit: MAX_EDITOR_HISTORY_LIMIT + 1,
    })).toThrowError(MilestoneDomainError);

    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.definition.update({ title: "Closed" }, { reason: "Close" });
    editor.commit();
    expect(editor.history.canUndo).toBe(false);
    expect(editor.history.canRedo).toBe(false);
    expect(() => editor.history.undo()).toThrowError(MilestoneDomainError);
    expect(() => editor.history.redo()).toThrowError(MilestoneDomainError);
    expect(() => editor.history.clear()).toThrowError(MilestoneDomainError);
  });

  it("does not permit history navigation or commit inside a transaction", () => {
    const harness = create({}, "history-active-transaction");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.transact("Outer", () => {
      editor.definition.update({ title: "Inside" }, { reason: "Inside" });
      expect(() => editor.history.undo()).toThrowError(MilestoneDomainError);
      expect(() => editor.commit()).toThrowError(MilestoneDomainError);
    });
    expect(editor.commit().milestone.definition.title).toBe("Inside");
  });
});
