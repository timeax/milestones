import { invariant } from "../model/errors.js";
import { clone, ensureOpen, equalDomainValue, requiredText } from "./internal/helpers.js";
import type {
  BreakdownEditorHistorySnapshot,
  BreakdownEditorSession,
  EditorHistorySnapshot,
  EditorHistoryState,
  EditorSession,
  TaskEditorHistorySnapshot,
  TaskEditorSession,
} from "./internal/session.js";

export const DEFAULT_EDITOR_HISTORY_LIMIT = 100;
export const MAX_EDITOR_HISTORY_LIMIT = 1_000;

export interface MilestoneEditorHistory {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly index: number;
  readonly length: number;
  undo(): boolean;
  redo(): boolean;
  clear(): void;
}

export type TaskEditorHistory = MilestoneEditorHistory;
export type BreakdownEditorHistory = MilestoneEditorHistory;

export function createHistoryState<T>(limit = DEFAULT_EDITOR_HISTORY_LIMIT): EditorHistoryState<T> {
  invariant(
    Number.isSafeInteger(limit) && limit >= 0 && limit <= MAX_EDITOR_HISTORY_LIMIT,
    "INVALID_ARGUMENT",
    `historyLimit must be an integer between 0 and ${MAX_EDITOR_HISTORY_LIMIT}`,
    { historyLimit: limit },
  );
  return {
    snapshots: [],
    index: 0,
    limit,
    transactionDepth: 0,
    transactionMutationCount: 0,
  };
}

export function initializeHistory(session: EditorSession | TaskEditorSession | BreakdownEditorSession): void {
  session.historyState.snapshots = [captureHistorySnapshot(session) as any];
  session.historyState.index = 0;
}

export class MilestoneEditorHistoryController implements MilestoneEditorHistory {
  public constructor(private readonly session: EditorSession | TaskEditorSession | BreakdownEditorSession) {}

  public get canUndo(): boolean {
    return !this.session.closed && this.session.historyState.index > 0;
  }

  public get canRedo(): boolean {
    return (
      !this.session.closed &&
      this.session.historyState.index < this.session.historyState.snapshots.length - 1
    );
  }

  public get index(): number {
    return this.session.historyState.index;
  }

  public get length(): number {
    return this.session.historyState.snapshots.length;
  }

  public undo(): boolean {
    ensureOpen(this.session);
    assertOutsideTransaction(this.session);
    if (!this.canUndo) return false;
    this.session.historyState.index -= 1;
    restoreHistorySnapshot(
      this.session,
      this.session.historyState.snapshots[this.session.historyState.index]!,
    );
    return true;
  }

  public redo(): boolean {
    ensureOpen(this.session);
    assertOutsideTransaction(this.session);
    if (!this.canRedo) return false;
    this.session.historyState.index += 1;
    restoreHistorySnapshot(
      this.session,
      this.session.historyState.snapshots[this.session.historyState.index]!,
    );
    return true;
  }

  public clear(): void {
    ensureOpen(this.session);
    assertOutsideTransaction(this.session);
    this.session.historyState.snapshots = [captureHistorySnapshot(this.session) as any];
    this.session.historyState.index = 0;
  }
}

export class TaskEditorHistoryController extends MilestoneEditorHistoryController {}
export class BreakdownEditorHistoryController extends MilestoneEditorHistoryController {}

/**
 * Adds session history semantics to a command-only sub-editor. Query methods
 * belong on a direct reader/facade and must not be added to this command proxy.
 */
export function historyAwareCommands<T extends object>(
  session: EditorSession | TaskEditorSession | BreakdownEditorSession,
  editor: T,
): T {
  return new Proxy(editor, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) =>
        runMutation(
          session as any,
          () => Reflect.apply(value, target, args) as unknown,
        );
    },
  });
}

export function runMutation<T>(
  session: EditorSession | TaskEditorSession | BreakdownEditorSession,
  operation: () => T,
): T {
  ensureOpen(session);
  const before = captureHistorySnapshot(session);
  try {
    const result = operation();
    const after = captureHistorySnapshot(session);
    if (!sameSnapshot(before, after)) {
      if (session.historyState.transactionDepth > 0) {
        session.historyState.transactionMutationCount += 1;
      } else {
        appendHistorySnapshot(session, after as any);
      }
    }
    return result;
  } catch (error) {
    restoreHistorySnapshot(session, before);
    throw error;
  }
}

export function runTransaction<T>(
  session: EditorSession | TaskEditorSession | BreakdownEditorSession,
  label: string,
  operation: () => T,
): T {
  ensureOpen(session);
  requiredText(label, "Transaction label");
  const before = captureHistorySnapshot(session);
  const mutationCountBefore = session.historyState.transactionMutationCount;
  const isOutermost = session.historyState.transactionDepth === 0;
  session.historyState.transactionDepth += 1;
  try {
    const result = operation();
    session.historyState.transactionDepth -= 1;
    if (isOutermost) {
      const mutated = session.historyState.transactionMutationCount > mutationCountBefore;
      session.historyState.transactionMutationCount = mutationCountBefore;
      if (mutated) appendHistorySnapshot(session, captureHistorySnapshot(session) as any);
    }
    return result;
  } catch (error) {
    session.historyState.transactionDepth -= 1;
    session.historyState.transactionMutationCount = mutationCountBefore;
    restoreHistorySnapshot(session, before);
    throw error;
  }
}

function appendHistorySnapshot(
  session: EditorSession | TaskEditorSession | BreakdownEditorSession,
  snapshot: EditorHistorySnapshot | TaskEditorHistorySnapshot | BreakdownEditorHistorySnapshot,
): void {
  const state = session.historyState as EditorHistoryState<any>;
  state.snapshots = state.snapshots.slice(0, state.index + 1);
  state.snapshots.push(clone(snapshot));
  const maximumPoints = state.limit + 1;
  if (state.snapshots.length > maximumPoints) {
    state.snapshots.splice(0, state.snapshots.length - maximumPoints);
  }
  state.index = state.snapshots.length - 1;
}

function captureHistorySnapshot(
  session: EditorSession | TaskEditorSession | BreakdownEditorSession,
): EditorHistorySnapshot | TaskEditorHistorySnapshot | BreakdownEditorHistorySnapshot {
  if ("profile" in session) {
    return clone({
      draft: session.draft,
      profile: session.profile,
      changes: session.changes,
      events: session.events,
      invalidations: session.invalidations,
      ...(session.revision === undefined ? {} : { revision: session.revision }),
    } as any);
  } else {
    return clone({
      draft: session.draft,
      changes: session.changes,
      events: session.events,
    });
  }
}

function restoreHistorySnapshot(
  session: EditorSession | TaskEditorSession | BreakdownEditorSession,
  snapshot: EditorHistorySnapshot | TaskEditorHistorySnapshot | BreakdownEditorHistorySnapshot,
): void {
  const restored = clone(snapshot) as any;
  session.draft = restored.draft;
  if ("profile" in session) {
    (session as any).profile = restored.profile;
    (session as any).invalidations = [...restored.invalidations];
    if (restored.revision === undefined) delete (session as any).revision;
    else (session as any).revision = restored.revision;
  }
  session.changes = [...restored.changes];
  session.events = [...restored.events];
}

function sameSnapshot(left: unknown, right: unknown): boolean {
  return equalDomainValue(left, right);
}

function assertOutsideTransaction(
  session: EditorSession | TaskEditorSession | BreakdownEditorSession,
): void {
  invariant(
    session.historyState.transactionDepth === 0,
    "INVALID_STATE_TRANSITION",
    "History navigation is not allowed inside an active editor transaction",
  );
}
