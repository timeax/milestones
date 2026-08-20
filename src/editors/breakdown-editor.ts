import type {
  Breakdown,
  BreakdownEditResult,
  CreateBreakdownInput,
  MilestoneId,
} from "../model/domain.js";
import { invariant } from "../model/errors.js";
import { assertValidBreakdown } from "../services/validation.js";
import type { BreakdownEditorOptions } from "./editor-contracts.js";
import {
  BreakdownEditorHistoryController,
  createHistoryState,
  historyAwareCommands,
  initializeHistory,
  runTransaction,
  type BreakdownEditorHistory,
} from "./editor-history.js";
import {
  createBreakdownDefinitionEditor,
  type BreakdownDefinitionEditor,
} from "./breakdown-definition-editor.js";
import {
  createBreakdownMilestonesEditor,
  type BreakdownMilestonesEditor,
} from "./breakdown-milestones-editor.js";
import type { DraftBreakdown } from "./internal/draft.js";
import { clone, ensureOpen } from "./internal/helpers.js";
import type { BreakdownEditorSession } from "./internal/session.js";

export class BreakdownEditor {
  private readonly session: BreakdownEditorSession;
  public readonly definition: BreakdownDefinitionEditor;
  public readonly milestones: BreakdownMilestonesEditor;
  public readonly history: BreakdownEditorHistory;

  private constructor(session: BreakdownEditorSession) {
    this.session = session;
    this.definition = historyAwareCommands(session, createBreakdownDefinitionEditor(session));
    this.milestones = historyAwareCommands(session, createBreakdownMilestonesEditor(session));
    this.history = new BreakdownEditorHistoryController(session);
  }

  public static create(input: CreateBreakdownInput, options: BreakdownEditorOptions): BreakdownEditor {
    const id = input.id ?? options.ids.breakdown();
    const now = options.clock.now();
    const breakdown: Breakdown = {
      id,
      parentMilestoneId: input.parentMilestoneId,
      ...(input.owner === undefined ? {} : { owner: clone(input.owner) }),
      definition: clone(input.definition),
      milestones: input.milestones === undefined ? [] : clone(input.milestones),
      sequence: 1,
      createdAt: now,
      updatedAt: now,
    };
    return BreakdownEditor.open(breakdown, { ...options, expectedSequence: 1 });
  }

  public static open(breakdown: Breakdown, options: BreakdownEditorOptions): BreakdownEditor {
    assertValidBreakdown(breakdown);
    invariant(
      options.expectedSequence === undefined || options.expectedSequence === breakdown.sequence,
      "CONCURRENCY_CONFLICT",
      `Expected breakdown sequence ${options.expectedSequence}, found ${breakdown.sequence}`,
      { expectedSequence: options.expectedSequence, actualSequence: breakdown.sequence },
    );

    const draft: DraftBreakdown = clone({
      ...breakdown,
      milestones: [...breakdown.milestones],
    });

    const session: BreakdownEditorSession = {
      original: clone(breakdown),
      draft,
      clock: options.clock,
      ids: options.ids,
      expectedSequence: breakdown.sequence,
      ...(options.correlationId === undefined ? {} : { correlationId: options.correlationId }),
      ...(options.causationId === undefined ? {} : { causationId: options.causationId }),
      ...(options.authorization === undefined ? {} : { authorization: options.authorization }),
      changes: [],
      events: [],
      historyState: createHistoryState(options.historyLimit),
      closed: false,
    };

    initializeHistory(session);
    return new BreakdownEditor(session);
  }

  public get breakdown(): Breakdown {
    return clone(this.session.draft) as Breakdown;
  }

  public get parentMilestoneId(): MilestoneId {
    return this.session.draft.parentMilestoneId;
  }

  public get isDirty(): boolean {
    return this.session.changes.length > 0;
  }

  public transact<T>(label: string, operation: (editor: BreakdownEditor) => T): T {
    return runTransaction(this.session, label, () => operation(this));
  }

  public commit(): BreakdownEditResult {
    ensureOpen(this.session);
    assertValidBreakdown(this.session.draft as any);
    this.session.closed = true;
    return {
      breakdown: clone(this.session.draft) as Breakdown,
      events: clone(this.session.events),
      changes: clone(this.session.changes),
    };
  }

  public rollback(): void {
    ensureOpen(this.session);
    this.session.closed = true;
  }
}
