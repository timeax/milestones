import type {
  AcceptanceId,
  ApprovalRecordId,
  ApprovalStageId,
  BreakdownClock,
  BreakdownEventId,
  BreakdownId,
  BreakdownIdGenerator,
  ChallengeEvidenceId,
  ChallengeId,
  CompletionId,
  CriterionId,
  DeliverableRequirementId,
  DependencyId,
  ExecutionClock,
  MilestoneClock,
  MilestoneEventId,
  MilestoneId,
  MilestoneIdGenerator,
  MilestoneRevisionId,
  ReviewId,
  TaskClock,
  TaskEventId,
  TaskId,
  TaskIdGenerator,
  TaskReminderId,
  TaskRevisionId,
} from "../model/domain.js";

export class SystemMilestoneClock implements MilestoneClock, TaskClock, BreakdownClock, ExecutionClock {
  public now(): string { return new Date().toISOString(); }
}

export class FixedMilestoneClock implements MilestoneClock, TaskClock, BreakdownClock, ExecutionClock {
  public constructor(private value: string) {}
  public now(): string { return this.value; }
  public set(value: string): void { this.value = value; }
}

export class SystemTaskClock extends SystemMilestoneClock {}
export class FixedTaskClock extends FixedMilestoneClock {}
export class SystemBreakdownClock extends SystemMilestoneClock {}
export class FixedBreakdownClock extends FixedMilestoneClock {}

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

export class SequenceTaskIdGenerator implements TaskIdGenerator {
  private nextValue = 0;
  public constructor(private readonly prefix = "task") {}
  private next(kind: string): string { this.nextValue += 1; return `${this.prefix}_${kind}_${this.nextValue}`; }
  public task(): TaskId { return this.next("task") as TaskId; }
  public revision(): TaskRevisionId { return this.next("revision") as TaskRevisionId; }
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
  public reminder(): TaskReminderId { return this.next("reminder") as TaskReminderId; }
  public event(): TaskEventId { return this.next("event") as TaskEventId; }
}

export class SequenceBreakdownIdGenerator implements BreakdownIdGenerator {
  private nextValue = 0;
  public constructor(private readonly prefix = "breakdown") {}
  private next(kind: string): string { this.nextValue += 1; return `${this.prefix}_${kind}_${this.nextValue}`; }
  public breakdown(): BreakdownId { return this.next("breakdown") as BreakdownId; }
  public event(): BreakdownEventId { return this.next("event") as BreakdownEventId; }
}

export {
  asMilestoneId,
  asMilestoneProfileId,
  asMilestoneRevisionId,
  asMilestoneEventId,
  asTaskId,
  asTaskProfileId,
  asTaskRevisionId,
  asTaskEventId,
  asTaskReminderId,
  asBreakdownId,
  asBreakdownEventId,
  asCriterionId,
  asDeliverableRequirementId,
  asDependencyId,
  asChallengeId,
  asChallengeEvidenceId,
  asReviewId,
  asApprovalStageId,
  asApprovalRecordId,
  asAcceptanceId,
  asCompletionId,
} from "../model/ids.js";
