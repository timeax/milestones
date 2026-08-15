import type {
  ApprovalRecord,
  Criterion,
  DeliverableRequirement,
  Milestone,
  MilestoneDependency,
  MilestoneReview,
  MilestoneRevision,
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
  challenges: Mutable<Milestone["challenges"][number]>[];
  reviews: Mutable<MilestoneReview>[];
  approvalRecords: ApprovalRecord[];
  acceptanceRecords: Milestone["acceptanceRecords"][number][];
  completionRecords: Milestone["completionRecords"][number][];
}
