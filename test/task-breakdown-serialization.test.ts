import { describe, expect, it } from "vitest";
import {
  FixedBreakdownClock,
  FixedTaskClock,
  MilestoneEditor,
  SequenceMilestoneIdGenerator,
  SequenceTaskIdGenerator,
  TaskEditor,
  deserializeBreakdown,
  deserializeBreakdownEvents,
  deserializeBreakdownJson,
  deserializeTask,
  deserializeTaskEvents,
  deserializeTaskGraph,
  deserializeTaskJson,
  migrateAndDeserializeBreakdown,
  migrateAndDeserializeTask,
  migrateBreakdownWire,
  migrateTaskWire,
  serializeBreakdown,
  serializeBreakdownEvents,
  serializeBreakdownJson,
  serializeTask,
  serializeTaskEvents,
  serializeTaskGraph,
  serializeTaskJson,
  type Breakdown,
  type BreakdownEvent,
  type MilestoneProfile,
  type TaskGraphSnapshot,
  type TaskProfile,
} from "../src/index.js";

const testTaskProfile: TaskProfile = {
  ref: { id: "profile-task-ser" as any, version: 1 },
  criteria: { enabled: true },
  deliverables: { enabled: true },
  dependencies: { enabled: true, participatesInGraph: true },
  revisions: { enabled: true },
  challenges: { enabled: true },
  reviews: { enabled: false, required: false },
  approvals: { enabled: false, required: false },
  completion: {
    enabled: true,
    requiresAcceptance: true,
    closeImmediatelyOnAcceptance: false,
  },
};

