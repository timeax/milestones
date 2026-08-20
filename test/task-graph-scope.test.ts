import { describe, expect, it } from "vitest";
import {
  MilestoneDomainError,
  assertValidBreakdownHierarchy,
  assertValidTaskGraph,
  assertValidTaskScopeGraph,
  createTaskGraphSnapshot,
  detectBreakdownCycles,
  detectTaskGraphCycles,
  detectTaskScopeCycles,
  evaluateTaskDependencies,
  evaluateTaskDependency,
  graphNodeFromTask,
  validateBreakdownHierarchy,
  validateTaskGraph,
  validateTaskScopeGraph,
  type Breakdown,
  type BreakdownHierarchySnapshot,
  type ExecutionDependencyResolver,
  type Task,
  type TaskDependency,
  type TaskGraphSnapshot,
  type TaskScopeGraphSnapshot,
  FixedTaskClock,
  SequenceTaskIdGenerator,
  TaskEditor,
  type TaskProfile,
} from "../src/index.js";

describe("Task Graph & Scope Hierarchy", () => {
  it("evaluates mixed dependencies targeting tasks and milestones", () => {
    const depOnCompletedMilestone: TaskDependency = {
      id: "dep-1" as any,
      taskId: "task-1" as any,
      dependsOn: { type: "milestone", id: "ms-1" as any },
      gate: { type: "completed" },
      blocking: true,
    };

    const depOnAcceptedTask: TaskDependency = {
      id: "dep-2" as any,
      taskId: "task-1" as any,
      dependsOn: { type: "task", id: "task-2" as any },
      gate: { type: "accepted" },
      blocking: true,
    };

    const depOnCriterion: TaskDependency = {
      id: "dep-3" as any,
      taskId: "task-1" as any,
      dependsOn: { type: "task", id: "task-2" as any },
      gate: { type: "criterion", criterionId: "c-1" as any, requiredState: "verified" },
      blocking: true,
    };

    const depOnDeliverable: TaskDependency = {
      id: "dep-4" as any,
      taskId: "task-1" as any,
      dependsOn: { type: "milestone", id: "ms-1" as any },
      gate: { type: "deliverable", deliverableRequirementId: "d-1" as any, requiredState: "satisfied" },
      blocking: true,
    };

    const snapshot: TaskGraphSnapshot = {
      tasks: new Map([
        [
          "task-2" as any,
          {
            id: "task-2" as any,
            revisionId: "rev-2" as any,
            gates: {
              criteria: new Map([["c-1" as any, { state: "verified" }]]),
              deliverables: new Map(),
              accepted: true,
              completed: false,
            },
          },
        ],
      ]),
      milestones: new Map([
        [
          "ms-1" as any,
          {
            id: "ms-1" as any,
            revisionId: "rev-1" as any,
            gates: {
              criteria: new Map(),
              deliverables: new Map([["d-1" as any, { state: "satisfied" }]]),
              accepted: true,
              completed: true,
            },
          },
        ],
      ]),
      dependencies: [depOnCompletedMilestone, depOnAcceptedTask, depOnCriterion, depOnDeliverable],
    };

    expect(evaluateTaskDependency(depOnCompletedMilestone, snapshot)).toBe(true);
    expect(evaluateTaskDependency(depOnAcceptedTask, snapshot)).toBe(true);
    expect(evaluateTaskDependency(depOnCriterion, snapshot)).toBe(true);
    expect(evaluateTaskDependency(depOnDeliverable, snapshot)).toBe(true);

    const resolver: ExecutionDependencyResolver = {
      getMilestone: (id: any) => snapshot.milestones?.get(id),
      getTask: (id: any) => snapshot.tasks.get(id),
    };
    expect(evaluateTaskDependency(depOnCompletedMilestone, resolver)).toBe(true);
    expect(evaluateTaskDependency(depOnCriterion, resolver)).toBe(true);

    const dummyTask = {
      dependencies: [depOnCompletedMilestone, depOnAcceptedTask, depOnCriterion, depOnDeliverable],
    } as unknown as Task;

    const result = evaluateTaskDependencies(dummyTask, snapshot);
    expect(result.reasons.length).toBe(0);
    expect(result.snapshots.every((s) => s.satisfied)).toBe(true);
  });

  it("validates task graph issues comprehensively", () => {
    const invalidSnapshot: TaskGraphSnapshot = {
      tasks: new Map([
        [
          "t-1" as any,
          {
            id: "t-1" as any,
            revisionId: "rev-1" as any,
            gates: { criteria: new Map(), deliverables: new Map(), accepted: false, completed: false },
          },
        ],
      ]),
      milestones: new Map([
        [
          "m-1" as any,
          {
            id: "m-1" as any,
            revisionId: "rev-1" as any,
            gates: { criteria: new Map(), deliverables: new Map(), accepted: false, completed: false },
          },
        ],
      ]),
      dependencies: [
        {
          id: "d-self" as any,
          taskId: "t-1" as any,
          dependsOn: { type: "task", id: "t-1" as any },
          gate: { type: "completed" },
          blocking: true,
        },
        {
          id: "d-missing-task" as any,
          taskId: "t-1" as any,
          dependsOn: { type: "task", id: "t-missing" as any },
          gate: { type: "completed" },
          blocking: true,
        },
        {
          id: "d-missing-ms" as any,
          taskId: "t-1" as any,
          dependsOn: { type: "milestone", id: "m-missing" as any },
          gate: { type: "completed" },
          blocking: true,
        },
        {
          id: "d-missing-crit" as any,
          taskId: "t-1" as any,
          dependsOn: { type: "task", id: "t-1" as any },
          gate: { type: "criterion", criterionId: "c-missing" as any, requiredState: "verified" },
          blocking: true,
        },
        {
          id: "d-missing-ms-crit" as any,
          taskId: "t-1" as any,
          dependsOn: { type: "milestone", id: "m-1" as any },
          gate: { type: "criterion", criterionId: "c-missing" as any, requiredState: "verified" },
          blocking: true,
        },
        {
          id: "d-missing-deliv" as any,
          taskId: "t-1" as any,
          dependsOn: { type: "milestone", id: "m-1" as any },
          gate: { type: "deliverable", deliverableRequirementId: "d-missing" as any, requiredState: "satisfied" },
          blocking: true,
        },
        {
          id: "d-dup-1" as any,
          taskId: "t-1" as any,
          dependsOn: { type: "milestone", id: "m-1" as any },
          gate: { type: "completed" },
          blocking: true,
        },
        {
          id: "d-dup-2" as any,
          taskId: "t-1" as any,
          dependsOn: { type: "milestone", id: "m-1" as any },
          gate: { type: "completed" },
          blocking: true,
        },
      ],
    };

    const issues = validateTaskGraph(invalidSnapshot);
    expect(issues.length).toBeGreaterThan(0);
    expect(() => assertValidTaskGraph(invalidSnapshot)).toThrow(MilestoneDomainError);
  });

  it("detects task dependency graph cycles", () => {
    // task-1 -> task-2 -> task-1
    const dep1: TaskDependency = {
      id: "d-1" as any,
      taskId: "task-1" as any,
      dependsOn: { type: "task", id: "task-2" as any },
      gate: { type: "completed" },
      blocking: true,
    };
    const dep2: TaskDependency = {
      id: "d-2" as any,
      taskId: "task-2" as any,
      dependsOn: { type: "task", id: "task-1" as any },
      gate: { type: "completed" },
      blocking: true,
    };

    const snapshot: TaskGraphSnapshot = {
      tasks: new Map([
        ["task-1" as any, { id: "task-1" as any, revisionId: "rev-1" as any, gates: { criteria: new Map(), deliverables: new Map(), accepted: false, completed: false } }],
        ["task-2" as any, { id: "task-2" as any, revisionId: "rev-2" as any, gates: { criteria: new Map(), deliverables: new Map(), accepted: false, completed: false } }],
      ]),
      dependencies: [dep1, dep2],
    };

    const cycles = detectTaskGraphCycles(snapshot);
    expect(cycles.length).toBeGreaterThan(0);

    const issues = validateTaskGraph(snapshot);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.code).toBe("dependency_cycle");

    expect(() => {
      assertValidTaskGraph(snapshot);
    }).toThrow(MilestoneDomainError);
  });

  it("detects task scope hierarchy cycles and missing scope targets", () => {
    const task1 = {
      id: "task-1" as any,
      scope: { type: "task", taskId: "task-2" as any },
    } as Task;
    const task2 = {
      id: "task-2" as any,
      scope: { type: "task", taskId: "task-3" as any },
    } as Task;
    const task3 = {
      id: "task-3" as any,
      scope: { type: "task", taskId: "task-1" as any },
    } as Task;
    const taskSelf = {
      id: "task-self" as any,
      scope: { type: "task", taskId: "task-self" as any },
    } as Task;
    const taskMissing = {
      id: "task-missing" as any,
      scope: { type: "milestone", milestoneId: "ms-missing" as any },
    } as Task;

    const snapshot: TaskScopeGraphSnapshot = {
      tasks: new Map([
        ["task-1" as any, task1],
        ["task-2" as any, task2],
        ["task-3" as any, task3],
        ["task-self" as any, taskSelf],
        ["task-missing" as any, taskMissing],
      ]),
    };

    const cycles = detectTaskScopeCycles(snapshot);
    expect(cycles.length).toBeGreaterThan(0);

    const issues = validateTaskScopeGraph(snapshot);
    expect(issues.length).toBeGreaterThan(0);

    expect(() => {
      assertValidTaskScopeGraph(snapshot);
    }).toThrow(MilestoneDomainError);
  });

  it("validates Breakdown hierarchy and detects cycles and collisions", () => {
    const breakdownA = {
      id: "bd-A" as any,
      parentMilestoneId: "ms-1" as any,
      milestones: [{ id: "ms-2" as any } as any],
    } as unknown as Breakdown;

    const breakdownB = {
      id: "bd-B" as any,
      parentMilestoneId: "ms-2" as any,
      milestones: [{ id: "ms-1" as any } as any], // Cycle ms-1 -> ms-2 -> ms-1
    } as unknown as Breakdown;

    const snapshot: BreakdownHierarchySnapshot = {
      breakdowns: new Map([
        ["bd-A" as any, breakdownA],
        ["bd-B" as any, breakdownB],
      ]),
    };

    const cycles = detectBreakdownCycles(snapshot);
    expect(cycles.length).toBeGreaterThan(0);

    const issues = validateBreakdownHierarchy(snapshot);
    expect(issues.length).toBeGreaterThan(0);
    expect(() => assertValidBreakdownHierarchy(snapshot)).toThrow(MilestoneDomainError);

    // Collision & duplicate child without cycle
    const breakdownCollision: Breakdown = {
      id: "bd-col" as any,
      parentMilestoneId: "ms-parent" as any,
      definition: { title: "Collision BD" },
      milestones: [
        { id: "ms-parent" as any } as any, // Collision with parent!
        { id: "ms-dup" as any } as any,
        { id: "ms-dup" as any } as any, // Duplicate child!
      ],
      sequence: 1,
      createdAt: "2026-08-20T12:00:00.000Z",
    };
    const snapCollision: BreakdownHierarchySnapshot = {
      breakdowns: new Map([["bd-col" as any, breakdownCollision]]),
    };
    const issuesCol = validateBreakdownHierarchy(snapCollision);
    expect(issuesCol.some((i) => i.code === "parent_milestone_id_collision")).toBe(true);
    expect(issuesCol.some((i) => i.code === "duplicate_child_milestone")).toBe(true);
    expect(() => assertValidBreakdownHierarchy(snapCollision)).toThrow(MilestoneDomainError);

    // Duplicate child only (triggers INVALID_ARGUMENT error code)
    const breakdownDupOnly: Breakdown = {
      id: "bd-dup" as any,
      parentMilestoneId: "ms-parent-safe" as any,
      definition: { title: "Dup BD" },
      milestones: [
        { id: "ms-child-1" as any } as any,
        { id: "ms-child-1" as any } as any,
      ],
      sequence: 1,
      createdAt: "2026-08-20T12:00:00.000Z",
    };
    const snapDup = { breakdowns: new Map([["bd-dup" as any, breakdownDupOnly]]) };
    expect(() => assertValidBreakdownHierarchy(snapDup)).toThrowError(/Invalid breakdown hierarchy/);
  });

  it("evaluates unsatisfied blocking task dependencies and generates reasons", () => {
    const task: Task = {
      id: "t-consumer" as any,
      currentRevisionId: "rev-1" as any,
      dependencies: [
        {
          id: "dep-blocking" as any,
          taskId: "t-consumer" as any,
          dependsOn: { type: "task", id: "t-provider" as any },
          gate: { type: "completed" },
          blocking: true,
        },
      ],
    } as any;

    const graph: TaskGraphSnapshot = {
      tasks: new Map([
        ["t-consumer" as any, { id: "t-consumer" as any, revisionId: "rev-1" as any, gates: { criteria: new Map(), deliverables: new Map(), accepted: false, completed: false } }],
        ["t-provider" as any, { id: "t-provider" as any, revisionId: "rev-1" as any, gates: { criteria: new Map(), deliverables: new Map(), accepted: false, completed: false } }],
      ]),
      dependencies: [],
    };

    const result = evaluateTaskDependencies(task, graph);
    expect(result.snapshots[0]?.satisfied).toBe(false);
    expect(result.reasons.length).toBe(1);
    expect(result.reasons[0]?.code).toBe("unsatisfied_dependency");
  });

  it("creates TaskGraphNode from Task instance using graphNodeFromTask", () => {
    const task = {
      id: "task-demo" as any,
      currentRevisionId: "rev-1" as any,
      criteria: [{ id: "c-1" as any, state: "verified" as const }],
      deliverables: [{ id: "d-1" as any, state: "satisfied" as const }],
      currentAcceptanceId: "acc-1" as any,
      currentCompletionId: "comp-1" as any,
    } as unknown as Task;

    const node = graphNodeFromTask(task);
    expect(node.id).toBe("task-demo");
    expect(node.gates.accepted).toBe(true);
    expect(node.gates.completed).toBe(true);
    expect(node.gates.criteria.get("c-1" as any)?.state).toBe("verified");
    expect(node.gates.deliverables.get("d-1" as any)?.state).toBe("satisfied");

    const snapshot = createTaskGraphSnapshot([task], []);
    expect(snapshot.tasks.has("task-demo" as any)).toBe(true);
  });

  it("tests TaskGraph validation with missing task node and missing deliverable gate", () => {
    const graph: TaskGraphSnapshot = {
      tasks: new Map([
        [
          "t-1" as any,
          {
            id: "t-1" as any,
            revisionId: "rev-1" as any,
            gates: { criteria: new Map(), deliverables: new Map(), accepted: true, completed: true },
          },
        ],
      ]),
      dependencies: [
        {
          id: "dep-missing-task" as any,
          taskId: "t-absent" as any, // Missing from graph.tasks
          dependsOn: { type: "task", id: "t-1" as any },
          gate: { type: "completed" },
          blocking: true,
        },
        {
          id: "dep-missing-deliv" as any,
          taskId: "t-1" as any,
          dependsOn: { type: "task", id: "t-1" as any },
          gate: { type: "deliverable", deliverableRequirementId: "deliv-absent" as any, requiredState: "satisfied" }, // Missing deliverable
          blocking: true,
        },
      ],
    };

    const issues = validateTaskGraph(graph);
    expect(issues.some((i) => i.code === "missing_graph_node")).toBe(true);
    expect(issues.some((i) => i.code === "missing_gate_target")).toBe(true);
  });

  it("exercises TaskEditor.reopen and revision creation", () => {
    const clock = new FixedTaskClock("2026-08-20T12:00:00.000Z");
    const ids = new SequenceTaskIdGenerator();

    const profile: TaskProfile = {
      ref: { id: "p-reopen" as any, version: 1 },
      criteria: { enabled: true },
      deliverables: { enabled: true },
      dependencies: { enabled: false, participatesInGraph: false },
      revisions: { enabled: true },
      challenges: { enabled: true },
      reviews: { enabled: false, required: false },
      approvals: { enabled: false, required: false },
      completion: { enabled: true, requiresAcceptance: true, closeImmediatelyOnAcceptance: false },
    };

    const editor = TaskEditor.create(
      {
        profile,
        scope: { type: "project", projectId: "p-rep" },
        definition: { title: "Reopen Task" },
      },
      { clock, ids },
    );

    editor.accept();
    editor.complete();
    expect(editor.task.currentAcceptanceId).toBeDefined();
    expect(editor.task.currentCompletionId).toBeDefined();

    // Reopen task
    editor.reopen({
      reason: "Requirements changed",
      effect: "invalidate_acceptance_and_completion",
      actor: { id: "lead", type: "user" },
    });
    expect(editor.task.currentAcceptanceId).toBeUndefined();
    expect(editor.task.currentCompletionId).toBeUndefined();

    // Begin new revision
    const rev2Id = editor.revisions.begin("Rev 2 with expanded scope", { id: "lead", type: "user" });
    expect(editor.task.revisions.length).toBe(2);
    expect(editor.task.currentRevisionId).toBe(rev2Id);

    // Apply profile update
    const updatedProfile: TaskProfile = {
      ...profile,
      ref: { id: "p-reopen" as any, version: 2 },
      reviews: { enabled: true, required: false },
    };
    editor.revisions.applyProfile(updatedProfile, "Enable reviews", { id: "lead", type: "user" });
    expect(editor.task.profile.version).toBe(2);
  });
});
