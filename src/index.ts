export type * from "./model/domain.js";
export {
  MilestoneDomainError,
  MilestoneValidationError,
  type MilestoneErrorCode,
  type ValidationIssue,
} from "./model/errors.js";
export * from "./model/protocol.js";
export {
  calculateProgress,
  defaultEvaluationPolicy,
  deriveMilestoneState,
  evaluateAcceptance,
  evaluateArtifacts,
  evaluateCompletion,
  evaluateDependency,
  calculateTaskProgress,
  defaultTaskEvaluationPolicy,
  deriveTaskState,
  evaluateTaskAcceptance,
  evaluateTaskCompletion,
  evaluateTaskDependency,
  evaluateTaskDependencies,
} from "./public/evaluation.js";
export { resolveChallengeEvidenceSources } from "./services/challenge-evidence.js";
export {
  affectedMilestoneIds,
  assertValidGraph,
  blockedMilestoneIds,
  createGraphSnapshot,
  detectCycles,
  downstreamImpact,
  evaluateGraph,
  findUnlockedMilestoneIds,
  readyMilestoneIds,
  validateGraph,
  assertValidTaskGraph,
  createTaskGraphSnapshot,
  detectTaskGraphCycles,
  graphNodeFromTask,
  validateTaskGraph,
  assertValidTaskScopeGraph,
  detectTaskScopeCycles,
  validateTaskScopeGraph,
  assertValidBreakdownHierarchy,
  detectBreakdownCycles,
  validateBreakdownHierarchy,
  type BreakdownHierarchySnapshot,
  type ExecutionDependencyResolver,
  type TaskGateState,
  type TaskGraphNode,
  type TaskGraphSnapshot,
  type TaskScopeGraphSnapshot,
} from "./public/graph.js";
export {
  assertValidMilestone,
  validateMilestone,
  assertValidTask,
  validateTask,
  assertValidBreakdown,
  validateBreakdown,
} from "./public/validation.js";
export * from "./runtime/infrastructure.js";
export * from "./adapters/serialization.js";
export {
  migrateAndDeserializeMilestone,
  migrateMilestoneWire,
  type MilestoneMigrationResult,
  migrateAndDeserializeTask,
  migrateTaskWire,
  type TaskMigrationResult,
  migrateAndDeserializeBreakdown,
  migrateBreakdownWire,
  type BreakdownMigrationResult,
} from "./migrations/index.js";
export { MilestoneEditor } from "./editors/milestone-editor.js";
export { TaskEditor } from "./editors/task-editor.js";
export { BreakdownEditor } from "./editors/breakdown-editor.js";
export type {
  AuthorizationDecision,
  MilestoneAction,
  MilestoneActionSubject,
  MilestoneAuthorizationContext,
  MilestoneAuthorizationInput,
  MilestoneEditorOptions,
  TaskAction,
  TaskActionSubject,
  TaskAuthorizationContext,
  TaskAuthorizationInput,
  TaskEditorOptions,
  BreakdownAction,
  BreakdownAuthorizationContext,
  BreakdownAuthorizationInput,
  BreakdownEditorOptions,
} from "./editors/editor-contracts.js";
export { ApprovalEditor, type TaskApprovalEditor } from "./editors/approval-editor.js";
export { ChallengeEditor, type TaskChallengeEditor } from "./editors/challenge-editor.js";
export { EvidenceEditor, type TaskEvidenceEditor, type ChallengeEvidenceInput } from "./editors/evidence-editor.js";
export { CriteriaEditor, type TaskCriteriaEditor } from "./editors/criteria-editor.js";
export { DefinitionEditor, type TaskDefinitionEditor } from "./editors/definition-editor.js";
export { DeliverableEditor, type TaskDeliverableEditor } from "./editors/deliverable-editor.js";
export { DependencyEditor } from "./editors/dependency-editor.js";
export type { TaskDependencyEditor } from "./editors/task-dependency-editor.js";
export type { TaskTimingEditor } from "./editors/task-timing-editor.js";
export type { TaskReminderEditor } from "./editors/task-reminder-editor.js";
export type { BreakdownDefinitionEditor } from "./editors/breakdown-definition-editor.js";
export type { BreakdownMilestonesEditor } from "./editors/breakdown-milestones-editor.js";
export { ReviewEditor, type TaskReviewEditor } from "./editors/review-editor.js";
export { RevisionEditor, type TaskRevisionEditor } from "./editors/revision-editor.js";
export { MilestoneSourceEditor, SourceEditor, type TaskSourceEditor } from "./editors/source-editor.js";
export { assertValidSourceLink, isDefinitionBearing, resolveSourceLink, resolveSources, sourceLinksForRevision } from "./services/sources.js";
export {
  DEFAULT_EDITOR_HISTORY_LIMIT,
  MAX_EDITOR_HISTORY_LIMIT,
  type MilestoneEditorHistory,
  type TaskEditorHistory,
  type BreakdownEditorHistory,
  MilestoneEditorHistoryController,
  TaskEditorHistoryController,
  BreakdownEditorHistoryController,
} from "./editors/editor-history.js";
export * from "./dom/index.js";