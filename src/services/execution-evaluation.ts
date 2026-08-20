import type {
  ArtifactRequirement,
  ArtifactRequirementId,
  ArtifactVerification,
} from "@elqora/artifacts";
import type {
  ApprovalRecord,
  ArtifactEvaluationResult,
  ArtifactEvaluationSnapshot,
  EvaluationReason,
  MilestoneArtifactContext,
  MilestoneArtifactLink,
  ProgressResult,
  TaskApprovalRecord,
  TaskArtifactContext,
  TaskArtifactLink,
} from "../model/domain.js";

export function actorKey(actor: { readonly id: string; readonly type?: string }): string {
  return `${actor.type ?? ""}:${actor.id}`;
}

export function dedupeReasons(reasons: readonly EvaluationReason[]): readonly EvaluationReason[] {
  const map = new Map<string, EvaluationReason>();
  for (const reason of reasons) {
    map.set(`${reason.code}|${reason.subjectId}|${reason.message}`, reason);
  }
  return [...map.values()];
}

export function effectiveApprovalActorsGeneric(
  records: readonly (ApprovalRecord | TaskApprovalRecord)[],
  stageId: string,
  revisionId: string,
): readonly string[] {
  const relevant = records.filter(
    (record) =>
      record.stageId === stageId &&
      ((record as { milestoneRevisionId?: string }).milestoneRevisionId === revisionId ||
        (record as { taskRevisionId?: string }).taskRevisionId === revisionId),
  );
  const revoked = new Set(
    relevant
      .filter((record) => record.type === "revoked")
      .map((record) => (record as { revokesApprovalId: string }).revokesApprovalId),
  );
  const actors = new Set<string>();
  for (const record of relevant) {
    if (record.type === "granted" && !revoked.has(record.id)) {
      actors.add(actorKey(record.actor));
    }
  }
  return [...actors].sort();
}

export function calculateProgressGeneric(
  criteria: readonly { readonly weight?: number; readonly state: string }[],
  deliverables: readonly { readonly state: string }[],
  waivedCriteriaSatisfyRequired: boolean,
  waivedDeliverablesSatisfyRequired: boolean,
): ProgressResult {
  let completedWeight = 0;
  let totalWeight = 0;
  for (const criterion of criteria) {
    const weight = criterion.weight ?? 1;
    totalWeight += weight;
    if (
      criterion.state === "verified" ||
      (criterion.state === "waived" && waivedCriteriaSatisfyRequired)
    ) {
      completedWeight += weight;
    }
  }
  for (const deliverable of deliverables) {
    totalWeight += 1;
    if (
      deliverable.state === "satisfied" ||
      (deliverable.state === "waived" && waivedDeliverablesSatisfyRequired)
    ) {
      completedWeight += 1;
    }
  }
  return {
    completedWeight,
    totalWeight,
    percentage: totalWeight === 0 ? 100 : (completedWeight / totalWeight) * 100,
  };
}

export interface ArtifactSubject {
  readonly type: "criterion" | "deliverable_requirement";
  readonly id: string;
  readonly requirementIds: readonly ArtifactRequirementId[];
}

export function evaluateArtifacts(
  subject: ArtifactSubject,
  context?: MilestoneArtifactContext | TaskArtifactContext,
): ArtifactEvaluationResult {
  const snapshots: ArtifactEvaluationSnapshot[] = [];
  const reasons: EvaluationReason[] = [];
  if (subject.requirementIds.length === 0) return { satisfied: true, snapshots, reasons };
  if (context === undefined) {
    for (const requirementId of subject.requirementIds) {
      reasons.push({
        code: "artifact_requirement_missing",
        subjectId: requirementId,
        message: `Artifact context is required for ${requirementId}`,
      });
    }
    return { satisfied: false, snapshots, reasons };
  }
  const links = ((context.links ?? []) as readonly (MilestoneArtifactLink | TaskArtifactLink)[]).filter(
    (link) => link.subject.type === subject.type && link.subject.id === subject.id,
  );
  for (const requirementId of subject.requirementIds) {
    const requirement = context.requirements.get(requirementId);
    if (requirement === undefined) {
      reasons.push({
        code: "artifact_requirement_missing",
        subjectId: requirementId,
        message: `Artifact requirement ${requirementId} is absent from context`,
      });
      continue;
    }
    const matching = links
      .filter((link) => linkMatchesRequirement(link, requirement, context))
      .sort((a, b) => a.id.localeCompare(b.id));
    const candidates = [
      ...new Map(
        matching.map((link) => [`${link.artifactId}|${link.artifactVersionId ?? ""}`, link]),
      ).values(),
    ];
    evaluateArtifactRequirement(requirement, candidates, context, snapshots, reasons);
  }
  return { satisfied: reasons.length === 0, snapshots, reasons };
}

function linkMatchesRequirement(
  link: MilestoneArtifactLink | TaskArtifactLink,
  requirement: ArtifactRequirement,
  context: MilestoneArtifactContext | TaskArtifactContext,
): boolean {
  const taggedRequirement = link.metadata?.["artifactRequirementId"];
  if (typeof taggedRequirement === "string") return taggedRequirement === requirement.id;
  return artifactMatchesRequirement(link.artifactId, requirement, context);
}

