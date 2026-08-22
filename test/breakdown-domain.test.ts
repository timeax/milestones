import { describe, expect, it } from "vitest";
import {
  BreakdownEditor,
  FixedBreakdownClock,
  MilestoneDomainError,
  MilestoneEditor,
  SequenceBreakdownIdGenerator,
  SequenceMilestoneIdGenerator,
  asBreakdownEventId,
  assertValidBreakdownHierarchy,
  detectBreakdownCycles,
  validateBreakdownHierarchy,
  type CreateBreakdownInput,
  type MilestoneProfile,
} from "../src/index.js";

function createBreakdownTestHarness() {
  const clock = new FixedBreakdownClock("2026-08-20T12:00:00.000Z");
  const ids = new SequenceBreakdownIdGenerator();
  return { clock, ids };
}

const childMilestoneProfile: MilestoneProfile = {
  ref: { id: "profile-child" as any, version: 1 },
  criteria: { enabled: true },
  deliverables: { enabled: true },
  dependencies: { enabled: true, participatesInGraph: true },
  revisions: { enabled: true },
  challenges: { enabled: true },
  reviews: { enabled: false, required: false },
  approvals: { enabled: false, required: false },
  completion: {
    enabled: true,
    closeImmediatelyOnAcceptance: false,
  },
};

