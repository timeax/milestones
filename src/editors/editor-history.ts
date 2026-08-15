import { invariant } from "../model/errors.js";
import { clone, ensureOpen, equalDomainValue, requiredText } from "./internal/helpers.js";
import type {
  EditorHistorySnapshot,
  EditorHistoryState,
  EditorSession,
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

export function createHistoryState(limit = DEFAULT_EDITOR_HISTORY_LIMIT): EditorHistoryState {
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

export function initializeHistory(session: EditorSession): void {
  session.historyState.snapshots = [captureHistorySnapshot(session)];
  session.historyState.index = 0;
}

export class MilestoneEditorHistoryController implements MilestoneEditorHistory {
  public constructor(private readonly session: EditorSession) {}

  public get canUndo(): boolean {
    return !this.session.closed && this.session.historyState.index > 0;
  }

  public get canRedo(): boolean {
    return !this.session.closed
      && this.session.historyState.index < this.session.historyState.snapshots.length - 1;
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
    this.session.historyState.snapshots = [captureHistorySnapshot(this.session)];
    this.session.historyState.index = 0;
  }
}

/**
 * Adds session history semantics to a command-only sub-editor. Query methods
 * belong on a direct reader/facade and must not be added to this command proxy.
 */
export function historyAwareCommands<T extends object>(session: EditorSession, editor: T): T {
  return new Proxy(editor, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => runMutation(
        session,
        () => Reflect.apply(value, target, args) as unknown,
      );
    },
  });
}

export function runMutation<T>(session: EditorSession, operation: () => T): T {
  ensureOpen(session);
  const before = captureHistorySnapshot(session);
  try {
    const result = operation();
    const after = captureHistorySnapshot(session);
    if (!sameSnapshot(before, after)) {
      if (session.historyState.transactionDepth > 0) {
        session.historyState.transactionMutationCount += 1;
      } else {
        appendHistorySnapshot(session, after);
      }
    }
    return result;
  } catch (error) {
    restoreHistorySnapshot(session, before);
    throw error;
  }
}

export function runTransaction<T>(
  session: EditorSession,
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
      if (mutated) appendHistorySnapshot(session, captureHistorySnapshot(session));
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
  session: EditorSession,
  snapshot: EditorHistorySnapshot,
): void {
  const state = session.historyState;
  state.snapshots = state.snapshots.slice(0, state.index + 1);
  state.snapshots.push(clone(snapshot));
  const maximumPoints = state.limit + 1;
  if (state.snapshots.length > maximumPoints) {
    state.snapshots.splice(0, state.snapshots.length - maximumPoints);
  }
  state.index = state.snapshots.length - 1;
}

function captureHistorySnapshot(session: EditorSession): EditorHistorySnapshot {
  return clone({
    draft: session.draft,
    profile: session.profile,
    changes: session.changes,
    events: session.events,
    invalidations: session.invalidations,
    ...(session.revision === undefined ? {} : { revision: session.revision }),
  });
}

function restoreHistorySnapshot(
  session: EditorSession,
  snapshot: EditorHistorySnapshot,
): void {
  const restored = clone(snapshot);
  session.draft = restored.draft;
  session.profile = restored.profile;
  session.changes = [...restored.changes];
  session.events = [...restored.events];
  session.invalidations = [...restored.invalidations];
  if (restored.revision === undefined) delete session.revision;
  else session.revision = restored.revision;
}

function sameSnapshot(left: EditorHistorySnapshot, right: EditorHistorySnapshot): boolean {
  return equalDomainValue(left, right);
}

function assertOutsideTransaction(session: EditorSession): void {
  invariant(
    session.historyState.transactionDepth === 0,
    "INVALID_STATE_TRANSITION",
    "History navigation is not allowed inside an active editor transaction",
  );
}
