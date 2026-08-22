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
  defaultTaskEvaluationPolicy,
  evaluateTaskAcceptance,
  validateTask,
  type AcceptanceId,
  type Task,
  type TaskArtifactContext,
  type TaskArtifactLink,
  type TaskCompletion,
  type TaskEvaluationPolicyOverrides,
  type TaskExecutionEvaluationSnapshot,
  type TaskProfile,
} from "../src/index.js";

const completionTypeBase = { id: "completion-type" as never, taskId: "task-type" as never, taskRevisionId: "revision-type" as never, completedAt: "2026-08-22T00:00:00.000Z", completedSequence: 2 };
const completionTypeSnapshot = {} as TaskExecutionEvaluationSnapshot;
const acceptanceBackedCompletion: TaskCompletion = { ...completionTypeBase, acceptanceId: "acceptance-type" as AcceptanceId };
const directCompletion: TaskCompletion = { ...completionTypeBase, evaluationSnapshot: completionTypeSnapshot };
// @ts-expect-error Task completion requires one proof branch.
const completionWithoutProof: TaskCompletion = completionTypeBase;
// @ts-expect-error Task completion forbids conflicting proof branches.
const completionWithBothProofs: TaskCompletion = { ...completionTypeBase, acceptanceId: "acceptance-type" as AcceptanceId, evaluationSnapshot: completionTypeSnapshot };
// @ts-expect-error Profile-owned ceremony is not a public evaluation override.
const invalidCeremonyOverride = { waivedCriteriaSatisfyRequired: false, requiresAcceptance: false } satisfies TaskEvaluationPolicyOverrides;
void [acceptanceBackedCompletion, directCompletion, completionWithoutProof, completionWithBothProofs, invalidCeremonyOverride];

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

  it("preserves custom evaluation policy across ordinary revisions and profile changes", () => {
    const taskProfile = profile(false);
    const custom: TaskEvaluationPolicyOverrides = {
      waivedCriteriaSatisfyRequired: false,
      waivedDeliverablesSatisfyRequired: false,
    };
    const expected = { ...defaultTaskEvaluationPolicy(taskProfile), ...custom };
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
    const assertPolicy = () => expect(task.revisions.at(-1)!.snapshot.evaluationPolicy).toEqual(expected);

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

    const nextProfile: TaskProfile = {
      ...taskProfile,
      ref: { ...taskProfile.ref, version: 2 },
      reviews: { enabled: true, required: true },
      approvals: { enabled: true, required: true },
      completion: { enabled: true, requiresAcceptance: true, closeImmediatelyOnAcceptance: true },
    };
    editor = TaskEditor.open(task, taskProfile, { clock, ids, artifacts: artifactContext() });
    editor.revisions.applyProfile(nextProfile, "Profile upgraded");
    task = editor.commit().task;
    expect(task.revisions.at(-1)!.snapshot.evaluationPolicy).toMatchObject({
      waivedCriteriaSatisfyRequired: false,
      waivedDeliverablesSatisfyRequired: false,
      requireReviewWhenProfileRequires: true,
      requireApprovalsWhenProfileRequires: true,
      requiresAcceptance: true,
      closeImmediatelyOnAcceptance: true,
    });
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
    const reviewId = editor.reviews.request();
    editor.reviews.start(reviewId);
    const challengeId = editor.challenges.raise({ type: "task" }, "Direct completion context", "non_blocking");
    editor.evidence.add(challengeId, { kind: "supporting", title: "Direct evidence", description: "Captured in direct proof" });
    const firstEvaluation = editor.evaluateCompletion();
    expect(firstEvaluation.evaluationSnapshot?.revisionId).toBe(editor.task.currentRevisionId);
    editor.complete();
    let task = editor.commit().task;
    expect(task.completionRecords[0]!.acceptanceId).toBeUndefined();
    expect(task.completionRecords[0]!.evaluationSnapshot?.criteria[0]?.state).toBe("verified");
    const omittedDirectReview = structuredClone(task) as Task;
    (omittedDirectReview.completionRecords[0]!.evaluationSnapshot!.reviews as unknown[]).splice(0);
    expect(validateTask(omittedDirectReview, directProfile).map((issue) => issue.code)).toContain("incomplete_acceptance_snapshot");
    const omittedDirectEvidence = structuredClone(task) as Task;
    (omittedDirectEvidence.completionRecords[0]!.evaluationSnapshot!.challenges[0]!.evidence as unknown[]).splice(0);
    expect(validateTask(omittedDirectEvidence, directProfile).map((issue) => issue.code)).toContain("incomplete_acceptance_snapshot");

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

  it("validates Artifact-aware satisfaction without rejecting valid optional failures", () => {
    const taskProfile = profile(true);
    const editor = TaskEditor.create(
      {
        profile: taskProfile,
        scope: { type: "project", projectId: "artifact-snapshot" },
        definition: { title: "Artifact snapshot" },
        criteria: [{ title: "Optional criterion", required: false, state: "not_started", artifactRequirementIds: ["requirement-source-boundary"] }],
        deliverables: [{ title: "Optional deliverable", required: false, state: "missing", artifactRequirementIds: ["requirement-source-boundary"] }],
      },
      { clock, ids: new SequenceTaskIdGenerator(), artifacts: artifactContext() },
    );
    const criterionId = editor.task.criteria[0]!.id;
    const deliverableId = editor.task.deliverables[0]!.id;
    editor.criteria.start(criterionId);
    editor.criteria.submit(criterionId);
    editor.criteria.verify(criterionId);
    editor.deliverables.submit(deliverableId);
    editor.deliverables.satisfy(deliverableId);
    editor.accept();
    const task = editor.commit().task;
    expect(task.acceptanceRecords[0]!.snapshot.criteria[0]).toMatchObject({ state: "verified", satisfied: false });
    expect(task.acceptanceRecords[0]!.snapshot.deliverables[0]).toMatchObject({ state: "satisfied", satisfied: false });
    expect(validateTask(task, taskProfile)).toEqual([]);

    const impossible = structuredClone(task) as Task;
    (impossible.acceptanceRecords[0]!.snapshot.criteria[0] as { state: string; satisfied: boolean }).state = "failed";
    (impossible.acceptanceRecords[0]!.snapshot.criteria[0] as { state: string; satisfied: boolean }).satisfied = true;
    expect(validateTask(impossible, taskProfile).map((issue) => issue.code)).toContain("incoherent_acceptance_snapshot");

    const noArtifactDefinition = structuredClone(task) as Task;
    (noArtifactDefinition.revisions[0]!.snapshot.criteria[0] as { artifactRequirementIds?: readonly string[] }).artifactRequirementIds = [];
    expect(validateTask(noArtifactDefinition, taskProfile).map((issue) => issue.code)).toContain("incoherent_acceptance_snapshot");
  });

  it("requires exact revision-defined snapshot coverage", () => {
    const taskProfile = profile(true);
    const editor = TaskEditor.create(
      {
        profile: taskProfile,
        scope: { type: "project", projectId: "snapshot-coverage" },
        definition: { title: "Snapshot coverage" },
        criteria: [{ title: "Optional criterion", required: false, state: "not_started" }],
        deliverables: [{ title: "Optional deliverable", required: false, state: "missing" }],
        dependencies: [{ dependsOn: { type: "task", id: "upstream" as never }, gate: { type: "completed" }, blocking: false }],
        approvalPolicy: { stages: [{ label: "Optional approval", required: false, requiredApprovalCount: 0, scope: "milestone" }] },
      },
      { clock, ids: new SequenceTaskIdGenerator() },
    );
    editor.accept();
    const task = editor.commit().task;
    for (const collection of ["criteria", "deliverables", "dependencies", "approvals"] as const) {
      const malformed = structuredClone(task) as Task;
      (malformed.acceptanceRecords[0]!.snapshot[collection] as unknown[]).splice(0, 1);
      expect(validateTask(malformed, taskProfile).map((issue) => issue.code), collection).toContain("incomplete_acceptance_snapshot");
    }
  });

  it("keeps old Review and Challenge snapshots valid as current records progress", () => {
    const taskProfile = profile(true);
    const ids = new SequenceTaskIdGenerator();
    let editor = TaskEditor.create(
      { profile: taskProfile, scope: { type: "project", projectId: "historical-dynamic" }, definition: { title: "Historical dynamic records" } },
      { clock, ids },
    );
    const reviewId = editor.reviews.request();
    editor.reviews.start(reviewId);
    const historicalChallengeId = editor.challenges.raise({ type: "task" }, "Historical context", "non_blocking");
    editor.evidence.add(historicalChallengeId, { kind: "supporting", title: "Historical evidence", description: "Present at acceptance" });
    editor.accept();
    let task = editor.commit().task;

    editor = TaskEditor.open(task, taskProfile, { clock, ids });
    editor.reviews.complete(reviewId, "accepted");
    const laterReviewId = editor.reviews.request();
    const challengeId = editor.challenges.raise({ type: "task" }, "Later context", "non_blocking");
    editor.evidence.add(challengeId, { kind: "supporting", title: "Later evidence", description: "Created after acceptance" });
    task = editor.commit().task;
    expect(validateTask(task, taskProfile)).toEqual([]);
    expect(task.acceptanceRecords[0]!.snapshot.reviews[0]).toMatchObject({ id: reviewId, state: "in_progress", satisfied: false });
    expect(task.reviews.find((review) => review.id === reviewId)).toMatchObject({ state: "completed", result: "accepted" });
    expect(task.acceptanceRecords[0]!.snapshot.reviews.some((review) => review.id === laterReviewId)).toBe(false);

    const omittedReview = structuredClone(task) as Task;
    (omittedReview.acceptanceRecords[0]!.snapshot.reviews as unknown[]).splice(0);
    expect(validateTask(omittedReview, taskProfile).map((issue) => issue.code)).toContain("incomplete_acceptance_snapshot");
    const omittedChallenge = structuredClone(task) as Task;
    (omittedChallenge.acceptanceRecords[0]!.snapshot.challenges as unknown[]).splice(0);
    expect(validateTask(omittedChallenge, taskProfile).map((issue) => issue.code)).toContain("incomplete_acceptance_snapshot");
    const omittedEvidence = structuredClone(task) as Task;
    (omittedEvidence.acceptanceRecords[0]!.snapshot.challenges[0]!.evidence as unknown[]).splice(0);
    expect(validateTask(omittedEvidence, taskProfile).map((issue) => issue.code)).toContain("incomplete_acceptance_snapshot");

    const futureSnapshot = evaluateTaskAcceptance(task, taskProfile).snapshot;
    const malformedReview = structuredClone(task) as Task;
    (malformedReview.acceptanceRecords[0]!.snapshot.reviews as typeof futureSnapshot.reviews[number][]).push(futureSnapshot.reviews.find((review) => review.id === laterReviewId)!);
    expect(validateTask(malformedReview, taskProfile).map((issue) => issue.code)).toContain("missing_acceptance_snapshot_target");

    const malformedChallenge = structuredClone(task) as Task;
    (malformedChallenge.acceptanceRecords[0]!.snapshot.challenges as typeof futureSnapshot.challenges[number][]).push(futureSnapshot.challenges.find((challenge) => challenge.id === challengeId)!);
    expect(validateTask(malformedChallenge, taskProfile).map((issue) => issue.code)).toContain("missing_acceptance_snapshot_target");
  });

  it("keeps profile-owned ceremony authoritative", () => {
    const formalProfile: TaskProfile = {
      ...profile(true),
      reviews: { enabled: true, required: true },
      approvals: { enabled: true, required: true },
      completion: { enabled: true, requiresAcceptance: true, closeImmediatelyOnAcceptance: true },
    };
    const editor = TaskEditor.create(
      { profile: formalProfile, evaluationPolicy: { waivedCriteriaSatisfyRequired: false }, scope: { type: "project", projectId: "profile-authority" }, definition: { title: "Profile authority" } },
      { clock, ids: new SequenceTaskIdGenerator() },
    );
    expect(editor.task.revisions[0]!.snapshot.evaluationPolicy).toMatchObject({
      requireReviewWhenProfileRequires: true,
      requireApprovalsWhenProfileRequires: true,
      requiresAcceptance: true,
      closeImmediatelyOnAcceptance: true,
      waivedCriteriaSatisfyRequired: false,
    });

    const { task } = emptyFormalTask();
    const malformed = structuredClone(task) as Task;
    const acceptance = malformed.acceptanceRecords[0]!;
    (malformed.completionRecords[0] as unknown as { acceptanceId?: string; evaluationSnapshot?: TaskExecutionEvaluationSnapshot }).evaluationSnapshot = structuredClone(acceptance.snapshot);
    delete (malformed.completionRecords[0] as unknown as { acceptanceId?: string }).acceptanceId;
    expect(validateTask(malformed, profile(true)).map((issue) => issue.code)).toContain("missing_completion_acceptance");
  });

  it("ties current requirement-bearing state to the current revision snapshot", () => {
    const taskProfile = profile(false);
    const editor = TaskEditor.create(
      {
        profile: taskProfile,
        scope: { type: "project", projectId: "current-coherence" },
        definition: { title: "Current coherence" },
        criteria: [{ title: "Criterion definition", required: true, state: "not_started" }],
        deliverables: [{ title: "Deliverable definition", required: true, state: "missing" }],
        dependencies: [{ dependsOn: { type: "task", id: "upstream-coherence" as never }, gate: { type: "completed" }, blocking: true }],
        approvalPolicy: { stages: [{ label: "Approval", required: false, requiredApprovalCount: 0, scope: "milestone" }] },
        timing: { startsAt: "2026-08-22T00:00:00.000Z", dueAt: "2026-08-23T00:00:00.000Z" },
      },
      { clock, ids: new SequenceTaskIdGenerator() },
    );
    editor.criteria.start(editor.task.criteria[0]!.id);
    const task = editor.commit().task;
    expect(validateTask(task, taskProfile)).toEqual([]);

    const mutations: ((value: any) => void)[] = [
      (value) => { value.definition.title = "Tampered"; },
      (value) => { value.criteria[0].title = "Tampered"; },
      (value) => { value.deliverables[0].required = false; },
      (value) => { value.dependencies[0].blocking = false; },
      (value) => { value.approvalPolicy.stages[0].label = "Tampered"; },
      (value) => { value.timing.dueAt = "2026-08-24T00:00:00.000Z"; },
    ];
    for (const mutate of mutations) {
      const malformed = structuredClone(task) as any;
      mutate(malformed);
      expect(validateTask(malformed, taskProfile).map((issue) => issue.code)).toContain("current_revision_mismatch");
    }
  });

  it("validates sequence anchors and lifecycle timestamp chronology", () => {
    const taskProfile = profile(true);
    const ids = new SequenceTaskIdGenerator();
    const editor = TaskEditor.create(
      {
        profile: taskProfile,
        scope: { type: "project", projectId: "anchors" },
        definition: { title: "Anchors" },
        approvalPolicy: { stages: [{ label: "Anchor approval", required: false, requiredApprovalCount: 0, scope: "milestone" }] },
        reminders: [{ trigger: { type: "at", at: "2026-08-23T00:00:00.000Z" } }],
      },
      { clock, ids },
    );
    const reviewId = editor.reviews.request();
    editor.reviews.complete(reviewId, "accepted");
    const challengeId = editor.challenges.raise({ type: "task" }, "Anchor challenge", "non_blocking");
    const evidenceId = editor.evidence.add(challengeId, { kind: "supporting", title: "Anchor evidence", description: "Sequence proof" });
    editor.evidence.withdraw(evidenceId, "No longer needed");
    editor.challenges.resolve(challengeId, "no_effect");
    editor.approvals.grant(editor.task.approvalPolicy!.stages[0]!.id, { id: "approver", type: "user" });
    editor.accept();
    editor.complete();
    const task = editor.commit().task;
    expect(validateTask(task, taskProfile)).toEqual([]);

    const invalidAnchor = structuredClone(task) as any;
    invalidAnchor.reviews[0].createdSequence = 1;
    expect(validateTask(invalidAnchor, taskProfile).map((issue) => issue.code)).toContain("invalid_sequence");
    const missingAnchor = structuredClone(task) as any;
    delete missingAnchor.completionRecords[0].completedSequence;
    expect(validateTask(missingAnchor, taskProfile).map((issue) => issue.code)).toContain("invalid_sequence");
    const duplicateAnchor = structuredClone(task) as any;
    duplicateAnchor.challenges[0].createdSequence = duplicateAnchor.reviews[0].createdSequence;
    expect(validateTask(duplicateAnchor, taskProfile).map((issue) => issue.code)).toContain("duplicate_sequence");
    const invalidTimestamp = structuredClone(task) as any;
    invalidTimestamp.acceptanceRecords[0].acceptedAt = "banana";
    expect(validateTask(invalidTimestamp, taskProfile).map((issue) => issue.code)).toContain("invalid_timestamp");
    const reversedReview = structuredClone(task) as any;
    reversedReview.reviews[0].completedAt = "2026-08-21T23:59:59.000Z";
    expect(validateTask(reversedReview, taskProfile).map((issue) => issue.code)).toContain("invalid_timestamp_order");
    const reversedCompletion = structuredClone(task) as any;
    reversedCompletion.completionRecords[0].completedAt = "2026-08-21T23:59:59.000Z";
    expect(validateTask(reversedCompletion, taskProfile).map((issue) => issue.code)).toContain("invalid_timestamp_order");
    const timestampMutations: ((value: any) => void)[] = [
      (value) => { value.createdAt = "banana"; },
      (value) => { value.updatedAt = "banana"; },
      (value) => { value.revisions[0].createdAt = "banana"; },
      (value) => { value.reminders[0].createdAt = "banana"; },
      (value) => { value.reviews[0].createdAt = "banana"; },
      (value) => { value.challenges[0].createdAt = "banana"; },
      (value) => { value.challenges[0].resolution.resolvedAt = "banana"; },
      (value) => { value.challenges[0].evidence[0].createdAt = "banana"; },
      (value) => { value.challenges[0].evidence[0].withdrawnAt = "banana"; },
      (value) => { value.approvalRecords[0].createdAt = "banana"; },
      (value) => { value.acceptanceRecords[0].acceptedAt = "banana"; },
      (value) => { value.completionRecords[0].completedAt = "banana"; },
    ];
    for (const mutate of timestampMutations) {
      const malformed = structuredClone(task) as any;
      mutate(malformed);
      expect(validateTask(malformed, taskProfile).map((issue) => issue.code)).toContain("invalid_timestamp");
    }
  });

  it("uses Artifact-aware satisfaction throughout the Task DOM", () => {
    const taskProfile = profile(false);
    const editor = TaskEditor.create(
      {
        profile: taskProfile,
        scope: { type: "project", projectId: "artifact-dom" },
        definition: { title: "Artifact DOM" },
        criteria: [{ title: "Artifact criterion", required: true, state: "not_started", artifactRequirementIds: ["requirement-source-boundary"] }],
        deliverables: [{ title: "Artifact deliverable", required: true, state: "missing", artifactRequirementIds: ["requirement-source-boundary"] }],
      },
      { clock, ids: new SequenceTaskIdGenerator() },
    );
    const criterionId = editor.task.criteria[0]!.id;
    const deliverableId = editor.task.deliverables[0]!.id;
    editor.criteria.start(criterionId);
    editor.criteria.submit(criterionId);
    editor.criteria.verify(criterionId);
    editor.deliverables.submit(deliverableId);
    editor.deliverables.satisfy(deliverableId);
    const task = editor.commit().task;
    const links: TaskArtifactLink[] = [
      { schemaVersion: "1.1", id: "criterion-artifact-link", artifactId: "artifact-source-boundary", artifactVersionId: "artifact-version-source-boundary", role: "evidence", subject: { type: "criterion", id: criterionId }, createdBy: { id: "author", type: "user" }, createdAt: clock.now() },
      { schemaVersion: "1.1", id: "deliverable-artifact-link", artifactId: "artifact-source-boundary", artifactVersionId: "artifact-version-source-boundary", role: "deliverable", subject: { type: "deliverable_requirement", id: deliverableId }, createdBy: { id: "author", type: "user" }, createdAt: clock.now() },
    ];
    const withoutContext = createTaskDocument({ task, profile: taskProfile });
    expect(withoutContext.getOverview().getSatisfiedRequiredCriterionCount()).toBe(0);
    expect(withoutContext.getOverview().getSatisfiedRequiredDeliverableCount()).toBe(0);
    expect(withoutContext.getCriteria().getUnsatisfied()).toHaveLength(1);
    expect(withoutContext.getDeliverables().getUnsatisfied()).toHaveLength(1);
    const withContext = createTaskDocument({ task, profile: taskProfile, artifacts: artifactContext(links) });
    expect(withContext.getOverview().getSatisfiedRequiredCriterionCount()).toBe(1);
    expect(withContext.getOverview().getSatisfiedCriterionCount()).toBe(1);
    expect(withContext.getOverview().getSatisfiedRequiredDeliverableCount()).toBe(1);
    expect(withContext.getOverview().getSatisfiedDeliverableCount()).toBe(1);
    expect(withContext.getCriteria().getUnsatisfied()).toEqual([]);
    expect(withContext.getDeliverables().getUnsatisfied()).toEqual([]);
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
    const custom: TaskEvaluationPolicyOverrides = {
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
    expect(document.getCriteria().getUnsatisfied()).toHaveLength(1);
    expect(document.getDeliverables().getUnsatisfied()).toHaveLength(1);
    expect(document.getApprovals().getPendingStages()).toHaveLength(1);
    expect(document.getAcceptance().getEvaluation().reasons.some((reason) => reason.code === "artifact_requirement_missing")).toBe(true);
  });
});
