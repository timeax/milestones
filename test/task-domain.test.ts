import { describe, expect, it } from "vitest";
import {
  FixedTaskClock,
  MilestoneDomainError,
  SequenceTaskIdGenerator,
  TaskEditor,
  type CreateTaskInput,
  type TaskProfile,
} from "../src/index.js";

function createTestHarness() {
  const clock = new FixedTaskClock("2026-08-20T12:00:00.000Z");
  const ids = new SequenceTaskIdGenerator();
  return { clock, ids };
}

const defaultTaskProfile: TaskProfile = {
  ref: { id: "profile-task-full" as any, version: 1 },
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

describe("Task Domain & TaskEditor", () => {
  it("creates, mutates, and commits a structured Task across all sub-editors", () => {
    const harness = createTestHarness();
    const actor = { id: "actor-1", type: "user" };

    const input: CreateTaskInput = {
      profile: defaultTaskProfile,
      scope: { type: "project", projectId: "proj-100" },
      definition: {
        title: "Implement Task Engine",
        description: "Build domain engine for tasks",
        key: "TASK-1",
        metadata: { priority: "high" },
      },
      timing: {
        startsAt: "2026-08-20T12:00:00.000Z",
        dueAt: "2026-08-25T12:00:00.000Z",
        timeZone: "UTC",
      },
      reminders: [
        { trigger: { type: "before_due", durationMinutes: 60 }, metadata: { channel: "slack" } },
      ],
      criteria: [
        { title: "Criterion 1", required: true, state: "not_started" as const },
      ],
      deliverables: [
        { title: "Deliverable 1", required: true, state: "missing" as const },
      ],
      approvalPolicy: {
        stages: [
          {
            label: "Lead Signoff",
            required: true,
            requiredApprovalCount: 1,
            scope: "milestone",
          },
        ],
      },
      actor,
    };

    const editor = TaskEditor.create(input, harness);
    expect(editor.task.definition.title).toBe("Implement Task Engine");
    expect(editor.task.scope).toEqual({ type: "project", projectId: "proj-100" });
    expect(editor.task.timing?.timeZone).toBe("UTC");
    expect(editor.task.reminders.length).toBe(1);
    expect(editor.task.criteria.length).toBe(1);
    expect(editor.task.deliverables.length).toBe(1);

    // Sub-editor: Definition
    editor.definition.update({ ...editor.task.definition, title: "Evolved Task Engine" }, { actor });
    expect(editor.task.definition.title).toBe("Evolved Task Engine");

    // Sub-editor: Timing
    editor.timing.setDue("2026-08-26T12:00:00.000Z", actor);
    expect(editor.task.timing?.dueAt).toBe("2026-08-26T12:00:00.000Z");
    editor.timing.setTimeZone("Europe/London", actor);
    expect(editor.task.timing?.timeZone).toBe("Europe/London");

    // Sub-editor: Reminders
    const reminderId = editor.reminders.add(
      { trigger: { type: "after_start", durationMinutes: 30 } },
      actor,
    );
    expect(editor.reminders.list().length).toBe(2);
    expect(editor.reminders.has(reminderId)).toBe(true);
    editor.reminders.update(reminderId, { metadata: { notified: true } }, actor);
    expect(editor.reminders.get(reminderId)?.metadata).toEqual({ notified: true });
    editor.reminders.remove(reminderId, actor);
    expect(editor.reminders.has(reminderId)).toBe(false);

    // Sub-editor: Criteria
    const critId = editor.task.criteria[0]!.id;
    editor.criteria.start(critId, actor);
    editor.criteria.submit(critId, actor);
    editor.criteria.verify(critId, actor);
    expect(editor.task.criteria[0]!.state).toBe("verified");

    // Sub-editor: Deliverables
    const delivId = editor.task.deliverables[0]!.id;
    editor.deliverables.submit(delivId, actor);
    editor.deliverables.satisfy(delivId, actor);
    expect(editor.task.deliverables[0]!.state).toBe("satisfied");

    // Sub-editor: Reviews
    const reviewId = editor.reviews.request({
      assignedReviewer: { id: "reviewer-1", type: "user" },
      requestedBy: actor,
    });
    editor.reviews.complete(reviewId, "accepted", {
      summary: "Looks solid",
      completedBy: { id: "reviewer-1", type: "user" },
    });
    expect(editor.task.reviews[0]!.state).toBe("completed");

    // Sub-editor: Approvals
    const stageId = editor.task.approvalPolicy!.stages[0]!.id;
    editor.approvals.grant(stageId, { id: "lead-grant", type: "user" });
    expect(editor.task.approvalRecords.length).toBe(1);

    // Evaluate & Accept
    const acceptEval = editor.evaluateAcceptance();
    expect(acceptEval.reasons).toEqual([]);
    expect(acceptEval.accepted).toBe(true);
    const acceptanceId = editor.accept(actor);
    expect(acceptanceId).toBeDefined();
    expect(editor.task.currentAcceptanceId).toBe(acceptanceId);

    // Complete
    const compEval = editor.evaluateCompletion();
    expect(compEval.completable).toBe(true);
    const completionId = editor.complete(actor);
    expect(completionId).toBeDefined();
    expect(editor.task.currentCompletionId).toBe(completionId);

    // Commit
    const editResult = editor.commit();
    expect(editResult.task.id).toBeDefined();
    expect(editResult.events.length).toBeGreaterThan(0);
    expect(editResult.changes.length).toBeGreaterThan(0);
  });

  it("handles Task reopening and lifecycle invalidation", () => {
    const harness = createTestHarness();
    const actor = { id: "actor-1", type: "user" };

    const editor = TaskEditor.create(
      {
        profile: {
          ...defaultTaskProfile,
          reviews: { enabled: false, required: false },
          approvals: { enabled: false, required: false },
          criteria: { enabled: false },
          deliverables: { enabled: false },
        },
        scope: { type: "task", taskId: "parent-task-1" as any },
        definition: { title: "Subtask 1" },
        actor,
      },
      harness,
    );

    editor.accept(actor);
    editor.complete(actor);
    expect(editor.task.currentCompletionId).toBeDefined();

    // Reopen completion only
    editor.reopen({
      effect: "invalidate_completion",
      reason: "Needs rework",
      actor,
    });
    expect(editor.task.currentCompletionId).toBeUndefined();
    expect(editor.task.currentAcceptanceId).toBeDefined();

    // Reopen acceptance & completion
    editor.reopen({
      effect: "invalidate_acceptance_and_completion",
      reason: "Acceptance invalid",
      actor,
    });
    expect(editor.task.currentAcceptanceId).toBeUndefined();
  });

  it("supports undo, redo, and transactions in TaskEditor", () => {
    const harness = createTestHarness();
    const editor = TaskEditor.create(
      {
        profile: defaultTaskProfile,
        scope: { type: "milestone", milestoneId: "ms-1" as any },
        definition: { title: "Initial Title" },
      },
      harness,
    );

    editor.definition.update({ ...editor.task.definition, title: "Updated Title" });
    expect(editor.task.definition.title).toBe("Updated Title");
    expect(editor.history.canUndo).toBe(true);

    editor.history.undo();
    expect(editor.task.definition.title).toBe("Initial Title");

    editor.history.redo();
    expect(editor.task.definition.title).toBe("Updated Title");

    editor.transact("Batch timing", (tx) => {
      tx.timing.setStart("2026-08-20T10:00:00.000Z");
      tx.timing.setDue("2026-08-25T10:00:00.000Z");
    });
    expect(editor.task.timing?.startsAt).toBe("2026-08-20T10:00:00.000Z");
    expect(editor.task.timing?.dueAt).toBe("2026-08-25T10:00:00.000Z");
  });

  it("rejects invalid timing range where dueAt is before startsAt", () => {
    const harness = createTestHarness();
    const editor = TaskEditor.create(
      {
        profile: defaultTaskProfile,
        scope: { type: "project", projectId: "p-1" },
        definition: { title: "Task with invalid timing" },
      },
      harness,
    );

    expect(() => {
      editor.timing.setRange({
        startsAt: "2026-08-25T10:00:00.000Z",
        dueAt: "2026-08-20T10:00:00.000Z",
      });
    }).toThrow(MilestoneDomainError);
  });
});
