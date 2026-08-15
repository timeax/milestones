import type {
  ActorRef,
  ApprovalRecord,
  ApprovalRecordId,
  ApprovalStage,
  ApprovalStageId,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { evaluateApprovalStage } from "../services/evaluation.js";
import { assertRevocableApproval } from "../services/transitions/approvals.js";
import { emit } from "./internal/events.js";
import { authorize, clone, ensureOpen, equalDomainValue, feature, requiredText } from "./internal/helpers.js";
import { applyReopen, beginMaterialRevision } from "./internal/revision.js";
import type { EditorSession } from "./internal/session.js";

interface ApprovalStageEditOptions {
  readonly reason?: string;
  readonly actor?: ActorRef;
}

export class ApprovalEditor {
  private readonly session: EditorSession;

  public constructor(session: never) {
    this.session = session as EditorSession;
  }

  public grant(stageId: ApprovalStageId, actor: ActorRef): ApprovalRecordId {
    ensureOpen(this.session);
    return this.record(stageId, actor, "granted");
  }

  public reject(stageId: ApprovalStageId, actor: ActorRef, reason?: string): ApprovalRecordId {
    ensureOpen(this.session);
    return this.record(stageId, actor, "rejected", reason);
  }

  public waive(stageId: ApprovalStageId, actor: ActorRef, reason: string): ApprovalRecordId {
    ensureOpen(this.session);
    requiredText(reason, "Waiver reason");
    return this.record(stageId, actor, "waived", reason);
  }

  public revoke(approvalId: ApprovalRecordId, actor: ActorRef, reason?: string): ApprovalRecordId {
    ensureOpen(this.session);
    feature(this.session.profile.approvals.enabled, "approvals");
    const approval = assertRevocableApproval(this.session.draft, approvalId);
    const authorityStage = this.stage(approval.stageId);
    authorize(this.session, "approval.revoke", actor, {
      type: "approval_record",
      approvalRecordId: approvalId,
      approvalStageId: approval.stageId,
      ...(authorityStage.authorityRef === undefined ? {} : { authorityRef: authorityStage.authorityRef }),
    });
    const record = {
      id: this.session.ids.approvalRecord(),
      type: "revoked" as const,
      milestoneId: this.session.draft.id,
      milestoneRevisionId: this.session.draft.currentRevisionId,
      stageId: approval.stageId,
      actor,
      revokesApprovalId: approvalId,
      ...(reason === undefined ? {} : { reason }),
      createdAt: this.session.clock.now(),
    };
    this.session.draft.approvalRecords.push(record);
    this.session.changes.push({ type: "approval_recorded", approvalRecordId: record.id });
    emit(this.session, "approval.revoked", { record }, actor);
    const stage = this.stage(approval.stageId);
    if (
      stage.required
      && !evaluateApprovalStage(this.session.draft, stage).satisfied
      && this.session.draft.currentAcceptanceId !== undefined
    ) {
      applyReopen(this.session, {
        effect: "invalidate_acceptance_and_completion",
        reason: `Required approval ${approvalId} was revoked`,
        actor,
        cause: { type: "approval_revocation", approvalRecordId: record.id },
      });
    }
    return record.id;
  }

  public addStage(
    input: Omit<ApprovalStage, "id">,
    options: ApprovalStageEditOptions = {},
  ): ApprovalStageId {
    ensureOpen(this.session);
    feature(this.session.profile.approvals.enabled, "approvals");
    requiredText(input.label, "Approval stage label");
    invariant(
      Number.isSafeInteger(input.requiredApprovalCount)
        && input.requiredApprovalCount >= (input.required ? 1 : 0),
      "INVALID_ARGUMENT",
      "Invalid required approval count",
    );
    beginMaterialRevision(this.session, options.reason, options.actor);
    const stage = { id: this.session.ids.approvalStage(), ...clone(input) };
    const stages = [...(this.session.draft.approvalPolicy?.stages ?? []), stage];
    this.session.draft.approvalPolicy = { stages };
    this.session.changes.push({ type: "approval_policy_changed", approvalStageId: stage.id });
    emit(this.session, "approval_stage.added", { stage }, options.actor);
    return stage.id;
  }

  public updateStage(
    id: ApprovalStageId,
    patch: Partial<Omit<ApprovalStage, "id">>,
    options: ApprovalStageEditOptions = {},
  ): void {
    ensureOpen(this.session);
    const stage = this.stage(id);
    const updated = { ...stage, ...clone(patch), id };
    requiredText(updated.label, "Approval stage label");
    invariant(
      Number.isSafeInteger(updated.requiredApprovalCount)
        && updated.requiredApprovalCount >= (updated.required ? 1 : 0),
      "INVALID_ARGUMENT",
      "Invalid required approval count",
    );
    if (equalDomainValue(stage, updated)) return;
    beginMaterialRevision(this.session, options.reason, options.actor);
    this.session.draft.approvalPolicy = {
      stages: this.session.draft.approvalPolicy!.stages.map(
        (item) => item.id === id ? updated : item,
      ),
    };
    this.session.changes.push({ type: "approval_policy_changed", approvalStageId: id });
    emit(this.session, "approval_stage.changed", { stage: updated }, options.actor);
  }

  public removeStage(id: ApprovalStageId, options: ApprovalStageEditOptions = {}): void {
    ensureOpen(this.session);
    this.stage(id);
    beginMaterialRevision(this.session, options.reason, options.actor);
    this.session.draft.approvalPolicy = {
      stages: this.session.draft.approvalPolicy!.stages.filter((item) => item.id !== id),
    };
    this.session.changes.push({ type: "approval_policy_changed", approvalStageId: id });
    emit(this.session, "approval_stage.removed", { approvalStageId: id }, options.actor);
  }

  private record(
    stageId: ApprovalStageId,
    actor: ActorRef,
    type: "granted" | "rejected" | "waived",
    reason?: string,
  ): ApprovalRecordId {
    ensureOpen(this.session);
    feature(this.session.profile.approvals.enabled, "approvals");
    const stage = this.stage(stageId);
    authorize(
      this.session,
      type === "granted" ? "approval.grant" : type === "rejected" ? "approval.reject" : "approval.waive",
      actor,
      {
        type: "approval_stage",
        approvalStageId: stageId,
        ...(stage.authorityRef === undefined ? {} : { authorityRef: stage.authorityRef }),
      },
    );
    if (type === "granted") {
      invariant(
        !effectiveDuplicate(
          this.session.draft.approvalRecords,
          stageId,
          this.session.draft.currentRevisionId,
          actor,
        ),
        "INVALID_STATE_TRANSITION",
        "Actor already has an effective approval for this stage and revision",
      );
    }
    const record = {
      id: this.session.ids.approvalRecord(),
      type,
      milestoneId: this.session.draft.id,
      milestoneRevisionId: this.session.draft.currentRevisionId,
      stageId,
      actor,
      ...(reason === undefined ? {} : { reason }),
      createdAt: this.session.clock.now(),
    } as ApprovalRecord;
    this.session.draft.approvalRecords.push(record);
    this.session.changes.push({ type: "approval_recorded", approvalRecordId: record.id });
    if (record.type === "revoked") throw new Error("Unreachable");
    emit(this.session, "approval.recorded", { record }, actor);
    return record.id;
  }

  private stage(id: ApprovalStageId): ApprovalStage {
    const stage = this.session.draft.approvalPolicy?.stages.find((item) => item.id === id);
    invariant(stage !== undefined, "NOT_FOUND", `Approval stage ${id} was not found`);
    return stage;
  }
}

export function createApprovalEditor(session: EditorSession): ApprovalEditor {
  return new ApprovalEditor(session as never);
}

function effectiveDuplicate(
  records: readonly ApprovalRecord[],
  stageId: ApprovalStageId,
  revisionId: string,
  actor: ActorRef,
): boolean {
  const grants = records.filter(
    (record) => record.type === "granted"
      && record.stageId === stageId
      && record.milestoneRevisionId === revisionId
      && record.actor.id === actor.id
      && record.actor.type === actor.type,
  );
  const revoked = new Set(
    records.filter((record) => record.type === "revoked").map((record) => record.revokesApprovalId),
  );
  return grants.some((grant) => !revoked.has(grant.id));
}
