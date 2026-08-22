import type {
  ApprovalStage,
  ArtifactEvaluationSnapshot,
  DerivedTaskState,
  EvaluationReason,
  ProgressResult,
  Task,
  TaskAcceptanceEvaluation,
  TaskArtifactContext,
  TaskCompletionEvaluation,
  TaskEvaluationPolicySnapshot,
  TaskProfile,
  TaskApprovalAcceptanceSnapshot,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import {
  calculateProgressGeneric,
  dedupeReasons,
  effectiveApprovalActorsGeneric,
  evaluateArtifacts,
} from "./execution-evaluation.js";
import { resolveChallengeEvidenceSources } from "./challenge-evidence.js";
import { resolveTaskSources, sourceLinksForTaskRevision } from "./sources.js";
import { evaluateTaskDependencies, type ExecutionDependencyResolver, type TaskGraphSnapshot } from "./task-graph.js";

export function defaultTaskEvaluationPolicy(profile: TaskProfile): TaskEvaluationPolicySnapshot {
  return {
    requiredCriteriaMustBeVerified: true,
    requiredDeliverablesMustBeSatisfied: true,
    waivedCriteriaSatisfyRequired: true,
    waivedDeliverablesSatisfyRequired: true,
    blockingChallengesPreventAcceptance: true,
    requiredReviewResult: "accepted",
    requireReviewWhenProfileRequires: profile.reviews.required,
    requireApprovalsWhenProfileRequires: profile.approvals.required,
    requiresAcceptance: profile.completion.requiresAcceptance,
    closeImmediatelyOnAcceptance: profile.completion.closeImmediatelyOnAcceptance,
  };
}

export function currentTaskPolicy(task: Task): TaskEvaluationPolicySnapshot {
  const revision = task.revisions.find((item) => item.id === task.currentRevisionId);
  invariant(revision !== undefined, "INVALID_ARGUMENT", `Current revision ${task.currentRevisionId} is missing`);
  return revision.snapshot.evaluationPolicy;
}

export function calculateTaskProgress(task: Task, policy: TaskEvaluationPolicySnapshot = currentTaskPolicy(task)): ProgressResult {
  return calculateProgressGeneric(
    task.criteria,
    task.deliverables,
    policy.waivedCriteriaSatisfyRequired,
    policy.waivedDeliverablesSatisfyRequired,
  );
}

export function deriveTaskState(task: Task): DerivedTaskState {
  if (task.currentCompletionId !== undefined) return "completed";
  if (task.currentAcceptanceId !== undefined) return "accepted";
  return "open";
}

export function evaluateTaskApprovalStage(task: Task, stage: ApprovalStage): TaskApprovalAcceptanceSnapshot {
  const actorIds = effectiveApprovalActorsGeneric(task.approvalRecords, stage.id, task.currentRevisionId);
  const waived = task.approvalRecords.some(
    (record) =>
      record.type === "waived" &&
      record.stageId === stage.id &&
      record.taskRevisionId === task.currentRevisionId,
  );
  return {
    stageId: stage.id,
    taskRevisionId: task.currentRevisionId,
    effectiveApprovalCount: actorIds.length,
    requiredApprovalCount: stage.requiredApprovalCount,
    satisfied: !stage.required || waived || actorIds.length >= stage.requiredApprovalCount,
    waived,
    actorIds,
  };
}

export function evaluateTaskAcceptance(
  task: Task,
  profile: TaskProfile,
  graph?: TaskGraphSnapshot | ExecutionDependencyResolver,
  artifacts?: TaskArtifactContext,
): TaskAcceptanceEvaluation {
  const policy = currentTaskPolicy(task);
  const reasons: EvaluationReason[] = [];
  const artifactSnapshots: ArtifactEvaluationSnapshot[] = [];
  const criteria = task.criteria.map((criterion) => {
    const stateSatisfied =
      criterion.state === "verified" ||
      (criterion.state === "waived" && policy.waivedCriteriaSatisfyRequired);
    const artifactResult = evaluateArtifacts(
      { type: "criterion", id: criterion.id, requirementIds: criterion.artifactRequirementIds ?? [] },
      artifacts,
    );
    artifactSnapshots.push(...artifactResult.snapshots);
    if (criterion.required && policy.requiredCriteriaMustBeVerified) {
      reasons.push(...artifactResult.reasons);
    }
    const satisfied = stateSatisfied && artifactResult.satisfied;
    if (criterion.required && policy.requiredCriteriaMustBeVerified && !satisfied) {
      reasons.push({
        code: "missing_criterion",
        subjectId: criterion.id,
        message: `Required criterion ${criterion.id} is not satisfied`,
      });
    }
    return { id: criterion.id, state: criterion.state, satisfied };
  });

  const deliverables = task.deliverables.map((deliverable) => {
    const stateSatisfied =
      deliverable.state === "satisfied" ||
      (deliverable.state === "waived" && policy.waivedDeliverablesSatisfyRequired);
    const artifactResult = evaluateArtifacts(
      { type: "deliverable_requirement", id: deliverable.id, requirementIds: deliverable.artifactRequirementIds ?? [] },
      artifacts,
    );
    artifactSnapshots.push(...artifactResult.snapshots);
    if (deliverable.required && policy.requiredDeliverablesMustBeSatisfied) {
      reasons.push(...artifactResult.reasons);
    }
    const satisfied = stateSatisfied && artifactResult.satisfied;
    if (deliverable.required && policy.requiredDeliverablesMustBeSatisfied && !satisfied) {
      reasons.push({
        code: "missing_deliverable",
        subjectId: deliverable.id,
        message: `Required deliverable ${deliverable.id} is not satisfied`,
      });
    }
    return { id: deliverable.id, state: deliverable.state, satisfied };
  });

  const dependencyResult = evaluateTaskDependencies(task, graph);
  reasons.push(...dependencyResult.reasons);

  const challenges = task.challenges
    .filter((challenge) => challenge.taskRevisionId === task.currentRevisionId)
    .map((challenge) => {
      const blocking =
        policy.blockingChallengesPreventAcceptance &&
        challenge.severity === "blocking" &&
        (challenge.state === "open" || challenge.state === "under_review" || challenge.state === "reopened");
      if (blocking) {
        reasons.push({
          code: "blocking_challenge",
          subjectId: challenge.id,
          message: `Blocking challenge ${challenge.id} is unresolved`,
        });
      }
      const evidence = challenge.evidence.map((item) => {
        const resolution = resolveChallengeEvidenceSources(item, artifacts);
        return {
          id: item.id,
          kind: item.kind,
          title: item.title,
          description: item.description,
          state: item.state,
          ...(item.supersedesEvidenceId === undefined ? {} : { supersedesEvidenceId: item.supersedesEvidenceId }),
          sourceStatus: resolution.status,
          sources: structuredClone(resolution.sources),
        };
      });
      return {
        id: challenge.id,
        target: structuredClone(challenge.target),
        severity: challenge.severity,
        state: challenge.state,
        ...(challenge.resolution === undefined ? {} : { resolution: structuredClone(challenge.resolution) }),
        blocking,
        evidence,
      };
    });

  const reviews = task.reviews
    .filter((review) => review.taskRevisionId === task.currentRevisionId)
    .map((review) => ({
      id: review.id,
      taskRevisionId: review.taskRevisionId,
      state: review.state,
      ...(review.result === undefined ? {} : { result: review.result }),
      artifactVersionIds: [...(review.artifactVersionIds ?? [])],
      satisfied: review.state === "completed" && review.result === policy.requiredReviewResult,
    }));

  if (profile.reviews.enabled && policy.requireReviewWhenProfileRequires && !reviews.some((review) => review.satisfied)) {
    reasons.push({
      code: "incomplete_review",
      subjectId: task.id,
      message: "A completed accepted review is required for the current revision",
    });
  }

  const approvals = (task.approvalPolicy?.stages ?? []).map((stage) => evaluateTaskApprovalStage(task, stage));
  if (profile.approvals.enabled && policy.requireApprovalsWhenProfileRequires) {
    for (const stage of approvals) {
      if (!stage.satisfied) {
        reasons.push({
          code: "pending_approval",
          subjectId: stage.stageId,
          message: `Approval stage ${stage.stageId} is pending`,
        });
      }
    }
  }

  return {
    accepted: reasons.length === 0,
    reasons: dedupeReasons(reasons),
    snapshot: {
      revisionId: task.currentRevisionId,
      criteria,
      deliverables,
      dependencies: dependencyResult.snapshots,
      challenges,
      reviews,
      approvals,
      artifacts: artifactSnapshots,
      sources: resolveTaskSources(
        sourceLinksForTaskRevision(task, task.currentRevisionId),
        artifacts,
      ),
    },
  };
}

export function evaluateTaskCompletion(
  task: Task,
  profile: TaskProfile,
  graph?: TaskGraphSnapshot | ExecutionDependencyResolver,
  artifacts?: TaskArtifactContext,
): TaskCompletionEvaluation {
  const policy = currentTaskPolicy(task);
  const reasons: EvaluationReason[] = [];
  let evaluationSnapshot: TaskAcceptanceEvaluation["snapshot"] | undefined;
  if (!profile.completion.enabled) {
    reasons.push({
      code: "profile_feature_disabled",
      subjectId: task.id,
      message: "Completion is disabled by the profile",
    });
  }

  if (policy.requiresAcceptance) {
    const currentAcceptance =
      task.currentAcceptanceId === undefined
        ? undefined
        : task.acceptanceRecords.find((record) => record.id === task.currentAcceptanceId);
    if (currentAcceptance === undefined || currentAcceptance.taskRevisionId !== task.currentRevisionId) {
      reasons.push({
        code: "missing_acceptance",
        subjectId: task.id,
        message: "A current acceptance for the current revision is required",
      });
    }
  } else {
    // For simple tasks without formal acceptance, evaluate requirements directly
    const acceptanceEval = evaluateTaskAcceptance(task, profile, graph, artifacts);
    reasons.push(...acceptanceEval.reasons);
    evaluationSnapshot = acceptanceEval.snapshot;
  }

  return {
    completable: reasons.length === 0,
    reasons: dedupeReasons(reasons),
    ...(evaluationSnapshot === undefined ? {} : { evaluationSnapshot }),
  };
}
