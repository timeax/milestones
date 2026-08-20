import { describe, expect, it } from "vitest";
import {
  FixedTaskClock,
  SequenceTaskIdGenerator,
  TaskEditor,
  type TaskProfile,
} from "../src/index.js";

function createHarness() {
  const clock = new FixedTaskClock("2026-08-20T12:00:00.000Z");
  const ids = new SequenceTaskIdGenerator();
  return { clock, ids };
}

const fullProfile: TaskProfile = {
  ref: { id: "profile-cov" as any, version: 1 },
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

describe("Task Sub-Editors Coverage", () => {
  it("exercises TaskDependencyEditor thoroughly", () => {
    const harness = createHarness();
    const actor = { id: "dev-1", type: "user" };

    const editor = TaskEditor.create(
      {
        profile: fullProfile,
        scope: { type: "project", projectId: "p-cov" },
        definition: { title: "Dep Test Task" },
        actor,
      },
      harness,
    );

    // Add milestone dependency
    const dep1Id = editor.dependencies.add(
      {
        dependsOn: { type: "milestone", id: "ms-upstream" as any },
        gate: { type: "completed" },
        blocking: true,
      },
      actor,
    );
    expect(editor.dependencies.has(dep1Id)).toBe(true);
    expect(editor.dependencies.get(dep1Id)?.dependsOn.id).toBe("ms-upstream");
    expect(editor.dependencies.list().length).toBe(1);

    // Add task dependency
    const dep2Id = editor.dependencies.add(
      {
        dependsOn: { type: "task", id: "task-upstream" as any },
        gate: { type: "accepted" },
        blocking: false,
      },
      actor,
    );
    expect(editor.dependencies.list().length).toBe(2);

    // Replace dependency
    editor.dependencies.replace(
      dep1Id,
      {
        dependsOn: { type: "milestone", id: "ms-upstream-2" as any },
        gate: { type: "accepted" },
        blocking: true,
      },
      actor,
    );
    expect(editor.dependencies.get(dep1Id)?.dependsOn.id).toBe("ms-upstream-2");

    // Remove dependency
    editor.dependencies.remove(dep2Id, actor);
    expect(editor.dependencies.has(dep2Id)).toBe(false);
    expect(editor.dependencies.list().length).toBe(1);

    // Clear dependencies
    editor.dependencies.clear(actor);
    expect(editor.dependencies.list().length).toBe(0);
  });

  it("exercises TaskTimingEditor thoroughly", () => {
    const harness = createHarness();
    const actor = { id: "dev-1", type: "user" };

    const editor = TaskEditor.create(
      {
        profile: fullProfile,
        scope: { type: "project", projectId: "p-timing" },
        definition: { title: "Timing Test Task" },
      },
      harness,
    );

    editor.timing.setStart("2026-08-20T10:00:00.000Z", actor);
    expect(editor.task.timing?.startsAt).toBe("2026-08-20T10:00:00.000Z");

    editor.timing.setDue("2026-08-25T10:00:00.000Z", actor);
    expect(editor.task.timing?.dueAt).toBe("2026-08-25T10:00:00.000Z");

    editor.timing.setTimeZone("America/New_York", actor);
    expect(editor.task.timing?.timeZone).toBe("America/New_York");

    editor.timing.setRange(
      {
        startsAt: "2026-08-21T00:00:00.000Z",
        dueAt: "2026-08-28T00:00:00.000Z",
        timeZone: "UTC",
      },
      actor,
    );
    expect(editor.task.timing?.startsAt).toBe("2026-08-21T00:00:00.000Z");
    expect(editor.task.timing?.dueAt).toBe("2026-08-28T00:00:00.000Z");
    expect(editor.task.timing?.timeZone).toBe("UTC");

    editor.timing.clear(actor);
    expect(editor.task.timing).toBeUndefined();
  });

  it("exercises TaskReminderEditor thoroughly", () => {
    const harness = createHarness();
    const actor = { id: "dev-1", type: "user" };

    const editor = TaskEditor.create(
      {
        profile: fullProfile,
        scope: { type: "project", projectId: "p-rem" },
        definition: { title: "Reminders Test Task" },
      },
      harness,
    );

    const r1 = editor.reminders.add({ trigger: { type: "at", date: "2026-08-22T09:00:00.000Z" } }, actor);
    const r2 = editor.reminders.add({ trigger: { type: "before_due", durationMinutes: 120 } }, actor);
    expect(editor.reminders.list().length).toBe(2);
    expect(editor.reminders.has(r1)).toBe(true);
    expect(editor.reminders.has(r2)).toBe(true);

    editor.reminders.update(r1, { trigger: { type: "at", date: "2026-08-23T09:00:00.000Z" } }, actor);
    expect(editor.reminders.get(r1)?.trigger.type).toBe("at");

    editor.reminders.clear(actor);
    expect(editor.reminders.list().length).toBe(0);
  });

  it("exercises Challenges and Evidence on TaskEditor", () => {
    const harness = createHarness();
    const actor = { id: "tester-1", type: "user" };

    const editor = TaskEditor.create(
      {
        profile: fullProfile,
        scope: { type: "project", projectId: "p-chal" },
        definition: { title: "Challenge Test Task" },
        criteria: [{ title: "Crit 1", required: true, state: "pending" as const }],
      },
      harness,
    );

    const critId = editor.task.criteria[0]!.id;

    // Raise challenge against criterion
    const challengeId = editor.challenges.raise(
      { type: "criterion", criterionId: critId },
      "Criterion is ambiguous",
      "blocking",
      actor,
    );
    expect(editor.task.challenges.length).toBe(1);

    // Add supporting evidence
    const evidenceId = editor.evidence.add(
      challengeId,
      {
        kind: "supporting",
        title: "Log snippet",
        description: "Ambiguity reproduced in logs",
      },
      actor,
    );
    expect(editor.task.challenges[0]!.evidence[0]!.id).toBe(evidenceId);

    // Supersede evidence
    const successorId = editor.evidence.supersede(
      evidenceId,
      {
        kind: "supporting",
        title: "New log snippet",
        description: "Better logs",
      },
      actor,
    );
    expect(editor.task.challenges[0]!.evidence.length).toBe(2);

    // Withdraw successor evidence
    editor.evidence.withdraw(successorId, "Outdated logs", actor);
    expect(editor.task.challenges[0]!.evidence.find((e) => e.id === successorId)?.state).toBe("withdrawn");

    // Resolve challenge
    editor.challenges.resolve(
      challengeId,
      "no_effect",
      { summary: "Clarified in meeting", actor },
    );
    expect(editor.task.challenges[0]!.state).toBe("resolved");

    const commitResult = editor.commit();
    expect(commitResult.task.id).toBeDefined();
  });

  it("exercises TaskTimingEditor clearStart, clearDue, and setTimeZone(undefined)", () => {
    const harness = createHarness();
    const actor = { id: "dev-1", type: "user" };

    const editor = TaskEditor.create(
      {
        profile: fullProfile,
        scope: { type: "project", projectId: "p-timing-2" },
        definition: { title: "Timing Test 2" },
        timing: { startsAt: "2026-08-20T10:00:00.000Z", dueAt: "2026-08-25T10:00:00.000Z", timeZone: "UTC" },
      },
      harness,
    );

    editor.timing.clearStart(actor);
    expect(editor.task.timing?.startsAt).toBeUndefined();
    expect(editor.task.timing?.dueAt).toBe("2026-08-25T10:00:00.000Z");

    editor.timing.clearDue(actor);
    expect(editor.task.timing?.dueAt).toBeUndefined();

    editor.timing.setTimeZone(undefined, actor);
    expect(editor.task.timing).toBeUndefined();
  });

  it("exercises TaskReminderEditor remove", () => {
    const harness = createHarness();
    const actor = { id: "dev-1", type: "user" };

    const editor = TaskEditor.create(
      {
        profile: fullProfile,
        scope: { type: "project", projectId: "p-rem-2" },
        definition: { title: "Reminders Test 2" },
      },
      harness,
    );

    const r1 = editor.reminders.add({ trigger: { type: "before_due", durationMinutes: 30 } }, actor);
    expect(editor.reminders.has(r1)).toBe(true);

    editor.reminders.remove(r1, actor);
    expect(editor.reminders.has(r1)).toBe(false);
  });
});