function artifactMatchesRequirement(
  artifactId: string,
  requirement: ArtifactRequirement,
  context: MilestoneArtifactContext | TaskArtifactContext,
): boolean {
  const artifact = context.artifacts.get(artifactId);
  if (artifact === undefined) return false;
  if (requirement.allowedKinds !== undefined && !requirement.allowedKinds.includes(artifact.kind))
    return false;
  if (
    requirement.allowedValueTypes !== undefined &&
    !requirement.allowedValueTypes.includes(artifact.valueType)
  )
    return false;
  return true;
}

function evaluateArtifactRequirement(
  requirement: ArtifactRequirement,
  links: readonly (MilestoneArtifactLink | TaskArtifactLink)[],
  context: MilestoneArtifactContext | TaskArtifactContext,
  snapshots: ArtifactEvaluationSnapshot[],
  reasons: EvaluationReason[],
): void {
  const minimum = requirement.minimumCount ?? (requirement.required ? 1 : 0);
  const maximum = requirement.maximumCount;
  if (links.length < minimum || (maximum !== undefined && links.length > maximum)) {
    reasons.push({
      code: "artifact_submission_missing",
      subjectId: requirement.id,
      message: `Artifact requirement ${requirement.id} expected ${minimum}${maximum === undefined ? "+" : `..${maximum}`} matching artifact(s), found ${links.length}`,
    });
  }
  for (const link of [...links].sort((a, b) => a.id.localeCompare(b.id))) {
    const artifact = context.artifacts.get(link.artifactId);
    if (artifact === undefined) {
      reasons.push({
        code: "artifact_submission_missing",
        subjectId: requirement.id,
        message: `Linked artifact ${link.artifactId} is absent`,
      });
      continue;
    }
    const intendedVersionId = link.artifactVersionId ?? artifact.currentVersionId;
    if (
      intendedVersionId !== undefined &&
      context.versions.get(intendedVersionId)?.artifactId !== artifact.id
    ) {
      reasons.push({
        code: "artifact_version_missing",
        subjectId: requirement.id,
        message: `Artifact version ${intendedVersionId} is absent or belongs to another artifact`,
      });
      continue;
    }
    const submissions = [...context.submissions.values()].filter(
      (submission) =>
        submission.artifactId === artifact.id &&
        (intendedVersionId === undefined || submission.artifactVersionId === intendedVersionId),
    );
    const submission = latest(
      submissions,
      (item) => item.submittedAt,
      (item) => item.id,
    );
    if (submission === undefined) {
      reasons.push({
        code: "artifact_submission_missing",
        subjectId: requirement.id,
        message: `No submission exists for artifact ${artifact.id}`,
      });
      continue;
    }
    const versionHint = intendedVersionId ?? submission.artifactVersionId;
    const verifications = [...context.verifications.values()].filter(
      (verification) =>
        verification.artifactId === artifact.id &&
        (verification.submissionId === undefined || verification.submissionId === submission.id) &&
        (versionHint === undefined || verification.artifactVersionId === versionHint),
    );
    const verification = latest(
      verifications,
      (item) => item.verifiedAt ?? item.createdAt,
      (item) => item.id,
    );
    if (verification === undefined) {
      reasons.push({
        code: "artifact_verification_missing",
        subjectId: requirement.id,
        message: `No version-consistent verification exists for artifact ${artifact.id}`,
      });
      continue;
    }
    const versionId = versionHint ?? verification.artifactVersionId;
    if (
      versionId === undefined &&
      [...context.versions.values()].some((version) => version.artifactId === artifact.id)
    ) {
      reasons.push({
        code: "artifact_version_missing",
        subjectId: requirement.id,
        message: `Versionable artifact ${artifact.id} was evaluated without an exact version reference`,
      });
      continue;
    }
    const outcome = verificationOutcome(verification);
    snapshots.push({
      artifactRequirementId: requirement.id,
      artifactId: artifact.id,
      ...(versionId === undefined ? {} : { artifactVersionId: versionId }),
      submissionId: submission.id,
      verificationId: verification.id,
      outcome,
    });
    if (outcome === "failed") {
      reasons.push({
        code: "artifact_verification_failed",
        subjectId: requirement.id,
        message: `Verification ${verification.id} has status ${verification.status}`,
      });
    }
  }
}

function verificationOutcome(
  verification: ArtifactVerification,
): "satisfied" | "failed" | "waived" {
  if (verification.status === "verified") return "satisfied";
  if (verification.status === "waived") return "waived";
  return "failed";
}

function latest<T>(
  values: readonly T[],
  timestamp: (value: T) => string,
  id: (value: T) => string,
): T | undefined {
  return [...values]
    .sort(
      (a, b) =>
        timestamp(a).localeCompare(timestamp(b)) || id(a).localeCompare(id(b)),
    )
    .at(-1);
}
