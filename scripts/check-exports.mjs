const expectedRoot = [
  "ARTIFACT_PACKAGE_COMPATIBILITY", "ARTIFACT_PROTOCOL_COMPATIBILITY", "ARTIFACT_PROTOCOL_VERSION",
  "ApprovalEditor", "ChallengeEditor", "CriteriaEditor", "DEFAULT_EDITOR_HISTORY_LIMIT", "EvidenceEditor",
  "DefinitionEditor", "DeliverableEditor", "DependencyEditor", "FixedMilestoneClock",
  "MAX_EDITOR_HISTORY_LIMIT", "MILESTONE_PROTOCOL_VERSION", "MilestoneDomainError", "MilestoneEditor", "MilestoneSourceEditor", "MilestoneValidationError", "SourceEditor", "migrateAndDeserializeMilestone", "migrateMilestoneWire",
  "MilestoneDocument", "MilestoneDocumentBuilder", "createMilestoneDocument", "createMilestoneDocumentContext",
  "ReviewEditor", "RevisionEditor", "SequenceMilestoneIdGenerator", "SystemMilestoneClock",
  "asAcceptanceId", "asApprovalRecordId", "asApprovalStageId", "asChallengeEvidenceId", "asChallengeId", "asCompletionId",
  "affectedMilestoneIds", "asCriterionId", "asDeliverableRequirementId", "asDependencyId", "asMilestoneEventId", "asMilestoneId",
  "asMilestoneProfileId", "asMilestoneRevisionId", "asReviewId", "assertValidGraph", "assertValidSourceLink", "blockedMilestoneIds",
  "assertValidMilestone", "calculateProgress", "createGraphSnapshot", "defaultEvaluationPolicy",
  "deriveMilestoneState", "deserializeArtifactContext", "deserializeEvents", "deserializeGraph", "deserializeMilestoneJson", "evaluateGraph",
  "deserializeMilestone", "detectCycles", "downstreamImpact", "evaluateAcceptance", "evaluateArtifacts",
  "evaluateCompletion", "evaluateDependency", "findUnlockedMilestoneIds", "isDefinitionBearing", "resolveChallengeEvidenceSources", "resolveSourceLink", "resolveSources", "serializeArtifactContext",
  "readyMilestoneIds", "serializeEvents", "serializeGraph", "serializeMilestone", "serializeMilestoneJson", "sourceLinksForRevision", "validateGraph", "validateMilestone",
].sort();

const pkg = await import("../dist/index.js");
const actualRoot = Object.keys(pkg).sort();
if (JSON.stringify(actualRoot) !== JSON.stringify(expectedRoot)) {
  throw new Error(`Root export snapshot changed:\n${actualRoot.join("\n")}`);
}
if (pkg.ARTIFACT_PROTOCOL_COMPATIBILITY !== ">=1.1 <2.0") throw new Error("Artifact protocol compatibility mismatch");

const subpaths = {
  model: "MilestoneDomainError",
  evaluation: "evaluateAcceptance",
  graph: "createGraphSnapshot",
  serialization: "serializeMilestone",
  validation: "validateMilestone",
  testing: "FixedMilestoneClock",
  migrations: "migrateMilestoneWire",
  dom: "MilestoneDocument",
};
for (const [subpath, requiredExport] of Object.entries(subpaths)) {
  const module = await import(`../dist/public/${subpath}.js`);
  if (!(requiredExport in module)) throw new Error(`${subpath} is missing ${requiredExport}`);
}

for (const internalName of ["invariant", "graphNodeFromMilestone", "validateProfile", "validateRevisionSnapshot"]) {
  if (internalName in pkg) throw new Error(`Internal helper ${internalName} leaked from the root API`);
}

console.log(`exports verified (${actualRoot.length} curated root exports, ${Object.keys(subpaths).length} subpaths)`);
