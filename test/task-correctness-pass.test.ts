import type {
  Artifact,
  ArtifactRequirement,
  ArtifactSubmission,
  ArtifactVerification,
  ArtifactVersion,
} from "@elqora/artifacts";
import { describe, expect, it } from "vitest";
import {
  FixedTaskClock,
  SequenceTaskIdGenerator,
  TaskEditor,
  createTaskDocument,
  evaluateTaskAcceptance,
  validateTask,
  type Task,
  type TaskArtifactContext,
  type TaskArtifactLink,
  type TaskEvaluationPolicySnapshot,
  type TaskProfile,
} from "../src/index.js";

const clock = new FixedTaskClock("2026-08-22T00:00:00.000Z");

function profile(requiresAcceptance: boolean): TaskProfile {
  return {
    ref: { id: `correctness-${requiresAcceptance ? "formal" : "direct"}` as never, version: 1 },
    criteria: { enabled: true },
    deliverables: { enabled: true },
    dependencies: { enabled: true, participatesInGraph: true },
    revisions: { enabled: true },
    challenges: { enabled: true },
    reviews: { enabled: true, required: false },
    approvals: { enabled: true, required: false },
    completion: { enabled: true, requiresAcceptance, closeImmediatelyOnAcceptance: false },
  };
}

function emptyFormalTask(): { readonly task: Task; readonly profile: TaskProfile } {
  const taskProfile = profile(true);
  const editor = TaskEditor.create(
    { profile: taskProfile, scope: { type: "project", projectId: "validation" }, definition: { title: "Validation" } },
    { clock, ids: new SequenceTaskIdGenerator() },
  );
  editor.accept();
  editor.complete();
  return { task: editor.commit().task, profile: taskProfile };
}

function artifactContext(links: TaskArtifactLink[] = []): TaskArtifactContext {
  const requirement: ArtifactRequirement = {
    schemaVersion: "1.1",
    id: "requirement-source-boundary",
    targetArtifactId: "artifact-source-boundary",
    required: true,
    createdAt: "2026-08-22T00:00:00.000Z",
  };
  const artifact: Artifact = {
    schemaVersion: "1.1",
    id: "artifact-source-boundary",
    kind: "source-code",
    valueType: "file",
    currentVersionId: "artifact-version-source-boundary",
    createdBy: { id: "author", type: "user" },
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
  };
  const version: ArtifactVersion = {
    schemaVersion: "1.1",
    id: "artifact-version-source-boundary",
    artifactId: artifact.id,
    version: 1,
    source: { type: "inline", value: "const answer = 42;" },
    createdBy: { id: "author", type: "user" },
    createdAt: "2026-08-22T00:00:00.000Z",
  };
  const submission: ArtifactSubmission = {
    schemaVersion: "1.1",
    id: "artifact-submission-source-boundary",
    artifactId: artifact.id,
    artifactVersionId: version.id,
    submittedBy: { id: "author", type: "user" },
    submittedAt: "2026-08-22T00:00:00.000Z",
  };
  const verification: ArtifactVerification = {
    schemaVersion: "1.1",
    id: "artifact-verification-source-boundary",
    artifactId: artifact.id,
    artifactVersionId: version.id,
    submissionId: submission.id,
    status: "verified",
    createdAt: "2026-08-22T00:00:00.000Z",
    verifiedAt: "2026-08-22T00:00:00.000Z",
  };
  return {
    requirements: new Map([[requirement.id, requirement]]),
    artifacts: new Map([[artifact.id, artifact]]),
    versions: new Map([[version.id, version]]),
    submissions: new Map([[submission.id, submission]]),
    verifications: new Map([[verification.id, verification]]),
    links,
  };
}