describe("Breakdown Domain & BreakdownEditor", () => {
  it("creates, mutates, and manages child milestones within a Breakdown planning container", () => {
    const harness = createBreakdownTestHarness();
    const actor = { id: "planner-1", type: "user" };

    const msIds = new SequenceMilestoneIdGenerator();
    const ms1 = MilestoneEditor.create(
      {
        profile: childMilestoneProfile,
        definition: { title: "Sub Milestone 1" },
      },
      { clock: harness.clock, ids: msIds },
    ).milestone;

    const ms2 = MilestoneEditor.create(
      {
        profile: childMilestoneProfile,
        definition: { title: "Sub Milestone 2" },
      },
      { clock: harness.clock, ids: msIds },
    ).milestone;

    const ms3 = MilestoneEditor.create(
      {
        profile: childMilestoneProfile,
        definition: { title: "Sub Milestone 3" },
      },
      { clock: harness.clock, ids: msIds },
    ).milestone;

    const input: CreateBreakdownInput = {
      parentMilestoneId: "parent-ms-1" as any,
      owner: actor,
      definition: {
        title: "Parent Breakdown Plan",
        description: "Decomposing parent into child milestones",
        metadata: { phase: "Q3" },
      },
      milestones: [ms1],
      actor,
    };

    const editor = BreakdownEditor.create(input, harness);
    expect(editor.breakdown.parentMilestoneId).toBe("parent-ms-1");
    expect(editor.breakdown.definition.title).toBe("Parent Breakdown Plan");
    expect(editor.milestones.list().length).toBe(1);

    // Definition Editor
    editor.definition.setTitle("Updated Breakdown Plan", actor);
    expect(editor.breakdown.definition.title).toBe("Updated Breakdown Plan");
    editor.definition.setDescription("New description", actor);
    expect(editor.breakdown.definition.description).toBe("New description");
    editor.definition.setMetadata({ phase: "Q4", version: 2 }, actor);
    expect(editor.breakdown.definition.metadata).toEqual({ phase: "Q4", version: 2 });

    // Milestones Editor: add
    editor.milestones.add(ms2, actor);
    expect(editor.milestones.list().length).toBe(2);
    expect(editor.milestones.has(ms2.id)).toBe(true);
    expect(editor.milestones.get(ms2.id)?.id).toBe(ms2.id);

    // Milestones Editor: replace
    editor.milestones.replace(ms2.id, ms3, actor);
    expect(editor.milestones.has(ms3.id)).toBe(true);
    expect(editor.milestones.has(ms2.id)).toBe(false);

    // Milestones Editor: move / reorder
    editor.milestones.move(ms3.id, 0, actor);
    expect(editor.milestones.list()[0]!.id).toBe(ms3.id);

    // Milestones Editor: create child inline
    const ms4 = editor.milestones.create(
      {
        profile: childMilestoneProfile,
        definition: { title: "Sub Milestone 4" },
      },
      { clock: harness.clock, ids: msIds },
      actor,
    );
    expect(editor.milestones.has(ms4.id)).toBe(true);

    // Milestones Editor: remove
    editor.milestones.remove(ms1.id, actor);
    expect(editor.milestones.has(ms1.id)).toBe(false);

    // Transactions and history
    editor.transact("Batch edit", (tx) => {
      tx.definition.setTitle("Final Breakdown Plan");
    });
    expect(editor.breakdown.definition.title).toBe("Final Breakdown Plan");
    expect(editor.history.canUndo).toBe(true);
    editor.history.undo();
    expect(editor.breakdown.definition.title).toBe("Updated Breakdown Plan");
    editor.history.redo();
    expect(editor.breakdown.definition.title).toBe("Final Breakdown Plan");

    expect(editor.parentMilestoneId).toBe("parent-ms-1");
    expect(editor.isDirty).toBe(true);

    // Commit
    const editResult = editor.commit();
    expect(editResult.breakdown.id).toBeDefined();
    expect(editResult.events.length).toBeGreaterThan(0);
    expect(editResult.changes.length).toBeGreaterThan(0);

    // Rollback test on fresh editor
    const freshEditor = BreakdownEditor.create(input, harness);
    expect(freshEditor.isDirty).toBe(true);
    freshEditor.definition.setTitle("Will be rolled back");
    expect(freshEditor.isDirty).toBe(true);
    freshEditor.rollback();
    expect(() => freshEditor.commit()).toThrow();

    // Open existing Breakdown
    const reopened = BreakdownEditor.open(editResult.breakdown, harness);
    expect(reopened.breakdown.id).toBe(editResult.breakdown.id);
  });

  it("emits Breakdown creation semantics at sequence one", () => {
    const editor = BreakdownEditor.create(
      { parentMilestoneId: "parent-created" as any, definition: { title: "Created plan" }, actor: { id: "planner", type: "user" } },
      { ...createBreakdownTestHarness(), correlationId: "breakdown-create-correlation", causationId: asBreakdownEventId("breakdown-cause") },
    );
    const result = editor.commit();
    expect(result.changes).toEqual([{ type: "created" }]);
    expect(result.events.map((event) => event.type)).toEqual(["breakdown.created"]);
    expect(result.events[0]).toMatchObject({
      actor: { id: "planner", type: "user" },
      correlationId: "breakdown-create-correlation",
      causationId: "breakdown-cause",
      occurredAt: "2026-08-20T12:00:00.000Z",
    });
    expect(result.breakdown.sequence).toBe(result.events.at(-1)?.sequence);
  });

  it("rolls back failed Breakdown transactions and guards commit/concurrency boundaries", () => {
    const dependencies = createBreakdownTestHarness();
    const editor = BreakdownEditor.create(
      { parentMilestoneId: "parent-guards" as any, definition: { title: "Before" } },
      dependencies,
    );
    expect(() => editor.transact("fail", (tx) => {
      tx.definition.setTitle("During");
      throw new Error("abort");
    })).toThrow("abort");
    expect(editor.breakdown.definition.title).toBe("Before");
    expect(() => editor.transact("no commit", (tx) => tx.commit())).toThrowError(
      expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }),
    );
    const committed = editor.commit().breakdown;
    expect(() => editor.definition.setTitle("After close")).toThrowError(
      expect.objectContaining({ code: "EDITOR_CLOSED" }),
    );
    expect(() => BreakdownEditor.open(committed, { ...dependencies, expectedSequence: committed.sequence + 1 })).toThrowError(
      expect.objectContaining({ code: "CONCURRENCY_CONFLICT" }),
    );
  });

  it("prohibits adding the parent milestone as its own child", () => {
    const harness = createBreakdownTestHarness();
    const parentMilestoneId = "parent-ms-1" as any;

    const msIds = new SequenceMilestoneIdGenerator();
    msIds.milestone = () => parentMilestoneId;

    const invalidChild = MilestoneEditor.create(
      {
        profile: childMilestoneProfile,
        definition: { title: "Invalid Child" },
      },
      {
        clock: harness.clock,
        ids: msIds,
      },
    ).milestone;

    const editor = BreakdownEditor.create(
      {
        parentMilestoneId,
        definition: { title: "Invalid Plan" },
      },
      harness,
    );

    expect(() => {
      editor.milestones.add(invalidChild);
    }).toThrow(MilestoneDomainError);

    expect(() => {
      editor.milestones.replace("ms-dummy" as any, invalidChild);
    }).toThrow(MilestoneDomainError);
  });

  it("detects recursive breakdown hierarchy cycles", () => {
    const breakdownA = {
      id: "b-1" as any,
      parentMilestoneId: "ms-A" as any,
      definition: { title: "Plan A" },
      milestones: [{ id: "ms-B" as any } as any],
      sequence: 1,
      createdAt: "2026-08-20T12:00:00.000Z",
    };
    const breakdownB = {
      id: "b-2" as any,
      parentMilestoneId: "ms-B" as any,
      definition: { title: "Plan B" },
      milestones: [{ id: "ms-C" as any } as any],
      sequence: 1,
      createdAt: "2026-08-20T12:00:00.000Z",
    };
    const breakdownC = {
      id: "b-3" as any,
      parentMilestoneId: "ms-C" as any,
      definition: { title: "Plan C" },
      milestones: [{ id: "ms-A" as any } as any],
      sequence: 1,
      createdAt: "2026-08-20T12:00:00.000Z",
    };

    const snapshot = {
      breakdowns: new Map([
        ["b-1" as any, breakdownA],
        ["b-2" as any, breakdownB],
        ["b-3" as any, breakdownC],
      ]),
    };

    const cycles = detectBreakdownCycles(snapshot);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles[0]!.length).toBeGreaterThan(1);

    const issues = validateBreakdownHierarchy(snapshot);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.code).toBe("breakdown_hierarchy_cycle");

    expect(() => {
      assertValidBreakdownHierarchy(snapshot);
    }).toThrow(MilestoneDomainError);
  });

  it("confirms Breakdown is NOT an execution unit and does not auto-complete parent", () => {
    const harness = createBreakdownTestHarness();
    const msHarness = { clock: harness.clock, ids: new SequenceMilestoneIdGenerator() };

    const child = MilestoneEditor.create(
      {
        profile: childMilestoneProfile,
        definition: { title: "Independent Child" },
      },
      msHarness,
    ).milestone;

    const childEditor = new MilestoneEditor(child, childMilestoneProfile, msHarness);
    childEditor.accept();
    childEditor.complete();
    const completedChild = childEditor.commit().milestone;
    expect(completedChild.currentCompletionId).toBeDefined();

    // Breakdown merely holds the child milestone
    const breakdownEditor = BreakdownEditor.create(
      {
        parentMilestoneId: "parent-ms-99" as any,
        definition: { title: "Plan Holding Completed Child" },
        milestones: [completedChild],
      },
      harness,
    );
    expect(breakdownEditor.milestones.list()[0]!.currentCompletionId).toBeDefined();
  });
});
