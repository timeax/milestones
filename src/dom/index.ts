/*
 * Public Milestone, Task, and Breakdown DOM API.
 *
 * Important:
 *
 * Do NOT export ./documents/index.js from here.
 *
 * The classes inside documents/ are implementation details. Consumers should
 * program against the contracts in types.ts and construct the DOM through the
 * root document/factory/builder.
 */

/* -------------------------------------------------------------------------- */
/*                              Public contracts                              */
/* -------------------------------------------------------------------------- */

export type * from "./types.js";

/* -------------------------------------------------------------------------- */
/*                               Root documents                               */
/* -------------------------------------------------------------------------- */

export { MilestoneDocument } from "./document.js";
export {
  TaskDocument,
  TaskDocumentBuilder,
  createTaskDocument,
  createTaskDocumentContext,
  type TaskDocumentBuildInput,
  type TaskDocumentContext,
  type TaskProfileDocument,
  type TaskTimingDocument,
  type TaskRemindersDocument,
  type TaskScopeDocument,
  type TaskOverviewDocument,
  type TaskAcceptanceStatusDocument,
  type TaskCompletionStatusDocument,
} from "./task-document.js";
export {
  BreakdownDocument,
  BreakdownDocumentBuilder,
  createBreakdownDocument,
  createBreakdownDocumentContext,
  type BreakdownDocumentBuildInput,
  type BreakdownDocumentContext,
  type BreakdownDefinitionDocument,
  type BreakdownReadinessDocument,
  type MilestoneProfileResolver,
} from "./breakdown-document.js";

/* -------------------------------------------------------------------------- */
/*                                Construction                                */
/* -------------------------------------------------------------------------- */

export {
  createMilestoneDocument,
  createMilestoneDocumentContext,
  MilestoneDocumentBuilder,
  type MilestoneDocumentBuildInput,
} from "./builder.js";
