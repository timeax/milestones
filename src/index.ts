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
} from "./public/graph.js";
export {
  assertValidMilestone,
  validateMilestone,
} from "./public/validation.js";
export * from "./runtime/infrastructure.js";
export * from "./adapters/serialization.js";
export {
  migrateAndDeserializeMilestone,
  migrateMilestoneWire,
  type MilestoneMigrationResult,
} from "./migrations/index.js";
export { MilestoneEditor } from "./editors/milestone-editor.js";
export type {
  AuthorizationDecision,
  MilestoneAction,
  MilestoneActionSubject,
  MilestoneAuthorizationContext,
  MilestoneAuthorizationInput,
  MilestoneEditorOptions,
} from "./editors/editor-contracts.js";
export { ApprovalEditor } from "./editors/approval-editor.js";
export { ChallengeEditor } from "./editors/challenge-editor.js";
export { EvidenceEditor, type ChallengeEvidenceInput } from "./editors/evidence-editor.js";
export { CriteriaEditor } from "./editors/criteria-editor.js";
export { DefinitionEditor } from "./editors/definition-editor.js";
export { DeliverableEditor } from "./editors/deliverable-editor.js";
export { DependencyEditor } from "./editors/dependency-editor.js";
export { ReviewEditor } from "./editors/review-editor.js";
export { RevisionEditor } from "./editors/revision-editor.js";
export {
  DEFAULT_EDITOR_HISTORY_LIMIT,
  MAX_EDITOR_HISTORY_LIMIT,
  type MilestoneEditorHistory,
} from "./editors/editor-history.js";
