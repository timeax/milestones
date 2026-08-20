import { invariant } from "../../model/errors.js";
import type { ActorRef, Breakdown, Milestone, Task } from "../../model/domain.js";
import type {
  BreakdownAction,
  MilestoneAction,
  MilestoneActionSubject,
  TaskAction,
  TaskActionSubject,
} from "../editor-contracts.js";
import type { BreakdownEditorSession, EditorSession, TaskEditorSession } from "./session.js";

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function equalDomainValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((value, index) => equalDomainValue(value, right[index]))
    );
  }
  if (left !== null && right !== null && typeof left === "object" && typeof right === "object") {
    const leftRecord = left as Readonly<Record<string, unknown>>;
    const rightRecord = right as Readonly<Record<string, unknown>>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return (
      equalDomainValue(leftKeys, rightKeys) &&
      leftKeys.every((key) => equalDomainValue(leftRecord[key], rightRecord[key]))
    );
  }
  return false;
}

export function ensureOpen(session: { readonly closed: boolean }): void {
  invariant(!session.closed, "EDITOR_CLOSED", "The editor session is closed");
}

export function feature(enabled: boolean, name: string): void {
  invariant(enabled, "FEATURE_DISABLED", `${name} is disabled by the profile`, { feature: name });
}

export function requiredText(value: string, name: string): void {
  invariant(value.trim().length > 0, "INVALID_ARGUMENT", `${name} must be non-empty`);
}

export function authorize(
  session: EditorSession,
  action: MilestoneAction,
  actor?: ActorRef,
  subject?: MilestoneActionSubject,
): void {
  if (session.authorization === undefined) return;
  const decision = session.authorization.canPerform({
    action,
    ...(actor === undefined ? {} : { actor: clone(actor) }),
    milestone: clone(session.draft) as Milestone,
    ...(subject === undefined ? {} : { subject: clone(subject) }),
  });
  const allowed = typeof decision === "boolean" ? decision : decision.allowed;
  const reason = typeof decision === "boolean" ? undefined : decision.reason;
  const details = typeof decision === "boolean" ? undefined : decision.details;
  invariant(allowed, "AUTHORIZATION_DENIED", reason ?? `Action ${action} is not authorized`, {
    action,
    ...(subject === undefined ? {} : { subject }),
    ...(details === undefined ? {} : { authorization: details }),
  });
}

export function authorizeTask(
  session: TaskEditorSession,
  action: TaskAction,
  actor?: ActorRef,
  subject?: TaskActionSubject,
): void {
  if (session.authorization === undefined) return;
  const decision = session.authorization.canPerform({
    action,
    ...(actor === undefined ? {} : { actor: clone(actor) }),
    task: clone(session.draft) as Task,
    ...(subject === undefined ? {} : { subject: clone(subject) }),
  });
  const allowed = typeof decision === "boolean" ? decision : decision.allowed;
  const reason = typeof decision === "boolean" ? undefined : decision.reason;
  const details = typeof decision === "boolean" ? undefined : decision.details;
  invariant(allowed, "AUTHORIZATION_DENIED", reason ?? `Action ${action} is not authorized`, {
    action,
    ...(subject === undefined ? {} : { subject }),
    ...(details === undefined ? {} : { authorization: details }),
  });
}

export function authorizeBreakdown(
  session: BreakdownEditorSession,
  action: BreakdownAction,
  actor?: ActorRef,
  milestoneId?: import("../../model/domain.js").MilestoneId,
): void {
  if (session.authorization === undefined) return;
  const decision = session.authorization.canPerform({
    action,
    ...(actor === undefined ? {} : { actor: clone(actor) }),
    breakdown: clone(session.draft) as Breakdown,
    ...(milestoneId === undefined ? {} : { milestoneId }),
  });
  const allowed = typeof decision === "boolean" ? decision : decision.allowed;
  const reason = typeof decision === "boolean" ? undefined : decision.reason;
  const details = typeof decision === "boolean" ? undefined : decision.details;
  invariant(allowed, "AUTHORIZATION_DENIED", reason ?? `Action ${action} is not authorized`, {
    action,
    ...(milestoneId === undefined ? {} : { milestoneId }),
    ...(details === undefined ? {} : { authorization: details }),
  });
}
