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
  type MilestoneGraphSnapshot,
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
        { trigger: { type: "before_due", duration: "PT1H" } },
        { trigger: { type: "at", at: "2026-08-24T12:00:00.000Z" } },
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
    expect(doc.getOverview().getProgressPercentage()).toBe(0);
    expect(doc.getOverview().getStartsAt()).toBe("2026-08-20T12:00:00.000Z");
    expect(doc.getOverview().getDueAt()).toBe("2026-08-25T12:00:00.000Z");
    expect(doc.getOverview().getSourceCounts()).toEqual({ direct: 0, total: 0 });
    expect(doc.getAcceptanceStatus().isAccepted()).toBe(false);
    expect(doc.getCompletionStatus().isCompleted()).toBe(false);
    expect(doc.getCriteria()).toBeDefined();
    expect(doc.getDeliverables()).toBeDefined();
    expect(doc.getSources()).toBeDefined();
    expect(doc.getAllSources()).toBeDefined();
    expect(doc.getDependencies().getCount()).toBe(0);
    expect(doc.getReadiness().isReady()).toBe(true);
    expect(doc.getChallenges().getCount()).toBe(0);
    expect(doc.getReviews().getCount()).toBe(0);
    expect(doc.getApprovals().getStages()).toEqual([]);
    expect(doc.getRevisions().getCurrent().id).toBe(task.currentRevisionId);
    expect(doc.getAcceptance().isAccepted()).toBe(false);
    expect(doc.getCompletion().isCompleted()).toBe(false);

    const profileDoc = doc.getProfile();
    expect([
      profileDoc.getId(), profileDoc.getVersion(), profileDoc.hasDependencies(), profileDoc.participatesInGraph(),
      profileDoc.hasRevisions(), profileDoc.hasChallenges(), profileDoc.hasReviews(), profileDoc.requiresReviews(),
      profileDoc.hasApprovals(), profileDoc.requiresApprovals(), profileDoc.hasCompletion(),
      profileDoc.requiresAcceptance(), profileDoc.closeImmediatelyOnAcceptance(),
    ]).toHaveLength(13);
    const definition = doc.getDefinition();
    expect(definition.getKey()).toBeUndefined();
    expect(definition.hasDescription()).toBe(true);
    expect(definition.getMetadata()).toEqual({});
    expect(definition.getMetadataValue("missing")).toBeUndefined();
    expect(definition.hasMetadata("missing")).toBe(false);
    expect(definition.toObject().title).toBe("DOM Query Task");
    const timing = doc.getTiming();
    expect(timing.hasStart()).toBe(true);
    expect(timing.hasDueDate()).toBe(true);
    expect(timing.isScheduled()).toBe(true);
    expect(timing.hasStarted("2026-08-20T12:00:00.000Z")).toBe(true);
    expect(timing.getRemainingMilliseconds("2026-08-24T12:00:00.000Z")).toBe(86_400_000);
    expect(rem1.getId()).toBe(rem1.id);
    expect(rem1.getTrigger().type).toBe("before_due");
    expect(rem1.getCreatedAt()).toBe("2026-08-20T12:00:00.000Z");
    expect(rem1.getMetadata()).toBeUndefined();
    expect(rem1.getScheduledAt(task.timing)).toBe("2026-08-25T11:00:00.000Z");
    expect(rem1.toObject().id).toBe(rem1.id);
    expect(doc.getScope().toObject()).toEqual(task.scope);
    expect(doc.getScope().getParentTaskId()).toBeUndefined();
    const progress = doc.getProgress();
    expect(progress.getCompletedWeight()).toBe(0);
    expect(progress.getTotalWeight()).toBe(2);
    expect(progress.isComplete()).toBe(false);
    expect(progress.toObject().percentage).toBe(0);
    const overview = doc.getOverview();
    expect([
      overview.getId(), overview.getState(), overview.getScope(), overview.getTitle(), overview.getDescription(),
      overview.getSequence(), overview.getCurrentRevisionId(), overview.getCreatedAt(), overview.getUpdatedAt(),
      overview.getProgress(), overview.isBlocked(), overview.isAccepted(), overview.isCompleted(),
      overview.getOpenChallengeCount(), overview.getBlockingChallengeCount(), overview.getRequiredCriterionCount(),
      overview.getSatisfiedRequiredCriterionCount(), overview.getSatisfiedCriterionCount(),
      overview.getRequiredDeliverableCount(), overview.getSatisfiedRequiredDeliverableCount(),
      overview.getSatisfiedDeliverableCount(), overview.getSourceCount(),
    ]).toHaveLength(22);
    const criterionId = task.criteria[0]!.id;
    expect(doc.getCriteria().list()).toHaveLength(1);
    expect(doc.getCriteria().get(criterionId)?.id).toBe(criterionId);
    expect(doc.getCriteria().getRequired()).toHaveLength(1);
    expect(doc.getCriteria().getUnsatisfied()).toHaveLength(1);
    expect(doc.getCriteria().getCount()).toBe(1);
    const deliverableId = task.deliverables[0]!.id;
    expect(doc.getDeliverables().list()).toHaveLength(1);
    expect(doc.getDeliverables().get(deliverableId)?.id).toBe(deliverableId);
    expect(doc.getDeliverables().getRequired()).toHaveLength(1);
    expect(doc.getDeliverables().getUnsatisfied()).toHaveLength(1);
    expect(doc.getDeliverables().getCount()).toBe(1);
    const dependencies = doc.getDependencies();
    expect(dependencies.list()).toEqual([]);
    expect(dependencies.get("missing" as any)).toBeUndefined();
    expect(dependencies.getBlocking()).toEqual([]);
    expect(dependencies.getUnsatisfied()).toEqual([]);
    expect(dependencies.getUnknown()).toEqual([]);
    const readiness = doc.getReadiness();
    expect(readiness.canEvaluate()).toBe(true);
    expect(readiness.isBlocked()).toBe(false);
    expect(readiness.getBlockingDependencyCount()).toBe(0);
    expect(readiness.getBlockingChallengeCount()).toBe(0);
    expect(readiness.getUnknownDependencyCount()).toBe(0);
    expect(readiness.getReasons()).toEqual([]);
    expect(readiness.getDependencies().getCount()).toBe(0);
    for (const sources of [doc.getSources(), doc.getAllSources()]) {
      expect(sources.list()).toEqual([]);
      expect(sources.get("missing")).toBeUndefined();
      expect(sources.getByRole("reference")).toEqual([]);
      expect(sources.getBySubject("task", task.id)).toEqual([]);
      expect(sources.getCount()).toBe(0);
    }
    expect(doc.getChallenges().list()).toEqual([]);
    expect(doc.getChallenges().get("missing" as any)).toBeUndefined();
    expect(doc.getChallenges().getOpen()).toEqual([]);
    expect(doc.getChallenges().getBlocking()).toEqual([]);
    expect(doc.getChallenges().getCurrentRevision()).toEqual([]);
    expect(doc.getReviews().list()).toEqual([]);
    expect(doc.getReviews().get("missing" as any)).toBeUndefined();
    expect(doc.getReviews().getCurrentRevision()).toEqual([]);
    expect(doc.getReviews().getCompleted()).toEqual([]);
    expect(doc.getApprovals().getRecords()).toEqual([]);
    expect(doc.getApprovals().getRecordsForCurrentRevision()).toEqual([]);
    expect(doc.getApprovals().getPendingStages()).toEqual([]);
    expect(doc.getRevisions().list()).toHaveLength(1);
    expect(doc.getRevisions().get(task.currentRevisionId)?.id).toBe(task.currentRevisionId);
    expect(doc.getRevisions().getPrevious()).toBeUndefined();
    expect(doc.getRevisions().getCount()).toBe(1);
    expect(doc.getAcceptance().getCurrent()).toBeUndefined();
    expect(doc.getAcceptance().getHistory()).toEqual([]);
    expect(doc.getAcceptance().getEvaluation().accepted).toBe(false);
    expect(doc.getCompletion().getCurrent()).toBeUndefined();
    expect(doc.getCompletion().getHistory()).toEqual([]);
    expect(doc.getCompletion().getEvaluation().completable).toBe(false);

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
      owner: { id: "planner-dom", type: "user" },
      definition: {
        title: "Breakdown DOM Test",
        description: "Testing BreakdownDocument tree",
      },
      milestones: [child],
    };

    const breakdown = {
      id: "bd-1" as any,
      parentMilestoneId: "parent-ms-dom" as any,
      owner: { id: "planner-dom", type: "user" } as const,
      definition: breakdownInput.definition,
      milestones: [child],
      sequence: 1,
      createdAt: "2026-08-20T12:00:00.000Z",
    };

    const resolver = (_profileRef: any) => testMilestoneProfile;
    const graph: MilestoneGraphSnapshot = {
      milestones: new Map([[child.id, {
        id: child.id,
        revisionId: child.currentRevisionId,
        gates: {
          criteria: new Map(),
          deliverables: new Map(),
          accepted: false,
          completed: false,
        },
      }]]),
      dependencies: [],
    };

    const doc = new BreakdownDocumentBuilder(breakdown)
      .withProfileResolver(resolver)
      .withGraphResolver(() => graph)
      .build();

    expect(doc.getId()).toBe("bd-1");
    expect(doc.getParentMilestoneId()).toBe("parent-ms-dom");
    expect(doc.getOwner()).toEqual({ id: "planner-dom", type: "user" });
    expect(doc.getDefinition().getTitle()).toBe("Breakdown DOM Test");
    expect(doc.getDescription().getText()).toBe("Testing BreakdownDocument tree");
    expect(doc.getMilestoneCount()).toBe(1);
    expect(doc.getProgress().getTotalCount()).toBe(1);
    expect(doc.getProgress().getCompletedCount()).toBe(0);
    expect(doc.getProgress().getAcceptedCount()).toBe(0);
    expect(doc.getProgress().getPercentage()).toBe(0);
    expect(doc.getReadiness().isReady()).toBe(true);
    expect(doc.getReadiness().getIncompleteCount()).toBe(1);
    expect(doc.getReadiness().getBlockedCount()).toBe(0);
    expect(doc.getReadiness().getReadyCount()).toBe(1);
    expect(doc.getReadiness().getUnknownCount()).toBe(0);
    expect(doc.getReadiness().getReadyMilestoneIds()).toEqual([child.id]);

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
    expect(createBreakdownDocument({ breakdown: { ...breakdown, owner: undefined } as any }).getOwner()).toBeUndefined();

    // Direct factory test
    const directDoc = createBreakdownDocument({ breakdown, profileResolver: resolver });
    expect(directDoc.getId()).toBe("bd-1");
  });

  it("derives Breakdown work availability from canonical child dependency readiness", () => {
    const clock = new FixedBreakdownClock("2026-08-22T12:00:00.000Z");
    const ids = new SequenceMilestoneIdGenerator();
    const upstream = MilestoneEditor.create(
      { profile: testMilestoneProfile, definition: { title: "Runnable upstream" } },
      { clock, ids },
    ).milestone;
    const blockedBase = MilestoneEditor.create(
      { profile: testMilestoneProfile, definition: { title: "Blocked downstream" } },
      { clock, ids },
    ).milestone;
    const blockedEditor = new MilestoneEditor(blockedBase, testMilestoneProfile, { clock, ids });
    blockedEditor.dependencies.add(upstream.id, { type: "completed" }, true);
    const blocked = blockedEditor.commit().milestone;
    const node = (milestone: typeof upstream) => ({
      id: milestone.id,
      revisionId: milestone.currentRevisionId,
      gates: {
        criteria: new Map(milestone.criteria.map((criterion) => [criterion.id, { state: criterion.state }])),
        deliverables: new Map(milestone.deliverables.map((deliverable) => [deliverable.id, { state: deliverable.state }])),
        accepted: milestone.currentAcceptanceId !== undefined,
        completed: milestone.currentCompletionId !== undefined,
      },
    });
    const graph: MilestoneGraphSnapshot = {
      milestones: new Map([[upstream.id, node(upstream)], [blocked.id, node(blocked)]]),
      dependencies: blocked.dependencies,
    };
    const breakdown = {
      id: "breakdown-readiness" as any,
      parentMilestoneId: "parent-readiness" as any,
      definition: { title: "Readiness" },
      milestones: [upstream, blocked],
      sequence: 1,
      createdAt: "2026-08-22T12:00:00.000Z",
    };
    const document = createBreakdownDocument({
      breakdown,
      profileResolver: () => testMilestoneProfile,
      graphResolver: () => graph,
    });
    const readiness = document.getReadiness();
    expect(readiness.isReady()).toBe(true);
    expect(readiness.getReadyMilestoneIds()).toEqual([upstream.id]);
    expect(readiness.getBlockedMilestoneIds()).toEqual([blocked.id]);
    expect(readiness.getUnknownMilestoneIds()).toEqual([]);

    const unknown = createBreakdownDocument({ breakdown, profileResolver: () => testMilestoneProfile }).getReadiness();
    expect(unknown.canEvaluate()).toBe(false);
    expect(unknown.isReady()).toBeUndefined();
    expect(unknown.getUnknownCount()).toBe(2);

    const completionEditor = new MilestoneEditor(upstream, testMilestoneProfile, { clock, ids });
    completionEditor.accept();
    completionEditor.complete();
    const completed = completionEditor.commit().milestone;
    const completeBreakdown = { ...breakdown, milestones: [completed] };
    const completeReadiness = createBreakdownDocument({ breakdown: completeBreakdown }).getReadiness();
    expect(completeReadiness.canEvaluate()).toBe(true);
    expect(completeReadiness.isReady()).toBe(false);
    expect(completeReadiness.getIncompleteCount()).toBe(0);
  });
});
