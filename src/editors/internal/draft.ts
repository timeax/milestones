import type {
  ApprovalRecord,
  Breakdown,
  ChallengeEvidence,
  Criterion,
  DeliverableRequirement,
  Milestone,
  MilestoneChallenge,
  MilestoneDependency,
  MilestoneReview,
  MilestoneRevision,
  Task,
  TaskAcceptance,
  TaskApprovalRecord,
  TaskChallenge,
  TaskChallengeEvidence,
  TaskCompletion,
  TaskCriterion,
  TaskDeliverableRequirement,
  TaskDependency,
  TaskReminder,
  TaskReview,
  TaskRevision,
} from "../../model/domain.js";

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface DraftMilestone extends Omit<
  Mutable<Milestone>,
  | "revisions"
  | "criteria"
  | "deliverables"
  | "dependencies"
  | "challenges"
  | "reviews"
  | "approvalRecords"
  | "acceptanceRecords"
  | "completionRecords"
> {
  revisions: MilestoneRevision[];
  criteria: Criterion[];
  deliverables: DeliverableRequirement[];
  dependencies: MilestoneDependency[];
  challenges: (Omit<Mutable<MilestoneChallenge>, "evidence"> & { evidence: Mutable<ChallengeEvidence>[] })[];
  reviews: Mutable<MilestoneReview>[];
  approvalRecords: ApprovalRecord[];
  acceptanceRecords: Milestone["acceptanceRecords"][number][];
  completionRecords: Milestone["completionRecords"][number][];
}

export interface DraftTask extends Omit<
  Mutable<Task>,
  | "revisions"
  | "criteria"
  | "deliverables"
  | "dependencies"
  | "challenges"
  | "reviews"
  | "approvalRecords"
  | "acceptanceRecords"
  | "completionRecords"
  | "reminders"
> {
  revisions: TaskRevision[];
  criteria: TaskCriterion[];
  deliverables: TaskDeliverableRequirement[];
  dependencies: TaskDependency[];
  challenges: (Omit<Mutable<TaskChallenge>, "evidence"> & { evidence: Mutable<TaskChallengeEvidence>[] })[];
  reviews: Mutable<TaskReview>[];
  approvalRecords: TaskApprovalRecord[];
  acceptanceRecords: TaskAcceptance[];
  completionRecords: TaskCompletion[];
  reminders: TaskReminder[];
}

export interface DraftBreakdown extends Omit<Mutable<Breakdown>, "milestones"> {
  milestones: Milestone[];
}
