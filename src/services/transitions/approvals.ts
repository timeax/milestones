import type {
  ApprovalGrantedRecord,
  ApprovalRecordId,
  Milestone,
} from "../../model/domain.js";
import { invariant } from "../../model/errors.js";

export function assertRevocableApproval(
  milestone: Milestone,
  approvalId: ApprovalRecordId,
): ApprovalGrantedRecord {
  const approval = milestone.approvalRecords.find((item) => item.id === approvalId);
  invariant(
    approval?.type === "granted",
    "INVALID_ARGUMENT",
    `Approval ${approvalId} is not a granted approval`,
  );
  invariant(
    approval.milestoneId === milestone.id,
    "INVALID_ARGUMENT",
    `Approval ${approvalId} belongs to another milestone`,
  );
  invariant(
    milestone.approvalPolicy?.stages.some((stage) => stage.id === approval.stageId),
    "INVALID_ARGUMENT",
    `Approval ${approvalId} belongs to an unknown approval stage`,
  );
  invariant(
    approval.milestoneRevisionId === milestone.currentRevisionId,
    "INVALID_ARGUMENT",
    "Only an approval for the current revision can be revoked",
  );
  invariant(
    !milestone.approvalRecords.some(
      (item) => item.type === "revoked" && item.revokesApprovalId === approvalId,
    ),
    "INVALID_STATE_TRANSITION",
    `Approval ${approvalId} is already revoked`,
  );
  return approval;
}