describe("Task/Breakdown 1.0 correctness pass", () => {
  it("keeps informational Sources out of Artifact Requirement satisfaction", () => {
    const taskProfile = profile(true);
    const context = artifactContext();
    const editor = TaskEditor.create(
      {
        profile: taskProfile,
        scope: { type: "project", projectId: "source-boundary" },
        definition: { title: "Source boundary" },
        criteria: [{ title: "Verified implementation", required: true, state: "verified", artifactRequirementIds: ["requirement-source-boundary"] }],
      },
      { clock, ids: new SequenceTaskIdGenerator(), artifacts: context },
    );
    const criterionId = editor.task.criteria[0]!.id;
    editor.criteria.start(criterionId);
    editor.criteria.submit(criterionId);
    editor.criteria.verify(criterionId);
    editor.sources.attach({
      schemaVersion: "1.1",
      id: "informational-source",
      artifactId: "artifact-source-boundary",
      artifactVersionId: "artifact-version-source-boundary",
      role: "reference",
      subject: { type: "criterion", id: criterionId },
      createdBy: { id: "author", type: "user" },
      createdAt: "2026-08-22T00:00:00.000Z",
    });

    const sourceOnly = evaluateTaskAcceptance(editor.task, taskProfile, undefined, context);
    expect(sourceOnly.accepted).toBe(false);
    expect(sourceOnly.reasons.some((reason) => reason.code === "artifact_submission_missing")).toBe(true);

    const explicitLink: TaskArtifactLink = {
      schemaVersion: "1.1",
      id: "requirement-evidence-link",
      artifactId: "artifact-source-boundary",
      artifactVersionId: "artifact-version-source-boundary",
      role: "evidence",
      subject: { type: "criterion", id: criterionId },
      createdBy: { id: "author", type: "user" },
      createdAt: "2026-08-22T00:00:00.000Z",
    };
    const explicitEvaluation = evaluateTaskAcceptance(editor.task, taskProfile, undefined, artifactContext([explicitLink]));
    expect(explicitEvaluation.reasons).toEqual([]);
    expect(explicitEvaluation.accepted).toBe(true);
  });

  it("preserves custom evaluation policy across ordinary material revisions and replaces it on profile change", () => {
    const taskProfile = profile(false);
    const custom: TaskEvaluationPolicySnapshot = {
      requiredCriteriaMustBeVerified: true,
      requiredDeliverablesMustBeSatisfied: true,
      waivedCriteriaSatisfyRequired: false,
      waivedDeliverablesSatisfyRequired: false,
      blockingChallengesPreventAcceptance: true,
      requiredReviewResult: "accepted",
      requireReviewWhenProfileRequires: false,
      requireApprovalsWhenProfileRequires: false,
      requiresAcceptance: false,
      completionRequiresCurrentAcceptance: false,
      closeImmediatelyOnAcceptance: false,
    };
    const ids = new SequenceTaskIdGenerator();
    let task = TaskEditor.create(
      {
        profile: taskProfile,
        evaluationPolicy: custom,
        scope: { type: "project", projectId: "policy" },
        definition: { title: "Policy" },
        criteria: [{ title: "Criterion", required: true, state: "not_started" }],
        deliverables: [{ title: "Deliverable", required: true, state: "missing" }],
      },
      { clock, ids },
    ).commit().task;
    const assertPolicy = () => expect(task.revisions.at(-1)!.snapshot.evaluationPolicy).toEqual(custom);

    let editor = TaskEditor.open(task, taskProfile, { clock, ids });
    editor.definition.update({ ...task.definition, title: "Policy 2" });
    task = editor.commit().task;
    assertPolicy();

    editor = TaskEditor.open(task, taskProfile, { clock, ids });
    editor.timing.setDue("2026-08-23T00:00:00.000Z");
    task = editor.commit().task;
    assertPolicy();

    editor = TaskEditor.open(task, taskProfile, { clock, ids });
    editor.dependencies.add({ dependsOn: { type: "task", id: "dependency-task" as never }, gate: { type: "completed" }, blocking: true });
    task = editor.commit().task;
    assertPolicy();

    editor = TaskEditor.open(task, taskProfile, { clock, ids });
    editor.criteria.update(task.criteria[0]!.id, { title: "Criterion revised" });
    task = editor.commit().task;
    assertPolicy();

    editor = TaskEditor.open(task, taskProfile, { clock, ids });
    editor.deliverables.update(task.deliverables[0]!.id, { title: "Deliverable revised" });
    task = editor.commit().task;
    assertPolicy();

    editor = TaskEditor.open(task, taskProfile, { clock, ids, artifacts: artifactContext() });
    editor.sources.attach({
      schemaVersion: "1.1",
      id: "policy-specification-source",
      artifactId: "artifact-source-boundary",
      artifactVersionId: "artifact-version-source-boundary",
      subject: { type: "task", id: task.id },
      role: "specification",
      createdBy: { id: "planner", type: "user" },
      createdAt: "2026-08-22T00:00:00.000Z",
    });
    task = editor.commit().task;
    assertPolicy();

    const nextProfile: TaskProfile = { ...taskProfile, ref: { ...taskProfile.ref, version: 2 } };
    editor = TaskEditor.open(task, taskProfile, { clock, ids, artifacts: artifactContext() });
    editor.revisions.applyProfile(nextProfile, "Profile upgraded");
    task = editor.commit().task;
    expect(task.revisions.at(-1)!.snapshot.evaluationPolicy.waivedCriteriaSatisfyRequired).toBe(true);
  });

  it("records immutable direct-completion proof while formal completion relies on acceptance", () => {
    const directProfile = profile(false);
    const ids = new SequenceTaskIdGenerator();
    let editor = TaskEditor.create(
      {
        profile: directProfile,
        scope: { type: "project", projectId: "direct-history" },
        definition: { title: "Direct history" },
        criteria: [{ title: "Done", required: true, state: "verified" }],
      },
      { clock, ids },
    );
    const criterionId = editor.task.criteria[0]!.id;
    editor.criteria.start(criterionId);
    editor.criteria.submit(criterionId);
    editor.criteria.verify(criterionId);
    const firstEvaluation = editor.evaluateCompletion();
    expect(firstEvaluation.evaluationSnapshot?.revisionId).toBe(editor.task.currentRevisionId);
    editor.complete();
    let task = editor.commit().task;
    expect(task.completionRecords[0]!.acceptanceId).toBeUndefined();
    expect(task.completionRecords[0]!.evaluationSnapshot?.criteria[0]?.state).toBe("verified");

    editor = TaskEditor.open(task, directProfile, { clock, ids });
    editor.reopen({ effect: "invalidate_completion", reason: "Rework" });
    editor.definition.update({ ...editor.task.definition, title: "Direct history revised" });
    editor.complete();
    task = editor.commit().task;
    expect(task.completionRecords).toHaveLength(2);
    expect(task.completionRecords[0]!.evaluationSnapshot?.revisionId).not.toBe(task.completionRecords[1]!.evaluationSnapshot?.revisionId);

    const formal = emptyFormalTask().task.completionRecords[0]!;
    expect(formal.acceptanceId).toBeDefined();
    expect(formal.evaluationSnapshot).toBeUndefined();
  });

  it("validates historical snapshots, revocations, and completion topology", () => {
    const { task, profile: taskProfile } = emptyFormalTask();
    const revisionMismatch = structuredClone(task) as Task;
    (revisionMismatch.acceptanceRecords[0]!.snapshot as { revisionId: string }).revisionId = "missing-revision";
    expect(validateTask(revisionMismatch, taskProfile).map((issue) => issue.code)).toContain("acceptance_snapshot_revision_mismatch");

    const missingCompletionRevision = structuredClone(task) as Task;
    (missingCompletionRevision.completionRecords[0] as { taskRevisionId: string }).taskRevisionId = "missing-revision";
    expect(validateTask(missingCompletionRevision, taskProfile).map((issue) => issue.code)).toContain("missing_completion_revision");

    const directProfile = profile(false);
    const directEditor = TaskEditor.create(
      { profile: directProfile, scope: { type: "project", projectId: "invalid-direct" }, definition: { title: "Invalid direct" } },
      { clock, ids: new SequenceTaskIdGenerator() },
    );
    directEditor.complete();
    const missingProof = structuredClone(directEditor.commit().task) as Task;
    delete (missingProof.completionRecords[0] as { evaluationSnapshot?: unknown }).evaluationSnapshot;
    expect(validateTask(missingProof, directProfile).map((issue) => issue.code)).toContain("invalid_completion_proof");

    const criterionProfile = { ...taskProfile, reviews: { enabled: false, required: false }, approvals: { enabled: false, required: false } };
    const criterionEditor = TaskEditor.create(
      {
        profile: criterionProfile,
        scope: { type: "project", projectId: "duplicate-snapshot" },
        definition: { title: "Duplicate snapshot" },
        criteria: [{ title: "Criterion", required: true, state: "not_started" }],
      },
      { clock, ids: new SequenceTaskIdGenerator() },
    );
    const criterionId = criterionEditor.task.criteria[0]!.id;
    criterionEditor.criteria.start(criterionId);
    criterionEditor.criteria.submit(criterionId);
    criterionEditor.criteria.verify(criterionId);
    criterionEditor.accept();
    const duplicateSnapshot = structuredClone(criterionEditor.commit().task) as Task;
    const criteria = duplicateSnapshot.acceptanceRecords[0]!.snapshot.criteria as (typeof duplicateSnapshot.acceptanceRecords[0]["snapshot"]["criteria"][number])[];
    criteria.push(structuredClone(criteria[0]!));
    expect(validateTask(duplicateSnapshot, criterionProfile).map((issue) => issue.code)).toContain("duplicate_snapshot_id");

    const approvalEditor = TaskEditor.create(
      {
        profile: taskProfile,
        scope: { type: "project", projectId: "revocation" },
        definition: { title: "Revocation" },
        approvalPolicy: { stages: [
          { label: "A", required: true, requiredApprovalCount: 1, scope: "milestone" },
          { label: "B", required: true, requiredApprovalCount: 1, scope: "milestone" },
        ] },
      },
      { clock, ids: new SequenceTaskIdGenerator() },
    );
    const [stageA, stageB] = approvalEditor.task.approvalPolicy!.stages;
    const grant = approvalEditor.approvals.grant(stageA!.id, { id: "approver", type: "user" });
    approvalEditor.approvals.revoke(grant, { id: "approver", type: "user" });
    const mismatchedRevocation = structuredClone(approvalEditor.commit().task) as Task;
    const revocation = mismatchedRevocation.approvalRecords.find((record) => record.type === "revoked")!;
    (revocation as { stageId: string }).stageId = stageB!.id;
    expect(validateTask(mismatchedRevocation, taskProfile).map((issue) => issue.code)).toContain("revocation_target_mismatch");
  });

  it("uses chronological timestamp comparison and one reminder-duration grammar everywhere", () => {
    const taskProfile = profile(false);
    const editor = TaskEditor.create(
      { profile: taskProfile, scope: { type: "project", projectId: "time" }, definition: { title: "Time" } },
      { clock, ids: new SequenceTaskIdGenerator() },
    );
    expect(() => editor.timing.setRange({ startsAt: "2026-08-22T10:00:00+02:00", dueAt: "2026-08-22T08:00:00Z" })).not.toThrow();
    expect(() => editor.timing.setRange({ startsAt: "2026-08-22T10:00:00+02:00", dueAt: "2026-08-22T09:30:00Z" })).not.toThrow();
    expect(() => editor.timing.setRange({ startsAt: "2026-08-22T09:30:00Z", dueAt: "2026-08-22T10:00:00+02:00" })).toThrow();
    expect(() => editor.timing.setDue("not-a-timestamp")).toThrow();
    expect(() => editor.timing.setDue("2026-02-30T12:00:00Z")).toThrow();
    expect(() => editor.reminders.add({ trigger: { type: "before_due", duration: "P1M" } })).toThrow();
    expect(() => editor.reminders.add({ trigger: { type: "before_due", duration: "P1DT2H30M" } })).not.toThrow();

    const committed = editor.commit().task;
    const document = createTaskDocument({ task: committed, profile: taskProfile });
    expect(document.getTiming().hasStarted("2026-08-22T08:00:00Z")).toBe(true);
    expect(() => document.getTiming().isOverdue("invalid")).toThrow();

    const invalidWireState = structuredClone(committed) as Task;
    (invalidWireState.timing as { dueAt: string }).dueAt = "invalid";
    expect(validateTask(invalidWireState, taskProfile).map((issue) => issue.code)).toContain("invalid_timing");
    expect(() => createTaskDocument({ task: invalidWireState, profile: taskProfile })).toThrow();
  });

  it("keeps Task Overview and approval reads compositional and policy-aware", () => {
    const taskProfile = profile(false);
    const custom: TaskEvaluationPolicySnapshot = {
      ...TaskEditor.create(
        { profile: taskProfile, scope: { type: "project", projectId: "policy-template" }, definition: { title: "Template" } },
        { clock, ids: new SequenceTaskIdGenerator() },
      ).task.revisions[0]!.snapshot.evaluationPolicy,
      waivedCriteriaSatisfyRequired: false,
      waivedDeliverablesSatisfyRequired: false,
    };
    const editor = TaskEditor.create(
      {
        profile: taskProfile,
        evaluationPolicy: custom,
        scope: { type: "project", projectId: "overview" },
        definition: { title: "Overview" },
        criteria: [{ title: "Waived criterion", required: true, state: "not_started", artifactRequirementIds: ["missing-requirement"] }],
        deliverables: [{ title: "Waived deliverable", required: true, state: "missing" }],
        approvalPolicy: { stages: [{ label: "Optional profile approval", required: true, requiredApprovalCount: 1, scope: "milestone" }] },
      },
      { clock, ids: new SequenceTaskIdGenerator() },
    );
    editor.criteria.waive(editor.task.criteria[0]!.id);
    editor.deliverables.waive(editor.task.deliverables[0]!.id);
    const task = editor.commit().task;
    const document = createTaskDocument({ task, profile: taskProfile });
    expect(document.getOverview().getSatisfiedRequiredCriterionCount()).toBe(0);
    expect(document.getOverview().getSatisfiedRequiredDeliverableCount()).toBe(0);
    expect(document.getOverview().getProgressPercentage()).toBe(0);
    expect(document.getApprovals().getPendingStages()).toHaveLength(1);
    expect(document.getAcceptance().getEvaluation().reasons.some((reason) => reason.code === "artifact_requirement_missing")).toBe(true);
  });
});
