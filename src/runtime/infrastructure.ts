import type {
  AcceptanceId,
  ApprovalRecordId,
  ApprovalStageId,
  ChallengeId,
  ChallengeEvidenceId,
  CompletionId,
  CriterionId,
  DeliverableRequirementId,
  DependencyId,
  MilestoneClock,
  MilestoneEventId,
  MilestoneId,
  MilestoneIdGenerator,
  MilestoneProfileId,
  MilestoneRevisionId,
  ReviewId,
} from "../model/domain.js";

export class SystemMilestoneClock implements MilestoneClock {
  public now(): string { return new Date().toISOString(); }
}

export class FixedMilestoneClock implements MilestoneClock {
  public constructor(private value: string) {}
  public now(): string { return this.value; }
  public set(value: string): void { this.value = value; }
}

export class SequenceMilestoneIdGenerator implements MilestoneIdGenerator {
  private nextValue = 0;
  public constructor(private readonly prefix = "ms") {}
  private next(kind: string): string { this.nextValue += 1; return `${this.prefix}_${kind}_${this.nextValue}`; }
  public milestone(): MilestoneId { return this.next("milestone") as MilestoneId; }
  public revision(): MilestoneRevisionId { return this.next("revision") as MilestoneRevisionId; }
  public criterion(): CriterionId { return this.next("criterion") as CriterionId; }
  public deliverableRequirement(): DeliverableRequirementId { return this.next("deliverable") as DeliverableRequirementId; }
  public dependency(): DependencyId { return this.next("dependency") as DependencyId; }
  public challenge(): ChallengeId { return this.next("challenge") as ChallengeId; }
  public challengeEvidence(): ChallengeEvidenceId { return this.next("challenge_evidence") as ChallengeEvidenceId; }
  public review(): ReviewId { return this.next("review") as ReviewId; }
  public approvalStage(): ApprovalStageId { return this.next("approval_stage") as ApprovalStageId; }
  public approvalRecord(): ApprovalRecordId { return this.next("approval_record") as ApprovalRecordId; }
  public acceptance(): AcceptanceId { return this.next("acceptance") as AcceptanceId; }
  public completion(): CompletionId { return this.next("completion") as CompletionId; }
  public event(): MilestoneEventId { return this.next("event") as MilestoneEventId; }
}

export const asMilestoneId = (value: string): MilestoneId => value as MilestoneId;
export const asMilestoneProfileId = (value: string): MilestoneProfileId => value as MilestoneProfileId;
export const asMilestoneRevisionId = (value: string): MilestoneRevisionId => value as MilestoneRevisionId;
export const asCriterionId = (value: string): CriterionId => value as CriterionId;
export const asDeliverableRequirementId = (value: string): DeliverableRequirementId => value as DeliverableRequirementId;
export const asDependencyId = (value: string): DependencyId => value as DependencyId;
export const asChallengeId = (value: string): ChallengeId => value as ChallengeId;
export const asChallengeEvidenceId = (value: string): ChallengeEvidenceId => value as ChallengeEvidenceId;
export const asReviewId = (value: string): ReviewId => value as ReviewId;
export const asApprovalStageId = (value: string): ApprovalStageId => value as ApprovalStageId;
export const asApprovalRecordId = (value: string): ApprovalRecordId => value as ApprovalRecordId;
export const asAcceptanceId = (value: string): AcceptanceId => value as AcceptanceId;
export const asCompletionId = (value: string): CompletionId => value as CompletionId;
export const asMilestoneEventId = (value: string): MilestoneEventId => value as MilestoneEventId;
