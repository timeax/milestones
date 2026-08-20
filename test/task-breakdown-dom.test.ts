import { describe, expect, it } from "vitest";
import {
  BreakdownDocumentBuilder,
  FixedBreakdownClock,
  FixedTaskClock,
  MilestoneEditor,
  SequenceMilestoneIdGenerator,
  SequenceTaskIdGenerator,
  TaskDocumentBuilder,
  TaskEditor,
  createBreakdownDocument,
  createTaskDocument,
  type CreateBreakdownInput,
  type CreateTaskInput,
  type MilestoneProfile,
  type TaskProfile,
} from "../src/index.js";

const testTaskProfile: TaskProfile = {
  ref: { id: "profile-task" as any, version: 1 },
  criteria: { enabled: true },
  deliverables: { enabled: true },
  dependencies: { enabled: true, participatesInGraph: true },
  revisions: { enabled: true },
  challenges: { enabled: true },
  reviews: { enabled: true, required: true },
  approvals: { enabled: true, required: true },
  completion: {
    enabled: true,
    requiresAcceptance: true,
    closeImmediatelyOnAcceptance: false,
  },
};

const testMilestoneProfile: MilestoneProfile = {
  ref: { id: "profile-ms" as any, version: 1 },
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

describe("Task & Breakdown DOM Read Models", () => {
  it("constructs and queries a TaskDocument across all sub-documents and builders", () => {
    const clock = new FixedTaskClock("2026-08-20T12:00:00.000Z");
    const ids = new SequenceTaskIdGenerator();

    const input: CreateTaskInput = {
      profile: testTaskProfile,
      scope: { type: "project", projectId: "proj-abc" },
      definition: {
        title: "DOM Query Task",
        description: "Verify DOM tree methods",
      },
      timing: {
        startsAt: "2026-08-20T12:00:00.000Z",
        dueAt: "2026-08-25T12:00:00.000Z",
        timeZone: "UTC",
      },
      reminders: [
        { trigger: { type: "before_due", durationMinutes: 60 } },
        { trigger: { type: "at", date: "2026-08-24T12:00:00.000Z" } },
      ],
      criteria: [
        { title: "Task Criterion A", required: true, state: "not_started" as const },
      ],
      deliverables: [
        { title: "Task Deliverable B", required: true, state: "missing" as const },
      ],
    };

    const task = TaskEditor.create(input, { clock, ids }).commit().task;

    const doc = new TaskDocumentBuilder(task, testTaskProfile)
      .withGraph({
        tasks: new Map(),
        dependencies: [],
      })
      .withArtifacts({
        requirements: new Map(),
        artifacts: new Map(),
        versions: new Map(),
        submissions: new Map(),
        verifications: new Map(),
        links: [],
      })
      .build();

    expect(doc.getId()).toBe(task.id);
    expect(doc.getDefinition().getTitle()).toBe("DOM Query Task");
    expect(doc.getDescription().getText()).toBe("Verify DOM tree methods");
    expect(doc.getScope().type).toBe("project");
    expect(doc.getScope().getProjectId()).toBe("proj-abc");
    expect(doc.getTiming().getStartsAt()).toBe("2026-08-20T12:00:00.000Z");
    expect(doc.getTiming().getDueAt()).toBe("2026-08-25T12:00:00.000Z");
    expect(doc.getTiming().getTimeZone()).toBe("UTC");
    expect(doc.getTiming().isOverdue("2026-08-26T12:00:00.000Z")).toBe(true);
    expect(doc.getTiming().isOverdue("2026-08-24T12:00:00.000Z")).toBe(false);
    expect(doc.getTiming().toObject()?.startsAt).toBe("2026-08-20T12:00:00.000Z");
    expect(doc.getReminders().count()).toBe(2);
    expect(doc.getReminders().hasReminders()).toBe(true);
    expect(doc.getReminders().getByTriggerType("at").length).toBe(1);
    expect(doc.getReminders().getByTriggerType("before_due").length).toBe(1);
    const rem1 = doc.getReminders().list()[0]!;
    expect(doc.getReminders().has(rem1.id)).toBe(true);
    expect(doc.getReminders().get(rem1.id)?.id).toBe(rem1.id);
    expect(doc.getReminders().get("rem-missing" as any)).toBeUndefined();
    expect(doc.getProfile().hasCriteria()).toBe(true);
    expect(doc.getProfile().hasDeliverables()).toBe(true);
    expect(doc.getProgress().getPercentage()).toBe(0);
    expect(doc.getAcceptanceStatus().isAccepted()).toBe(false);
    expect(doc.getCompletionStatus().isCompleted()).toBe(false);
    expect(doc.getCriteria()).toBeDefined();
    expect(doc.getDeliverables()).toBeDefined();
    expect(doc.getSources()).toBeDefined();

    // Direct factory test
    const directDoc = createTaskDocument({ task, profile: testTaskProfile });
    expect(directDoc.getId()).toBe(task.id);
  });

  it("tests different Task scope types in TaskScopeDocument", () => {
    const clock = new FixedTaskClock("2026-08-20T12:00:00.000Z");
    const ids = new SequenceTaskIdGenerator();

    const taskMs = TaskEditor.create(
      {
        profile: testTaskProfile,
        scope: { type: "milestone", milestoneId: "ms-scope" as any },
        definition: { title: "MS Scope Task" },
      },
      { clock, ids },
    ).task;
    const docMs = createTaskDocument({ task: taskMs, profile: testTaskProfile });
    expect(docMs.getScope().getMilestoneId()).toBe("ms-scope");

    const taskBd = TaskEditor.create(
      {
        profile: testTaskProfile,
        scope: { type: "breakdown", breakdownId: "bd-scope" as any },
        definition: { title: "BD Scope Task" },
      },
      { clock, ids },
    ).task;
    const docBd = createTaskDocument({ task: taskBd, profile: testTaskProfile });
    expect(docBd.getScope().getBreakdownId()).toBe("bd-scope");

    const taskParent = TaskEditor.create(
      {
        profile: testTaskProfile,
        scope: { type: "task", taskId: "task-parent" as any },
        definition: { title: "Task Scope Task" },
      },
      { clock, ids },
    ).task;
    const docTask = createTaskDocument({ task: taskParent, profile: testTaskProfile });
    expect(docTask.getScope().getTaskId()).toBe("task-parent");
  });

  it("constructs and queries a BreakdownDocument resolving child MilestoneDocuments", () => {
    const clock = new FixedBreakdownClock("2026-08-20T12:00:00.000Z");

    const child = MilestoneEditor.create(
      {
        profile: testMilestoneProfile,
        definition: { title: "Child Milestone in DOM", description: "Child desc" },
      },
      { clock, ids: new SequenceMilestoneIdGenerator() },
    ).milestone;

    const breakdownInput: CreateBreakdownInput = {
      parentMilestoneId: "parent-ms-dom" as any,
      definition: {
        title: "Breakdown DOM Test",
        description: "Testing BreakdownDocument tree",
      },
      milestones: [child],
    };

    const breakdown = {
      id: "bd-1" as any,
      parentMilestoneId: "parent-ms-dom" as any,
      definition: breakdownInput.definition,
      milestones: [child],
      sequence: 1,
      createdAt: "2026-08-20T12:00:00.000Z",
    };

    const resolver = (_profileRef: any) => testMilestoneProfile;

    const doc = new BreakdownDocumentBuilder(breakdown)
      .withProfileResolver(resolver)
      .build();

    expect(doc.getId()).toBe("bd-1");
    expect(doc.getParentMilestoneId()).toBe("parent-ms-dom");
    expect(doc.getDefinition().getTitle()).toBe("Breakdown DOM Test");
    expect(doc.getDescription().getText()).toBe("Testing BreakdownDocument tree");
    expect(doc.getMilestoneCount()).toBe(1);

    const childDocs = doc.getMilestones();
    expect(childDocs.length).toBe(1);
    expect(childDocs[0]!.getId()).toBe(child.id);
    expect(childDocs[0]!.getDefinition().getTitle()).toBe("Child Milestone in DOM");

    const singleChildDoc = doc.getMilestone(child.id);
    expect(singleChildDoc).toBeDefined();
    expect(singleChildDoc!.getId()).toBe(child.id);
    expect(doc.getMilestone("ms-missing" as any)).toBeUndefined();
    expect(doc.getCreatedAt()).toBe("2026-08-20T12:00:00.000Z");
    expect(doc.getUpdatedAt()).toBeUndefined();
    expect(doc.getSequence()).toBe(1);
    expect(doc.toObject().id).toBe("bd-1");

    // BreakdownDocument without profile resolver throws on milestone queries
    const docNoResolver = createBreakdownDocument({ breakdown });
    expect(docNoResolver.getId()).toBe("bd-1");
    expect(() => docNoResolver.getMilestones()).toThrow(/MilestoneProfileResolver is required/);
    expect(() => docNoResolver.getMilestone(child.id)).toThrow(/MilestoneProfileResolver is required/);

    // Direct factory test
    const directDoc = createBreakdownDocument({ breakdown, profileResolver: resolver });
    expect(directDoc.getId()).toBe("bd-1");
  });
});