const testMilestoneProfile: MilestoneProfile = {
  ref: { id: "profile-ms-ser" as any, version: 1 },
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

describe("Task & Breakdown Serialization & Migrations", () => {
  it("serializes and deserializes Task wire and JSON representations accurately", () => {
    const clock = new FixedTaskClock("2026-08-20T12:00:00.000Z");
    const ids = new SequenceTaskIdGenerator();

    const taskResult = TaskEditor.create(
      {
        profile: testTaskProfile,
        scope: { type: "project", projectId: "proj-ser" },
        definition: { title: "Serialization Task", description: "Test wire 1.0" },
        timing: { startsAt: "2026-08-20T12:00:00.000Z", dueAt: "2026-08-25T12:00:00.000Z" },
        reminders: [{ trigger: { type: "at", date: "2026-08-24T12:00:00.000Z" } }],
      },
      { clock, ids },
    ).commit();

    const wire = serializeTask(taskResult.task);
    expect(wire.schemaVersion).toBe("1.0");
    expect(wire.id).toBe(taskResult.task.id);
    expect(wire.timing?.startsAt).toBe("2026-08-20T12:00:00.000Z");
    expect(wire.reminders.length).toBe(1);

    const deserialized = deserializeTask(wire);
    expect(deserialized.id).toBe(taskResult.task.id);
    expect(deserialized.definition.title).toBe("Serialization Task");

    const json = serializeTaskJson(taskResult.task);
    expect(typeof json).toBe("string");
    const fromJson = deserializeTaskJson(json);
    expect(fromJson.id).toBe(taskResult.task.id);

    // Events serialization
    const eventsJson = serializeTaskEvents(taskResult.events);
    const fromEventsJson = deserializeTaskEvents(eventsJson);
    expect(fromEventsJson.length).toBe(taskResult.events.length);

    // Migration
    const migrationResult = migrateTaskWire(wire);
    expect(migrationResult.toVersion).toBe("1.0");
    const migratedTask = migrateAndDeserializeTask(wire);
    expect(migratedTask.id).toBe(taskResult.task.id);
  });

  it("serializes and deserializes Breakdown wire and JSON with nested Milestone wires", () => {
    const clock = new FixedBreakdownClock("2026-08-20T12:00:00.000Z");
    const child = MilestoneEditor.create(
      {
        profile: testMilestoneProfile,
        definition: { title: "Child for breakdown wire" },
      },
      { clock, ids: new SequenceMilestoneIdGenerator() },
    ).milestone;

    const breakdown: Breakdown = {
      id: "bd-ser-1" as any,
      parentMilestoneId: "parent-ms-ser" as any,
      definition: { title: "Breakdown Serialization" },
      milestones: [child],
      sequence: 1,
      createdAt: "2026-08-20T12:00:00.000Z",
    };

    const wire = serializeBreakdown(breakdown);
    expect(wire.schemaVersion).toBe("1.0");
    expect(wire.id).toBe("bd-ser-1");
    expect(wire.milestones.length).toBe(1);
    expect(wire.milestones[0]!.schemaVersion).toBe("1.2");

    const deserialized = deserializeBreakdown(wire);
    expect(deserialized.id).toBe("bd-ser-1");
    expect(deserialized.milestones[0]!.id).toBe(child.id);

    const json = serializeBreakdownJson(breakdown);
    const fromJson = deserializeBreakdownJson(json);
    expect(fromJson.id).toBe("bd-ser-1");

    const event: BreakdownEvent = {
      id: "ev-1" as any,
      type: "breakdown.created",
      breakdownId: "bd-ser-1" as any,
      sequence: 1,
      occurredAt: "2026-08-20T12:00:00.000Z",
      payload: { parentMilestoneId: "parent-ms-ser" as any },
    };
    const eventsJson = serializeBreakdownEvents([event]);
    const fromEventsJson = deserializeBreakdownEvents(eventsJson);
    expect(fromEventsJson.length).toBe(1);

    // Migration
    const migrationResult = migrateBreakdownWire(wire);
    expect(migrationResult.toVersion).toBe("1.0");
    const migratedBreakdown = migrateAndDeserializeBreakdown(wire);
    expect(migratedBreakdown.id).toBe("bd-ser-1");
  });

  it("serializes and deserializes TaskGraphSnapshot with tasks and milestones", () => {
    const graph: TaskGraphSnapshot = {
      tasks: new Map([
        [
          "t-1" as any,
          {
            id: "t-1" as any,
            revisionId: "rev-1" as any,
            gates: {
              criteria: new Map([["c-1" as any, { state: "verified" as const }]]),
              deliverables: new Map([["d-1" as any, { state: "satisfied" as const }]]),
              accepted: true,
              completed: true,
            },
          },
        ],
      ]),
      milestones: new Map([
        [
          "ms-1" as any,
          {
            id: "ms-1" as any,
            revisionId: "mrev-1" as any,
            gates: {
              criteria: new Map(),
              deliverables: new Map(),
              accepted: true,
              completed: true,
            },
          },
        ],
      ]),
      dependencies: [
        {
          id: "dep-1" as any,
          taskId: "t-1" as any,
          dependsOn: { type: "milestone", id: "ms-1" as any },
          gate: { type: "completed" },
          blocking: true,
        },
      ],
    };

    const wire = serializeTaskGraph(graph);
    expect(wire.schemaVersion).toBe("1.0");
    expect(wire.tasks.length).toBe(1);
    expect(wire.milestones?.length).toBe(1);

    const deserialized = deserializeTaskGraph(wire);
    expect(deserialized.tasks.get("t-1" as any)?.gates.accepted).toBe(true);
    expect(deserialized.milestones?.get("ms-1" as any)?.gates.completed).toBe(true);
  });

  it("throws MIGRATION_UNSUPPORTED for unknown task and breakdown wire schema versions", () => {
    expect(() => migrateTaskWire({ schemaVersion: "0.9", id: "t1" })).toThrow();
    expect(() => migrateBreakdownWire({ schemaVersion: "0.9", id: "b1" })).toThrow();
  });

  it("throws SERIALIZATION_INVALID for malformed JSON strings", () => {
    expect(() => deserializeTaskEvents("{ invalid json")).toThrow();
    expect(() => deserializeBreakdownEvents("{ invalid json")).toThrow();
    expect(() => deserializeTaskJson("{ invalid json")).toThrow();
    expect(() => deserializeBreakdownJson("{ invalid json")).toThrow();
  });
});
