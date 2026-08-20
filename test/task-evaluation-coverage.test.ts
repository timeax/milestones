import { describe, expect, it } from "vitest";
import type {
  Artifact,
  ArtifactRequirement,
  ArtifactSubmission,
  ArtifactVerification,
  ArtifactVersion,
} from "@elqora/artifacts";
import {
  FixedTaskClock,
  SequenceTaskIdGenerator,
  TaskEditor,
  assertValidTaskGraph,
  calculateTaskProgress,
  deriveTaskState,
  detectTaskGraphCycles,
  evaluateTaskAcceptance,
  evaluateTaskCompletion,
  validateTaskGraph,
  type TaskArtifactContext,
  type TaskGraphSnapshot,
  type TaskProfile,
} from "../src/index.js";
import {
  calculateProgressGeneric,
  effectiveApprovalActorsGeneric,
  evaluateArtifacts as evaluateArtifactsGeneric,
} from "../src/services/execution-evaluation.js";

const profile: TaskProfile = {
  ref: { id: "profile-task-eval" as any, version: 1 },
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

describe("Task Evaluation & Graph Analysis Coverage", () => {
  it("evaluates task progress, acceptance and completion with Artifact Protocol context", () => {
    const clock = new FixedTaskClock("2026-08-20T12:00:00.000Z");
    const ids = new SequenceTaskIdGenerator();

    const artifactRequirement: ArtifactRequirement = {
      schemaVersion: "1.1",
      id: "req-1" as any,
      targetArtifactId: "art-1" as any,
      required: true,
      createdAt: "2026-08-20T12:00:00.000Z",
    };

    const artifact: Artifact = {
      schemaVersion: "1.1",
      id: "art-1" as any,
      kind: "document",
      valueType: "file",
      currentVersionId: "ver-1" as any,
      createdBy: { id: "u1", type: "user" },
      createdAt: "2026-08-20T12:00:00.000Z",
    };

    const version: ArtifactVersion = {
      schemaVersion: "1.1",
      id: "ver-1" as any,
      artifactId: "art-1" as any,
      version: 1,
      versionNumber: 1,
      source: { type: "local" } as any,
      createdBy: { id: "u1", type: "user" },
      createdAt: "2026-08-20T12:00:00.000Z",
    };

    const submission: ArtifactSubmission = {
      schemaVersion: "1.1",
      id: "sub-1" as any,
      artifactId: "art-1" as any,
      artifactVersionId: "ver-1" as any,
      submittedBy: { id: "u1", type: "user" },
      submittedAt: "2026-08-20T12:00:00.000Z",
      createdAt: "2026-08-20T12:00:00.000Z",
    };

    const verification: ArtifactVerification = {
      schemaVersion: "1.1",
      id: "vrf-1" as any,
      artifactId: "art-1" as any,
      artifactVersionId: "ver-1" as any,
      submissionId: "sub-1" as any,
      status: "verified",
      verifiedAt: "2026-08-20T12:00:00.000Z",
      createdAt: "2026-08-20T12:00:00.000Z",
    };

    const artifactsContext: TaskArtifactContext = {
      requirements: new Map([["req-1" as any, artifactRequirement]]),
      artifacts: new Map([["art-1" as any, artifact]]),
      versions: new Map([["ver-1" as any, version]]),
      submissions: new Map([["sub-1" as any, submission]]),
      verifications: new Map([["vrf-1" as any, verification]]),
      links: [],
    };

    const editor = TaskEditor.create(
      {
        profile,
        scope: { type: "project", projectId: "p-art" },
        definition: { title: "Artifact-backed Task" },
        criteria: [
          {
            title: "Artifact Criterion",
            required: true,
            state: "pending" as const,
            artifactRequirementIds: ["req-1" as any],
          },
        ],
        deliverables: [
          {
            title: "Artifact Deliverable",
            required: true,
            state: "pending" as const,
            artifactRequirementIds: ["req-1" as any],
          },
        ],
      },
      { clock, ids, artifacts: artifactsContext },
    );

    const critId = editor.task.criteria[0]!.id;
    const delivId = editor.task.deliverables[0]!.id;

    // Attach artifact link to criterion and deliverable
    editor.sources.attach(
      {
        schemaVersion: "1.1",
        id: "link-crit" as any,
        artifactId: "art-1" as any,
        artifactVersionId: "ver-1" as any,
        role: "verification",
        subject: { type: "criterion", id: critId },
        createdBy: { id: "u1", type: "user" },
        createdAt: "2026-08-20T12:00:00.000Z",
      },
    );

    editor.sources.attach(
      {
        schemaVersion: "1.1",
        id: "link-deliv" as any,
        artifactId: "art-1" as any,
        artifactVersionId: "ver-1" as any,
        role: "verification",
        subject: { type: "deliverable_requirement", id: delivId },
        createdBy: { id: "u1", type: "user" },
        createdAt: "2026-08-20T12:00:00.000Z",
      },
    );

    editor.criteria.start(critId);
    editor.criteria.submit(critId);
    editor.criteria.verify(critId);

    editor.deliverables.submit(delivId);
    editor.deliverables.satisfy(delivId);

    const progress = calculateTaskProgress(editor.task);
    expect(progress.percentage).toBe(100);

    const acceptEval = evaluateTaskAcceptance(editor.task, profile, undefined, {
      ...artifactsContext,
      links: [
        ...(editor.task.sourceLinks ?? []),
        ...editor.task.criteria.flatMap((c) => c.sourceLinks ?? []),
        ...editor.task.deliverables.flatMap((d) => d.sourceLinks ?? []),
      ],
    });
    expect(acceptEval.reasons).toEqual([]);
    expect(acceptEval.accepted).toBe(true);

    editor.accept();
    expect(deriveTaskState(editor.task)).toBe("accepted");

    const compEval = evaluateTaskCompletion(editor.task, profile);
    expect(compEval.completable).toBe(true);

    editor.complete();
    expect(deriveTaskState(editor.task)).toBe("completed");
  });

  it("exercises generic progress calculation and approval actors", () => {
    // calculateProgressGeneric
    const p1 = calculateProgressGeneric([], [], false, false);
    expect(p1.percentage).toBe(100);

    const p2 = calculateProgressGeneric(
      [
        { weight: 2, state: "verified" },
        { weight: 3, state: "waived" },
      ],
      [{ state: "satisfied" }, { state: "waived" }],
      true, // waived criteria satisfy
      true, // waived deliverables satisfy
    );
    expect(p2.completedWeight).toBe(7);
    expect(p2.percentage).toBe(100);

    // effectiveApprovalActorsGeneric
    const actors = effectiveApprovalActorsGeneric(
      [
        {
          id: "g1" as any,
          stageId: "stg1" as any,
          taskRevisionId: "rev1",
          type: "granted",
          actor: { id: "alice", type: "user" },
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "g2" as any,
          stageId: "stg1" as any,
          taskRevisionId: "rev1",
          type: "granted",
          actor: { id: "bob", type: "user" },
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "r1" as any,
          stageId: "stg1" as any,
          taskRevisionId: "rev1",
          type: "revoked",
          revokesApprovalId: "g1" as any,
          actor: { id: "alice", type: "user" },
          createdAt: "2026-08-20T12:00:00.000Z",
        },
      ],
      "stg1",
      "rev1",
    );
    expect(actors).toEqual(["user:bob"]);
  });

  it("exercises evaluateArtifacts edge cases, mismatch kinds, and missing submissions/verifications", () => {
    // Empty requirementIds
    const rEmpty = evaluateArtifactsGeneric({ type: "criterion", id: "c1", requirementIds: [] });
    expect(rEmpty.satisfied).toBe(true);

    // Undefined context
    const rNoContext = evaluateArtifactsGeneric({ type: "criterion", id: "c1", requirementIds: ["req-1" as any] });
    expect(rNoContext.satisfied).toBe(false);
    expect(rNoContext.reasons.length).toBe(1);

    // Missing requirement in context
    const context: TaskArtifactContext = {
      requirements: new Map(),
      artifacts: new Map(),
      versions: new Map(),
      submissions: new Map(),
      verifications: new Map(),
      links: [],
    };
    const rMissingReq = evaluateArtifactsGeneric({ type: "criterion", id: "c1", requirementIds: ["req-missing" as any] }, context);
    expect(rMissingReq.satisfied).toBe(false);

    // Filter by allowedKinds and allowedValueTypes mismatch
    const reqWithFilters: ArtifactRequirement = {
      schemaVersion: "1.1",
      id: "req-filter" as any,
      targetArtifactId: "art-mismatch" as any,
      required: true,
      allowedKinds: ["model"],
      allowedValueTypes: ["file"],
      createdAt: "2026-08-20T12:00:00.000Z",
    };
    const artDoc: Artifact = {
      schemaVersion: "1.1",
      id: "art-mismatch" as any,
      kind: "document", // mismatch
      valueType: "file",
      createdAt: "2026-08-20T12:00:00.000Z",
    };
    const contextMismatch: TaskArtifactContext = {
      requirements: new Map([["req-filter" as any, reqWithFilters]]),
      artifacts: new Map([["art-mismatch" as any, artDoc]]),
      versions: new Map(),
      submissions: new Map(),
      verifications: new Map(),
      links: [
        {
          schemaVersion: "1.1",
          id: "link-mismatch" as any,
          artifactId: "art-mismatch" as any,
          role: "verification",
          subject: { type: "criterion", id: "c1" },
          createdBy: { id: "u1", type: "user" },
          createdAt: "2026-08-20T12:00:00.000Z",
        },
      ],
    };
    const rMismatch = evaluateArtifactsGeneric({ type: "criterion", id: "c1", requirementIds: ["req-filter" as any] }, contextMismatch);
    expect(rMismatch.satisfied).toBe(false);

    // Tagged metadata requirementId
    const reqTagged: ArtifactRequirement = {
      schemaVersion: "1.1",
      id: "req-tagged" as any,
      targetArtifactId: "art-tagged" as any,
      required: true,
      minimumCount: 1,
      maximumCount: 1,
      createdAt: "2026-08-20T12:00:00.000Z",
    };
    const contextTagged: TaskArtifactContext = {
      requirements: new Map([["req-tagged" as any, reqTagged]]),
      artifacts: new Map([["art-tagged" as any, artDoc]]),
      versions: new Map(),
      submissions: new Map(),
      verifications: new Map(),
      links: [
        {
          schemaVersion: "1.1",
          id: "link-tagged" as any,
          artifactId: "art-tagged" as any,
          role: "verification",
          subject: { type: "criterion", id: "c1" },
          metadata: { artifactRequirementId: "req-other" }, // mismatch tagged ID
          createdBy: { id: "u1", type: "user" },
          createdAt: "2026-08-20T12:00:00.000Z",
        },
      ],
    };
    const rTagged = evaluateArtifactsGeneric({ type: "criterion", id: "c1", requirementIds: ["req-tagged" as any] }, contextTagged);
    expect(rTagged.satisfied).toBe(false);

    // Missing version or version belongs to other artifact
    const reqVer: ArtifactRequirement = {
      schemaVersion: "1.1",
      id: "req-ver" as any,
      targetArtifactId: "art-ver" as any,
      required: true,
      createdAt: "2026-08-20T12:00:00.000Z",
    };
    const artVer: Artifact = {
      schemaVersion: "1.1",
      id: "art-ver" as any,
      kind: "document",
      valueType: "file",
      createdAt: "2026-08-20T12:00:00.000Z",
    };
    const verOther: ArtifactVersion = {
      schemaVersion: "1.1",
      id: "ver-other" as any,
      artifactId: "art-different" as any,
      version: 1,
      versionNumber: 1,
      source: { type: "local" } as any,
      createdBy: { id: "u1", type: "user" },
      createdAt: "2026-08-20T12:00:00.000Z",
    };
    const contextVerOther: TaskArtifactContext = {
      requirements: new Map([["req-ver" as any, reqVer]]),
      artifacts: new Map([["art-ver" as any, artVer]]),
      versions: new Map([["ver-other" as any, verOther]]),
      submissions: new Map(),
      verifications: new Map(),
      links: [
        {
          schemaVersion: "1.1",
          id: "link-ver" as any,
          artifactId: "art-ver" as any,
          artifactVersionId: "ver-other" as any,
          role: "verification",
          subject: { type: "criterion", id: "c1" },
          createdBy: { id: "u1", type: "user" },
          createdAt: "2026-08-20T12:00:00.000Z",
        },
      ],
    };
    const rVerOther = evaluateArtifactsGeneric({ type: "criterion", id: "c1", requirementIds: ["req-ver" as any] }, contextVerOther);
    expect(rVerOther.satisfied).toBe(false);

    // No submission & no verification
    const verValid: ArtifactVersion = {
      schemaVersion: "1.1",
      id: "ver-valid" as any,
      artifactId: "art-ver" as any,
      version: 1,
      versionNumber: 1,
      source: { type: "local" } as any,
      createdBy: { id: "u1", type: "user" },
      createdAt: "2026-08-20T12:00:00.000Z",
    };
    const contextNoSub: TaskArtifactContext = {
      ...contextVerOther,
      versions: new Map([["ver-valid" as any, verValid]]),
      links: [
        {
          schemaVersion: "1.1",
          id: "link-ver" as any,
          artifactId: "art-ver" as any,
          artifactVersionId: "ver-valid" as any,
          role: "verification",
          subject: { type: "criterion", id: "c1" },
          createdBy: { id: "u1", type: "user" },
          createdAt: "2026-08-20T12:00:00.000Z",
        },
      ],
    };
    const rNoSub = evaluateArtifactsGeneric({ type: "criterion", id: "c1", requirementIds: ["req-ver" as any] }, contextNoSub);
    expect(rNoSub.satisfied).toBe(false);

    // Submission exists but no verification exists
    const subValid: ArtifactSubmission = {
      schemaVersion: "1.1",
      id: "sub-valid" as any,
      artifactId: "art-ver" as any,
      artifactVersionId: "ver-valid" as any,
      submittedBy: { id: "u1", type: "user" },
      submittedAt: "2026-08-20T12:00:00.000Z",
      createdAt: "2026-08-20T12:00:00.000Z",
    };
    const contextNoVrf: TaskArtifactContext = {
      ...contextNoSub,
      submissions: new Map([["sub-valid" as any, subValid]]),
    };
    const rNoVrf = evaluateArtifactsGeneric({ type: "criterion", id: "c1", requirementIds: ["req-ver" as any] }, contextNoVrf);
    expect(rNoVrf.satisfied).toBe(false);
  });

  it("analyzes task graph validation and cycle detection", () => {
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
        [
          "t-2" as any,
          {
            id: "t-2" as any,
            revisionId: "rev-2" as any,
            gates: { criteria: new Map(), deliverables: new Map(), accepted: false, completed: false },
          },
        ],
        [
          "t-3" as any,
          {
            id: "t-3" as any,
            revisionId: "rev-3" as any,
            gates: { criteria: new Map(), deliverables: new Map(), accepted: false, completed: false },
          },
        ],
      ]),
      dependencies: [
        {
          id: "d-1" as any,
          taskId: "t-2" as any,
          dependsOn: { type: "task", id: "t-1" as any },
          gate: { type: "completed" },
          blocking: true,
        },
        {
          id: "d-2" as any,
          taskId: "t-3" as any,
          dependsOn: { type: "task", id: "t-2" as any },
          gate: { type: "completed" },
          blocking: true,
        },
      ],
    };

    const issues = validateTaskGraph(graph);
    expect(issues.length).toBe(0);
    expect(() => assertValidTaskGraph(graph)).not.toThrow();

    const cycles = detectTaskGraphCycles(graph);
    expect(cycles.length).toBe(0);
  });

  it("evaluates task completion modes: disabled completion, direct acceptance requirement, and closeImmediatelyOnAcceptance", () => {
    const clock = new FixedTaskClock("2026-08-20T12:00:00.000Z");
    const ids = new SequenceTaskIdGenerator();

    const disabledCompProfile: TaskProfile = {
      ...profile,
      completion: {
        enabled: false,
        requiresAcceptance: false,
        closeImmediatelyOnAcceptance: false,
      },
    };

    const taskDisabled = TaskEditor.create(
      {
        profile: disabledCompProfile,
        scope: { type: "project", projectId: "p-dis" },
        definition: { title: "Disabled Comp Task" },
      },
      { clock, ids },
    ).task;

    const evalDisabled = evaluateTaskCompletion(taskDisabled, disabledCompProfile);
    expect(evalDisabled.completable).toBe(false);
    expect(evalDisabled.reasons[0]?.code).toBe("profile_feature_disabled");

    // Profile without requiring formal acceptance
    const directCompProfile: TaskProfile = {
      ...profile,
      completion: {
        enabled: true,
        requiresAcceptance: false,
        closeImmediatelyOnAcceptance: false,
      },
    };

    const taskDirect = TaskEditor.create(
      {
        profile: directCompProfile,
        scope: { type: "project", projectId: "p-dir" },
        definition: { title: "Direct Comp Task" },
      },
      { clock, ids },
    ).task;

    const evalDirect = evaluateTaskCompletion(taskDirect, directCompProfile);
    expect(evalDirect.completable).toBe(true);

    // Profile with closeImmediatelyOnAcceptance
    const autoCloseProfile: TaskProfile = {
      ...profile,
      completion: {
        enabled: true,
        requiresAcceptance: true,
        closeImmediatelyOnAcceptance: true,
      },
    };

    const editorAuto = TaskEditor.create(
      {
        profile: autoCloseProfile,
        scope: { type: "project", projectId: "p-auto" },
        definition: { title: "Auto Close Task" },
      },
      { clock, ids },
    );

    editorAuto.accept();
    expect(editorAuto.task.currentAcceptanceId).toBeDefined();
    expect(editorAuto.task.currentCompletionId).toBeDefined();
    expect(deriveTaskState(editorAuto.task)).toBe("completed");
  });

  it("evaluates task acceptance reasons for blocking challenges and pending approvals", () => {
    const clock = new FixedTaskClock("2026-08-20T12:00:00.000Z");
    const ids = new SequenceTaskIdGenerator();

    const approvalChallengeProfile: TaskProfile = {
      ...profile,
      challenges: { enabled: true },
      approvals: { enabled: true, required: true },
      reviews: { enabled: true, required: true },
    };

    const editor = TaskEditor.create(
      {
        profile: approvalChallengeProfile,
        scope: { type: "project", projectId: "p-chal-eval" },
        definition: { title: "Approval & Challenge Task" },
        criteria: [{ title: "C1", required: true, state: "defined" as const }],
        approvalPolicy: {
          stages: [
            {
              label: "Tech Lead",
              scope: "task" as any,
              required: true,
              requiredApprovalCount: 1,
              cardinality: "any",
              candidates: [{ id: "lead-1", type: "user" }],
            },
          ],
        },
      },
      { clock, ids },
    );

    const critId = editor.task.criteria[0]!.id;
    editor.criteria.start(critId);
    editor.criteria.submit(critId);
    editor.criteria.verify(critId);

    // Raise blocking challenge
    const chalId = editor.challenges.raise(
      { type: "criterion", criterionId: critId },
      "Severe defect",
      "blocking",
      { id: "dev", type: "user" },
    );

    const evalBefore = editor.evaluateAcceptance();
    expect(evalBefore.accepted).toBe(false);
    expect(evalBefore.reasons.some((r) => r.code === "blocking_challenge")).toBe(true);
    expect(evalBefore.reasons.some((r) => r.code === "pending_approval")).toBe(true);
    expect(evalBefore.reasons.some((r) => r.code === "incomplete_review")).toBe(true);

    // Resolve challenge
    editor.challenges.resolve(chalId, "Fixed defect", { id: "dev", type: "user" });

    // Complete review
    const revId = editor.reviews.request({ requestedBy: { id: "dev", type: "user" } });
    editor.reviews.complete(revId, "accepted", { completedBy: { id: "lead-1", type: "user" } });

    // Grant approval
    const stageId = editor.task.approvalPolicy!.stages[0]!.id;
    editor.approvals.grant(stageId, { id: "lead-1", type: "user" });

    const evalAfter = editor.evaluateAcceptance();
    expect(evalAfter.accepted).toBe(true);
  });
});
