import { describe, expect, it } from "vitest";
import type { ArtifactRequirement } from "@elqora/artifacts";
import {
  MilestoneDomainError,
  MilestoneValidationError,
  MilestoneEditor,
  createGraphSnapshot,
  type MilestoneArtifactContext,
  type MilestoneGraphSnapshot,
  type MilestoneSourceLink,
} from "../src/index.js";
import {
  MilestoneDocument,
  MilestoneDocumentBuilder,
  createMilestoneDocument,
} from "../src/public/dom.js";
import {
  createAcceptanceDocument,
  createAcceptanceSnapshotDocument,
  createAcceptanceStatusDocument,
  createApprovalRecordDocument,
  createApprovalStageDocument,
  createApprovalsDocument,
  createChallengeDocument,
  createChallengesDocument,
  createCompletionDocument,
  createCompletionStatusDocument,
  createCriteriaDocument,
  createCriterionDocument,
  createDefinitionDocument,
  createDeliverableDocument,
  createDeliverablesDocument,
  createDependenciesDocument,
  createDependencyDocument,
  createIssueDocument,
  createIssuesDocument,
  createOverviewDocument,
  createProgressDocument,
  createReadinessDocument,
  createReviewDocument,
  createReviewsDocument,
  createRevisionDocument,
  createRevisionSnapshotDocument,
  createRevisionsDocument,
  createSourcesDocument,
  createSourcesDocumentForSubject,
} from "../src/dom/documents/index.js";
import { actor, create, profile } from "./helpers.js";

function sourceLink(
  subject: MilestoneSourceLink["subject"],
  role: MilestoneSourceLink["role"] = "context",
  id = "source-1",
): MilestoneSourceLink {
  return {
    schemaVersion: "1.1",
    id,
    artifactId: "art-1",
    ...(role === "specification" || role === "decision" ? { artifactVersionId: "ver-1" } : {}),
    subject,
    role,
    createdBy: { type: "user", id: "author-1" },
    createdAt: "2026-08-15T00:00:00.000Z",
  };
}

describe("Milestone DOM", () => {
  it("Test A: TextDocument progressive reads", () => {
    const h = create({
      definition: {
        title: "Test Milestone",
        description: "0123456789",
      },
    });
    const doc = createMilestoneDocument({
      milestone: h.milestone,
      profile: h.profile,
    });

    const description = doc.getDescription();
    expect(description.isEmpty()).toBe(false);
    expect(description.getLength()).toBe(10);
    expect(description.getText()).toBe("0123456789");
    expect(description.getExcerpt({ limit: 5 })).toBe("0123…");
    expect(description.getExcerpt()).toBe("0123456789");
    expect(description.getExcerpt({ limit: 0 })).toBe("");
    expect(description.getExcerpt({ limit: 1 })).toBe("…");

    const chunk = description.read({
      offset: 2,
      limit: 4,
    });

    expect(chunk).toEqual({
      text: "2345",
      offset: 2,
      end: 6,
      length: 4,
      totalLength: 10,
      hasPrevious: true,
      hasMore: true,
      previousOffset: 0,
      nextOffset: 6,
    });

    const fullRead = description.read();
    expect(fullRead.text).toBe("0123456789");
    expect(fullRead.offset).toBe(0);
    expect(fullRead.end).toBe(10);

    expect(() => description.read({ offset: 99 })).toThrowError(RangeError);

    // Overview and title navigation work without materializing full description
    const overview = doc.getOverview();
    expect(overview.getTitle()).toBe("Test Milestone");
    expect(overview.getId()).toBe(h.milestone.id);
  });

  it("Test B: Unknown dependency state without graph", () => {
    const upstream = create({}, "up").milestone;
    const h = create({}, "down");
    const editor = new MilestoneEditor(h.milestone, h.profile, h);
    const depId = editor.dependencies.add(upstream.id, { type: "accepted" });
    const milestone = editor.commit().milestone;

    const doc = createMilestoneDocument({
      milestone,
      profile: h.profile,
    });

    const readiness = doc.getReadiness();
    expect(readiness.canEvaluate()).toBe(false);
    expect(readiness.isBlocked()).toBeUndefined();
    expect(readiness.isReady()).toBeUndefined();
    expect(readiness.getUnknownDependencyCount()).toBe(1);
    expect(readiness.getSatisfiedDependencyCount()).toBe(0);
    expect(readiness.getUnsatisfiedDependencyCount()).toBe(0);
    expect(readiness.getBlockers()).toHaveLength(0);
    expect(readiness.getUnknownBlockingDependencies()).toHaveLength(1);

    const dependencies = doc.getDependencies();
    expect(dependencies.getCount()).toBe(1);
    expect(dependencies.isEmpty()).toBe(false);
    expect(dependencies.has(depId)).toBe(true);
    expect(dependencies.getUnknown()).toHaveLength(1);
    expect(dependencies.getSatisfied()).toHaveLength(0);
    expect(dependencies.getUnsatisfied()).toHaveLength(0);
    expect(dependencies.getBlocking()).toHaveLength(1);
    expect(dependencies.getNonBlocking()).toHaveLength(0);
    expect(dependencies.list()).toHaveLength(1);

    const dep = dependencies.require(depId);
    expect(dep.isSatisfied()).toBeUndefined();
    expect(dep.isUnsatisfied()).toBeUndefined();
    expect(dep.isBlocking()).toBe(true);
    expect(dep.getMilestoneId()).toBe(milestone.id);
    expect(dep.getDependsOnMilestoneId()).toBe(upstream.id);
    expect(dep.getGate()).toEqual({ type: "accepted" });
  });

  it("Test C: Graph-backed readiness", () => {
    const upstream = create({}, "up").milestone;
    const h = create({}, "down");
    const editor = new MilestoneEditor(h.milestone, h.profile, h);
    editor.dependencies.add(upstream.id, { type: "accepted" });
    const downstream = editor.commit().milestone;

    // Upstream is not yet accepted in graph
    const initialGraph = createGraphSnapshot([upstream, downstream], downstream.dependencies);
    const docBlocked = createMilestoneDocument({
      milestone: downstream,
      profile: h.profile,
      graph: initialGraph,
    });

    const blockedReadiness = docBlocked.getReadiness();
    expect(blockedReadiness.canEvaluate()).toBe(true);
    expect(blockedReadiness.isBlocked()).toBe(true);
    expect(blockedReadiness.isReady()).toBe(false);
    expect(blockedReadiness.getBlockers()).toHaveLength(1);
    expect(blockedReadiness.getSatisfiedDependencyCount()).toBe(0);
    expect(blockedReadiness.getUnsatisfiedDependencyCount()).toBe(1);

    // Accept upstream and rebuild graph
    const upEditor = new MilestoneEditor(upstream, h.profile, h);
    upEditor.accept();
    const upAccepted = upEditor.commit().milestone;

    const updatedGraph = createGraphSnapshot([upAccepted, downstream], downstream.dependencies);
    const docReady = createMilestoneDocument({
      milestone: downstream,
      profile: h.profile,
      graph: updatedGraph,
    });

    const readyReadiness = docReady.getReadiness();
    expect(readyReadiness.canEvaluate()).toBe(true);
    expect(readyReadiness.isBlocked()).toBe(false);
    expect(readyReadiness.isReady()).toBe(true);
    expect(readyReadiness.getBlockers()).toHaveLength(0);
    expect(readyReadiness.getSatisfiedDependencyCount()).toBe(1);
    expect(readyReadiness.getUnsatisfiedDependencyCount()).toBe(0);
  });

  it("Test D: Artifact-aware acceptance issues", () => {
    const reqId = "req-artifact-1";
    const h = create({
      criteria: [
        {
          title: "Code Review Documented",
          required: true,
          artifactRequirementIds: [reqId],
          state: "verified",
        },
      ],
    });

    // Build document without artifact context
    const doc = createMilestoneDocument({
      milestone: h.milestone,
      profile: h.profile,
    });

    const acceptanceStatus = doc.getAcceptanceStatus();
    expect(acceptanceStatus.canAccept()).toBe(false);

    const issues = acceptanceStatus.getIssues();
    expect(issues.isEmpty()).toBe(false);
    expect(issues.getCount()).toBeGreaterThan(0);
    expect(issues.hasCode("artifact_requirement_missing")).toBe(true);
    expect(issues.hasCategory("artifacts")).toBe(true);
    expect(issues.getByCode("artifact_requirement_missing")).toHaveLength(1);
    expect(issues.getByCategory("artifacts")).toHaveLength(1);
    expect(issues.getBySubjectId(reqId)).toHaveLength(1);

    const artifactIssues = issues.getArtifactIssues();
    expect(artifactIssues.length).toBeGreaterThan(0);
    expect(artifactIssues[0]?.getCode()).toBe("artifact_requirement_missing");
    expect(artifactIssues[0]?.isArtifactRelated()).toBe(true);
    expect(artifactIssues[0]?.getMessage()).toBeDefined();
    expect(artifactIssues[0]?.getSubjectId()).toBe(reqId);
  });

  it("Test E: Acceptance history", () => {
    const h = create();
    const editor = new MilestoneEditor(h.milestone, h.profile, h);
    editor.accept({ id: "accepter" });
    const acceptedMilestone = editor.commit().milestone;

    const doc = createMilestoneDocument({
      milestone: acceptedMilestone,
      profile: h.profile,
    });

    const acceptanceStatus = doc.getAcceptanceStatus();
    expect(acceptanceStatus.isAccepted()).toBe(true);

    const history = acceptanceStatus.getHistory();
    expect(history.getCount()).toBe(1);
    expect(history.isEmpty()).toBe(false);
    expect(history.has(acceptedMilestone.currentAcceptanceId!)).toBe(true);
    expect(history.list()).toHaveLength(1);
    expect(history.get(acceptedMilestone.currentAcceptanceId!)).toBeDefined();
    expect(history.require(acceptedMilestone.currentAcceptanceId!)).toBeDefined();
    expect(history.getForRevision(acceptedMilestone.currentRevisionId)).toHaveLength(1);
    expect(history.getLatest()).toBeDefined();

    const current = acceptanceStatus.getCurrent();
    expect(current).toBeDefined();
    expect(current?.getId()).toBe(acceptedMilestone.currentAcceptanceId);
    expect(current?.isCurrent()).toBe(true);
    expect(current?.getRevisionId()).toBe(acceptedMilestone.currentRevisionId);
    expect(current?.getAcceptedAt()).toBeDefined();
    expect(current?.getActor()).toEqual({ id: "accepter" });

    const overview = current?.getOverview();
    expect(overview?.getId()).toBe(acceptedMilestone.currentAcceptanceId);

    const snapshot = current?.getSnapshot();
    expect(snapshot).toBeDefined();
    expect(snapshot?.getRevisionId()).toBe(acceptedMilestone.currentRevisionId);
    expect(snapshot?.getCriteria()).toBeDefined();
    expect(snapshot?.getDeliverables()).toBeDefined();
    expect(snapshot?.getDependencies()).toBeDefined();
    expect(snapshot?.getChallenges()).toBeDefined();
    expect(snapshot?.getReviews()).toBeDefined();
    expect(snapshot?.getApprovals()).toBeDefined();
    expect(snapshot?.getArtifacts()).toBeDefined();
    expect(snapshot?.getSources()).toBeDefined();

    const evalSnapshot = acceptanceStatus.getEvaluationSnapshot();
    expect(evalSnapshot).toBeDefined();
  });

  it("Test F: Completion history", () => {
    const h = create();
    const editor = new MilestoneEditor(h.milestone, h.profile, h);
    editor.accept({ id: "accepter" });
    editor.complete({ id: "completer" }, "All deliverables verified and accepted successfully");
    const completedMilestone = editor.commit().milestone;

    const doc = createMilestoneDocument({
      milestone: completedMilestone,
      profile: h.profile,
    });

    const completionStatus = doc.getCompletionStatus();
    expect(completionStatus.isCompleted()).toBe(true);

    const history = completionStatus.getHistory();
    expect(history.getCount()).toBe(1);
    expect(history.isEmpty()).toBe(false);
    expect(history.has(completedMilestone.currentCompletionId!)).toBe(true);
    expect(history.list()).toHaveLength(1);
    expect(history.get(completedMilestone.currentCompletionId!)).toBeDefined();
    expect(history.require(completedMilestone.currentCompletionId!)).toBeDefined();
    expect(history.getForRevision(completedMilestone.currentRevisionId)).toHaveLength(1);
    expect(history.getForAcceptance(completedMilestone.currentAcceptanceId!)).toHaveLength(1);
    expect(history.getLatest()).toBeDefined();

    const current = completionStatus.getCurrent();
    expect(current).toBeDefined();
    expect(current?.getId()).toBe(completedMilestone.currentCompletionId);
    expect(current?.getAcceptanceId()).toBe(completedMilestone.currentAcceptanceId);
    expect(current?.getCompletedAt()).toBeDefined();
    expect(current?.getActor()).toEqual({ id: "completer" });
    expect(current?.hasReason()).toBe(true);
    expect(current?.getReason().getText()).toBe("All deliverables verified and accepted successfully");
    expect(current?.getOverview()).toBeDefined();
  });

  it("Test G: Source NOT_FOUND error", () => {
    const h = create();
    const doc = createMilestoneDocument({
      milestone: h.milestone,
      profile: h.profile,
    });

    const sources = doc.getSources();
    expect(sources.has("nonexistent-id" as never)).toBe(false);
    expect(sources.get("nonexistent-id" as never)).toBeUndefined();

    expect(() => sources.require("nonexistent-id" as never)).toThrowError(MilestoneDomainError);
    try {
      sources.require("nonexistent-id" as never);
    } catch (error) {
      expect((error as MilestoneDomainError).code).toBe("NOT_FOUND");
    }
  });

  it("Test H: Stale graph detection", () => {
    const upstream = create({}, "up").milestone;
    const h = create(
      {
        criteria: [{ title: "C1", required: true, state: "submitted" }],
      },
      "down",
    );
    const editor = new MilestoneEditor(h.milestone, h.profile, h);
    editor.dependencies.add(upstream.id, { type: "accepted" });
    const downstream = editor.commit().milestone;

    // Create valid graph projection
    const validGraph = createGraphSnapshot([upstream, downstream], downstream.dependencies);

    // Verify valid graph succeeds in builder
    const validDoc = new MilestoneDocumentBuilder(downstream, h.profile)
      .withGraph(validGraph)
      .build();
    expect(validDoc).toBeInstanceOf(MilestoneDocument);

    // Mutate downstream milestone so graph is now stale (criterion verified)
    const mutateEditor = new MilestoneEditor(downstream, h.profile, h);
    mutateEditor.criteria.verify(downstream.criteria[0]!.id);
    const staleMilestone = mutateEditor.commit().milestone;

    // Building document with stale graph must throw MilestoneDomainError
    expect(() => {
      new MilestoneDocumentBuilder(staleMilestone, h.profile)
        .withGraph(validGraph)
        .build();
    }).toThrowError(MilestoneDomainError);
  });

  it("Test I: Live sources vs historical source snapshots", () => {
    const h = create();
    const editor = new MilestoneEditor(h.milestone, h.profile, h);
    editor.sources.attach(
      sourceLink({ type: "milestone", id: h.milestone.id }, "specification", "spec-src"),
    );
    const revisedMilestone = editor.commit().milestone;

    const doc = createMilestoneDocument({
      milestone: revisedMilestone,
      profile: h.profile,
    });

    const revisionDoc = doc.getRevisions().require(revisedMilestone.currentRevisionId);

    // Live revision source links
    const liveSources = revisionDoc.getSources();
    expect(liveSources.getCount()).toBe(0); // attached to milestone, not revision aggregate directly

    // Historical snapshot sources captured on revision
    const snapshotSources = revisionDoc.getSnapshot().getSources();
    expect(snapshotSources.length).toBe(1);
    expect(snapshotSources[0]?.getArtifactId()).toBe("art-1");
    expect(snapshotSources[0]?.getRole()).toBe("specification");
    expect(snapshotSources[0]?.getArtifactVersionId()).toBe("ver-1");
  });

  it("Test J: Reviews historical acceptance vs current milestone acceptance", () => {
    const prof = profile({ reviews: { enabled: true, required: true } });
    const h = create({ profile: prof });
    const editor = new MilestoneEditor(h.milestone, prof, h);
    const reviewId = editor.reviews.request();
    editor.reviews.complete(reviewId, "accepted", { completedBy: { id: "reviewer" }, summary: "Approved" });
    const intermediate = editor.commit().milestone;

    // Now make a material edit so revision 1 is no longer current
    const editor2 = new MilestoneEditor(intermediate, prof, h);
    editor2.definition.update({ title: "M1 Revised" }, { reason: "Revision 2" });
    const milestone2 = editor2.commit().milestone;

    const doc = createMilestoneDocument({
      milestone: milestone2,
      profile: prof,
    });

    const reviews = doc.getReviews();
    const reviewDoc = reviews.require(reviewId);

    // Historically completed with accepted result
    expect(reviewDoc.isCompleted()).toBe(true);
    expect(reviewDoc.isAccepted()).toBe(true);
    expect(reviewDoc.isCurrentRevision()).toBe(false);

    // Does NOT satisfy current acceptance because it belonged to rev 1
    expect(reviewDoc.satisfiesCurrentAcceptance()).toBe(false);
  });

  it("Test K: Lazy initialization", () => {
    const h = create({
      criteria: [{ title: "C", required: true, state: "not_started" }],
    });
    const doc = createMilestoneDocument({
      milestone: h.milestone,
      profile: h.profile,
    });

    // Getting overview or definition should be cheap and not throw even if state is incomplete
    const overview = doc.getOverview();
    expect(overview.getTitle()).toBe("M1");
    expect(overview.getProgress().getPercentage()).toBe(0);

    // Profile access is lazy and fast
    expect(doc.getProfile().hasCriteria()).toBe(true);
  });

  it("Test L: Criteria and Deliverables full DOM surface", () => {
    const h = create({
      criteria: [
        { title: "C1", required: true, state: "verified", description: "c1 desc", weight: 2 },
        { title: "C2", required: false, state: "waived" },
        { title: "C3", required: true, state: "not_started" },
      ],
      deliverables: [
        { title: "D1", required: true, state: "satisfied", description: "d1 desc" },
        { title: "D2", required: false, state: "waived" },
        { title: "D3", required: true, state: "missing" },
      ],
    });

    const doc = createMilestoneDocument({
      milestone: h.milestone,
      profile: h.profile,
    });

    const criteria = doc.getCriteria();
    expect(criteria.getCount()).toBe(3);
    expect(criteria.isEmpty()).toBe(false);
    expect(criteria.getRequired()).toHaveLength(2);
    expect(criteria.getOptional()).toHaveLength(1);
    expect(criteria.getVerified()).toHaveLength(1);
    expect(criteria.getUnsatisfied()).toHaveLength(1);
    expect(criteria.getByState("verified")).toHaveLength(1);
    expect(criteria.list({ offset: 0, limit: 2 })).toHaveLength(2);

    const c1 = criteria.require(h.milestone.criteria[0]!.id);
    expect(c1.getTitle()).toBe("C1");
    expect(c1.getDescription().getText()).toBe("c1 desc");
    expect(c1.hasDescription()).toBe(true);
    expect(c1.isRequired()).toBe(true);
    expect(c1.getWeight()).toBe(2);
    expect(c1.isVerified()).toBe(true);
    expect(c1.isWaived()).toBe(false);
    expect(c1.isSatisfied()).toBe(true);
    expect(c1.getArtifactRequirementIds()).toEqual([]);
    expect(c1.getSources().isEmpty()).toBe(true);
    expect(c1.getOverview().getTitle()).toBe("C1");

    const deliverables = doc.getDeliverables();
    expect(deliverables.getCount()).toBe(3);
    expect(deliverables.isEmpty()).toBe(false);
    expect(deliverables.getRequired()).toHaveLength(2);
    expect(deliverables.getOptional()).toHaveLength(1);
    expect(deliverables.getSatisfied()).toHaveLength(2);
    expect(deliverables.getUnsatisfied()).toHaveLength(1);
    expect(deliverables.getByState("satisfied")).toHaveLength(1);
    expect(deliverables.list()).toHaveLength(3);

    const d1 = deliverables.require(h.milestone.deliverables[0]!.id);
    expect(d1.getTitle()).toBe("D1");
    expect(d1.getDescription().getText()).toBe("d1 desc");
    expect(d1.hasDescription()).toBe(true);
    expect(d1.isRequired()).toBe(true);
    expect(d1.isSatisfied()).toBe(true);
    expect(d1.isWaived()).toBe(false);
    expect(d1.getArtifactRequirementIds()).toEqual([]);
    expect(d1.getSources().isEmpty()).toBe(true);
    expect(d1.getOverview().getTitle()).toBe("D1");
  });

  it("Test M: Approvals and Challenges full DOM surface", () => {
    const p = profile({
      approvals: { enabled: true, required: true },
      challenges: { enabled: true },
      reviews: { enabled: true, required: true },
    });
    const h = create({
      profile: p,
      approvalPolicy: {
        stages: [
          { label: "Security", required: true, requiredApprovalCount: 1, scope: "milestone", order: 1 },
          { label: "QA", required: false, requiredApprovalCount: 1, scope: "milestone", order: 2 },
        ],
      },
    });

    const editor = new MilestoneEditor(h.milestone, p, h);
    const stageId = h.milestone.approvalPolicy!.stages[0]!.id;
    editor.approvals.grant(stageId, actor);
    const challengeId = editor.challenges.raise(
      { type: "milestone" },
      "Performance concern",
      "non_blocking",
      actor,
    );
    editor.challenges.resolve(challengeId, "no_effect", { actor, summary: "Mitigated" });
    const milestone = editor.commit().milestone;

    const doc = createMilestoneDocument({
      milestone,
      profile: p,
    });

    // Approvals DOM
    const approvals = doc.getApprovals();
    expect(approvals.isEnabled()).toBe(true);
    expect(approvals.isRequired()).toBe(true);
    expect(approvals.isSatisfied()).toBe(true);

    const stages = approvals.getStages();
    expect(stages.getCount()).toBe(2);
    expect(stages.getRequired()).toHaveLength(1);
    expect(stages.getPending()).toHaveLength(0);
    expect(stages.getSatisfied()).toHaveLength(2);

    const stageDoc = stages.require(stageId);
    expect(stageDoc.getLabel()).toBe("Security");
    expect(stageDoc.isRequired()).toBe(true);
    expect(stageDoc.getRequiredApprovalCount()).toBe(1);
    expect(stageDoc.getEffectiveApprovalCount()).toBe(1);
    expect(stageDoc.isSatisfied()).toBe(true);
    expect(stageDoc.isWaived()).toBe(false);
    expect(stageDoc.getOrder()).toBe(1);
    expect(stageDoc.getScope()).toBe("milestone");
    expect(stageDoc.getCriterionIds()).toEqual([]);
    expect(stageDoc.getDeliverableRequirementIds()).toEqual([]);
    expect(stageDoc.getEffectiveActorIds()).toEqual(["user:actor-1"]);
    expect(approvals.getRecords().getCount()).toBe(1);

    const recordDoc = approvals.getRecords().getForStage(stageId)[0]!;
    expect(recordDoc.getStageId()).toBe(stageId);
    expect(recordDoc.getActor()).toEqual(actor);
    expect(recordDoc.getType()).toBe("granted");
    expect(recordDoc.getRevokedApprovalId()).toBeUndefined();

    // Challenges DOM
    const challenges = doc.getChallenges();
    expect(challenges.getCount()).toBe(1);
    expect(challenges.getOpen()).toHaveLength(0);
    expect(challenges.getResolved()).toHaveLength(1);
    expect(challenges.getBlocking()).toHaveLength(0);
    expect(challenges.getByState("resolved")).toHaveLength(1);
    expect(challenges.getForRevision(milestone.currentRevisionId)).toHaveLength(1);
    expect(challenges.getCurrentRevision()).toHaveLength(1);

    const challengeDoc = challenges.require(challengeId);
    expect(challengeDoc.getSeverity()).toBe("non_blocking");
    expect(challengeDoc.getState()).toBe("resolved");
    expect(challengeDoc.isBlocking()).toBe(false);
    expect(challengeDoc.isOpen()).toBe(false);
    expect(challengeDoc.isCurrentRevision()).toBe(true);
    expect(challengeDoc.getRaisedBy()).toEqual(actor);
    expect(challengeDoc.getReason().getText()).toBe("Performance concern");
    expect(challengeDoc.getTarget().getType()).toBe("milestone");

    const resolution = challengeDoc.getResolution();
    expect(resolution).toBeDefined();
    expect(resolution?.getOutcome()).toBe("no_effect");
    expect(resolution?.getResolvedBy()).toEqual(actor);
    expect(resolution?.getSummary().getText()).toBe("Mitigated");
  });

  it("Test N: Revisions, Progress, Overview, and Profile full DOM surface", () => {
    const h = create({
      definition: { title: "Comprehensive Milestone", key: "M-100", description: "Narrative" },
      criteria: [{ title: "C1", required: true, state: "verified", weight: 3 }],
      deliverables: [{ title: "D1", required: true, state: "satisfied" }],
    });

    const doc = createMilestoneDocument({
      milestone: h.milestone,
      profile: h.profile,
    });

    // Profile Document
    const prof = doc.getProfile();
    expect(prof.getId()).toBe(h.profile.ref.id);
    expect(prof.getVersion()).toBe(h.profile.ref.version);
    expect(prof.hasCriteria()).toBe(true);
    expect(prof.hasDeliverables()).toBe(true);
    expect(prof.hasDependencies()).toBe(true);
    expect(prof.participatesInGraph()).toBe(true);
    expect(prof.hasRevisions()).toBe(true);
    expect(prof.hasChallenges()).toBe(true);
    expect(prof.hasReviews()).toBe(true);
    expect(prof.requiresReviews()).toBe(false);
    expect(prof.hasApprovals()).toBe(true);
    expect(prof.requiresApprovals()).toBe(false);
    expect(prof.hasCompletion()).toBe(true);
    expect(prof.closeImmediatelyOnAcceptance()).toBe(false);

    // Progress Document
    const progress = doc.getProgress();
    expect(progress.getPercentage()).toBe(100);
    expect(progress.isComplete()).toBe(true);
    expect(progress.getTotalWeight()).toBe(4);
    expect(progress.getCompletedWeight()).toBe(4);

    // Overview Document
    const overview = doc.getOverview();
    expect(overview.getId()).toBe(h.milestone.id);
    expect(overview.getTitle()).toBe("Comprehensive Milestone");
    expect(overview.getKey()).toBe("M-100");
    expect(overview.getSequence()).toBe(h.milestone.sequence);
    expect(overview.getCurrentRevisionId()).toBe(h.milestone.currentRevisionId);
    expect(overview.getCurrentRevisionNumber()).toBe(1);
    expect(overview.isAccepted()).toBe(false);
    expect(overview.isCompleted()).toBe(false);
    expect(overview.getCriterionCount()).toBe(1);
    expect(overview.getDeliverableCount()).toBe(1);
    expect(overview.getDependencyCount()).toBe(0);
    expect(overview.getChallengeCount()).toBe(0);
    expect(overview.getReviewCount()).toBe(0);
    expect(overview.getRevisionCount()).toBe(1);
    expect(overview.getDefinition().getDescription().getText()).toBe("Narrative");
    expect(overview.isBlocked()).toBeUndefined();
    expect(overview.isReady()).toBeUndefined();

    // Revisions Document
    const revisions = doc.getRevisions();
    expect(revisions.getCount()).toBe(1);
    expect(revisions.isEmpty()).toBe(false);
    expect(revisions.getLatest()[0]?.getId()).toBe(h.milestone.currentRevisionId);
    expect(revisions.getCurrent().getId()).toBe(h.milestone.currentRevisionId);

    const revDoc = revisions.require(h.milestone.currentRevisionId);
    expect(revDoc.getNumber()).toBe(1);
    expect(revDoc.getPreviousRevisionId()).toBeUndefined();
    expect(revDoc.isCurrent()).toBe(true);
    expect(revDoc.getActor()).toBeUndefined();
    expect(revDoc.getCreatedAt()).toBeDefined();

    const revSnapshot = revDoc.getSnapshot();
    expect(revSnapshot.getProfileId()).toBe(h.profile.ref.id);
    expect(revSnapshot.getProfileVersion()).toBe(h.profile.ref.version);
    expect(revSnapshot.getDefinition().getTitle()).toBe("Comprehensive Milestone");
    expect(revSnapshot.getCriteria()).toHaveLength(1);
    expect(revSnapshot.getCriterion(h.milestone.criteria[0]!.id)?.getTitle()).toBe("C1");
    expect(revSnapshot.getDeliverables()).toHaveLength(1);
    expect(revSnapshot.getDeliverable(h.milestone.deliverables[0]!.id)?.getTitle()).toBe("D1");
    expect(revSnapshot.getDependencies()).toHaveLength(0);
    expect(revSnapshot.getSources()).toHaveLength(0);

    const policyDoc = revSnapshot.getEvaluationPolicy();
    expect(policyDoc.requiredCriteriaMustBeVerified()).toBe(true);
    expect(policyDoc.requiredDeliverablesMustBeSatisfied()).toBe(true);
    expect(policyDoc.waivedCriteriaSatisfyRequired()).toBe(true);
    expect(policyDoc.waivedDeliverablesSatisfyRequired()).toBe(true);
    expect(policyDoc.blockingChallengesPreventAcceptance()).toBe(true);
    expect(policyDoc.getRequiredReviewResult()).toBe("accepted");
    expect(policyDoc.requireReviewWhenProfileRequires()).toBe(false);
    expect(policyDoc.requireApprovalsWhenProfileRequires()).toBe(false);
    expect(policyDoc.completionRequiresCurrentAcceptance()).toBe(true);
    expect(policyDoc.closeImmediatelyOnAcceptance()).toBe(false);
  });

  it("Test O: Sources DOM roles and subjects", () => {
    const h = create();
    const s1 = { ...sourceLink({ type: "milestone", id: h.milestone.id }, "reference", "src-ref"), artifactVersionId: "ver-1" };
    const s2 = { ...sourceLink({ type: "milestone", id: h.milestone.id }, "context", "src-ctx"), artifactVersionId: "ver-1" };
    const s3 = sourceLink({ type: "milestone", id: h.milestone.id }, "specification", "src-spec");
    const s4 = sourceLink({ type: "milestone", id: h.milestone.id }, "decision", "src-dec");

    const version = {
      schemaVersion: "1.1" as const,
      id: "ver-1" as never,
      artifactId: "art-1" as never,
      version: 1,
      source: { type: "url" as const, url: "https://example.test/spec" },
      createdAt: "2026-08-15T00:00:00.000Z",
      createdBy: { type: "user" as const, id: "author-1" },
      metadata: { name: "Spec Artifact" },
    };
    const art = {
      schemaVersion: "1.1" as const,
      id: "art-1" as never,
      kind: "specification",
      valueType: "file" as const,
      currentVersionId: "ver-1" as never,
      createdBy: { type: "user" as const, id: "author-1" },
      createdAt: "2026-08-15T00:00:00.000Z",
      updatedAt: "2026-08-15T00:00:00.000Z",
    };
    const artifacts: MilestoneArtifactContext = {
      requirements: new Map(),
      artifacts: new Map([[art.id, art]]),
      versions: new Map([[version.id, version]]),
      submissions: new Map(),
      verifications: new Map(),
      links: [],
    };

    const editor = new MilestoneEditor(h.milestone, h.profile, h);
    editor.sources.attach(s1);
    editor.sources.attach(s2);
    editor.sources.attach(s3);
    editor.sources.attach(s4);
    const milestone = editor.commit().milestone;

    const doc = createMilestoneDocument({
      milestone,
      profile: h.profile,
      artifacts,
    });

    const sources = doc.getAllSources();
    expect(sources.getCount()).toBe(4);
    expect(sources.getReferences()).toHaveLength(1);
    expect(sources.getContext()).toHaveLength(1);
    expect(sources.getSpecifications()).toHaveLength(1);
    expect(sources.getDecisions()).toHaveLength(1);
    expect(sources.getByRole("specification")).toHaveLength(1);
    expect(sources.getBySubject("milestone", milestone.id)).toHaveLength(4);

    const specDoc = sources.require("src-spec" as never);
    expect(specDoc.getArtifactId()).toBe("art-1");
    expect(specDoc.getArtifactVersionId()).toBe("ver-1");
    expect(specDoc.isDefinitionBearing()).toBe(true);
    expect(specDoc.isPinned()).toBe(true);
    expect(specDoc.isResolved()).toBe(true);
    expect(specDoc.getSubjectType()).toBe("milestone");
    expect(specDoc.getSubjectId()).toBe(milestone.id);
    expect(specDoc.getRole()).toBe("specification");
  });

  it("Test P: Full Acceptance Snapshot subdocuments", () => {
    const p = profile({
      approvals: { enabled: true, required: true },
      challenges: { enabled: true },
      reviews: { enabled: true, required: true },
    });

    const upHarness = create({}, "upstream-p");
    const upEditor = new MilestoneEditor(upHarness.milestone, upHarness.profile, upHarness);
    upEditor.accept();
    const upAccepted = upEditor.commit().milestone;

    const h = create({
      profile: p,
      definition: { title: "Acceptance Test Milestone", metadata: { customKey: "customValue" } },
      criteria: [
        { title: "C1", required: true, state: "verified" },
        { title: "C2", required: false, state: "waived" },
      ],
      deliverables: [
        { title: "D1", required: true, state: "satisfied" },
        { title: "D2", required: false, state: "waived" },
      ],
      dependencies: [
        { dependsOnMilestoneId: upAccepted.id, gate: { type: "accepted" }, blocking: true },
      ],
      approvalPolicy: {
        stages: [{ label: "Stage 1", required: true, requiredApprovalCount: 1, scope: "milestone" }],
      },
    });

    const graph = createGraphSnapshot([upAccepted, h.milestone], h.milestone.dependencies);

    const editor = new MilestoneEditor(h.milestone, p, { ...h, graph });
    editor.sources.attach({ ...sourceLink({ type: "milestone", id: h.milestone.id }, "specification", "spec-p"), artifactVersionId: "ver-1" });
    const stageId = h.milestone.approvalPolicy!.stages[0]!.id;
    editor.approvals.grant(stageId, actor);
    const reviewId = editor.reviews.request({ requestedBy: actor, assignedReviewer: { id: "rev-user" } });
    editor.reviews.complete(reviewId, "accepted", { completedBy: { id: "rev-user" }, summary: "Great" });
    const challengeId = editor.challenges.raise({ type: "milestone" }, "Note", "non_blocking", actor);
    editor.challenges.resolve(challengeId, "no_effect", { actor, summary: "Noted" });
    editor.accept(actor);
    const milestone = editor.commit().milestone;

    const finalGraph = createGraphSnapshot([upAccepted, milestone], milestone.dependencies);
    const doc = createMilestoneDocument({
      milestone,
      profile: p,
      graph: finalGraph,
    });

    const acceptance = doc.getAcceptanceStatus();
    expect(acceptance.isAccepted()).toBe(true);

    const snap = acceptance.getCurrent()!.getSnapshot();
    expect(snap.getRevisionId()).toBe(milestone.currentRevisionId);

    // Criteria snapshot
    const criteriaSnap = snap.getCriteria();
    expect(criteriaSnap.length).toBeGreaterThan(0);
    const cSnap = criteriaSnap[0]!;
    expect(cSnap.getId()).toBe(milestone.criteria[0]!.id);
    expect(cSnap.getState()).toBe("verified");
    expect(cSnap.isSatisfied()).toBe(true);

    // Deliverables snapshot
    const delivSnap = snap.getDeliverables();
    expect(delivSnap.length).toBeGreaterThan(0);
    const dSnap = delivSnap[0]!;
    expect(dSnap.getId()).toBe(milestone.deliverables[0]!.id);
    expect(dSnap.getState()).toBe("satisfied");
    expect(dSnap.isSatisfied()).toBe(true);

    // Dependencies snapshot
    const depSnap = snap.getDependencies();
    expect(depSnap.length).toBe(1);
    expect(depSnap[0]!.getDependsOnMilestoneId()).toBe(upAccepted.id);
    expect(depSnap[0]!.getGate()).toEqual({ type: "accepted" });
    expect(depSnap[0]!.isBlocking()).toBe(true);
    expect(depSnap[0]!.isSatisfied()).toBe(true);

    // Challenges snapshot
    const chalSnap = snap.getChallenges();
    expect(chalSnap.length).toBe(1);
    expect(chalSnap[0]!.getId()).toBe(challengeId);
    expect(chalSnap[0]!.getState()).toBe("resolved");
    expect(chalSnap[0]!.getSeverity()).toBe("non_blocking");
    expect(chalSnap[0]!.isBlocking()).toBe(false);
    expect(chalSnap[0]!.getTarget().getType()).toBe("milestone");
    expect(chalSnap[0]!.getResolution()).toBeDefined();

    // Reviews snapshot
    const revSnap = snap.getReviews();
    expect(revSnap.length).toBe(1);
    expect(revSnap[0]!.getId()).toBe(reviewId);
    expect(revSnap[0]!.getState()).toBe("completed");
    expect(revSnap[0]!.getResult()).toBe("accepted");
    expect(revSnap[0]!.isSatisfied()).toBe(true);

    // Approvals snapshot
    const appSnap = snap.getApprovals();
    expect(appSnap.length).toBe(1);
    expect(appSnap[0]!.getStageId()).toBe(stageId);
    expect(appSnap[0]!.getRequiredApprovalCount()).toBe(1);
    expect(appSnap[0]!.getEffectiveApprovalCount()).toBe(1);
    expect(appSnap[0]!.getActorIds()).toEqual(["user:actor-1"]);
    expect(appSnap[0]!.isSatisfied()).toBe(true);
    expect(appSnap[0]!.isWaived()).toBe(false);

    // Sources snapshot
    const srcSnap = snap.getSources();
    expect(srcSnap.length).toBe(1);
    expect(srcSnap[0]!.getLinkId()).toBe("spec-p" as never);
    expect(srcSnap[0]!.getArtifactId()).toBe("art-1");
    expect(srcSnap[0]!.getArtifactVersionId()).toBe("ver-1");
    expect(srcSnap[0]!.getRole()).toBe("specification");
    expect(srcSnap[0]!.getSubjectType()).toBe("milestone");
    expect(srcSnap[0]!.getSubjectId()).toBe(milestone.id);
    expect(srcSnap[0]!.hasNote()).toBe(false);
    expect(srcSnap[0]!.isPinned()).toBe(true);

    // Definition metadata
    const def = doc.getDefinition();
    expect(def.hasMetadata("customKey")).toBe(true);
    expect(def.hasMetadata("absentKey")).toBe(false);
    expect(def.getMetadataValue("customKey")).toBe("customValue");
    expect(def.getMetadataValue("absentKey")).toBeUndefined();
    expect(def.getMetadata()).toEqual({ customKey: "customValue" });
  });

  it("Test Q: Reviews full DOM methods", () => {
    const p = profile({ reviews: { enabled: true, required: true } });
    const h = create({ profile: p });
    const editor = new MilestoneEditor(h.milestone, p, h);
    const r1 = editor.reviews.request({ requestedBy: actor, assignedReviewer: { id: "rev-1" } });
    editor.reviews.complete(r1, "accepted", { completedBy: { id: "rev-1" }, summary: "Pass", artifactVersionIds: ["ver-1" as never] });
    const r2 = editor.reviews.request({ requestedBy: actor });
    editor.reviews.complete(r2, "rejected", { completedBy: actor, summary: "Needs rework" });
    const r3 = editor.reviews.request();
    const milestone = editor.commit().milestone;

    const doc = createMilestoneDocument({
      milestone,
      profile: p,
    });

    const reviews = doc.getReviews();
    expect(reviews.getCount()).toBe(3);
    expect(reviews.isEmpty()).toBe(false);
    expect(reviews.has(r1)).toBe(true);
    expect(reviews.get(r1)).toBeDefined();
    expect(reviews.getPending()).toHaveLength(1);
    expect(reviews.getCompleted()).toHaveLength(2);
    expect(reviews.getAccepted()).toHaveLength(1);
    expect(reviews.getRejected()).toHaveLength(1);
    expect(reviews.getForRevision(milestone.currentRevisionId)).toHaveLength(3);
    expect(reviews.getCurrentRevision()).toHaveLength(3);
    expect(reviews.getSatisfyingCurrentAcceptance()).toHaveLength(1);
    expect(reviews.list({ offset: 0, limit: 2 })).toHaveLength(2);

    const r1Doc = reviews.require(r1);
    expect(r1Doc.getRequestedBy()).toEqual(actor);
    expect(r1Doc.getAssignedReviewer()).toEqual({ id: "rev-1" });
    expect(r1Doc.getCompletedBy()).toEqual({ id: "rev-1" });
    expect(r1Doc.getArtifactVersionIds()).toEqual(["ver-1"]);
    expect(r1Doc.getCreatedAt()).toBeDefined();
    expect(r1Doc.getCompletedAt()).toBeDefined();
    expect(r1Doc.isCompleted()).toBe(true);
    expect(r1Doc.isAccepted()).toBe(true);
    expect(r1Doc.getResult()).toBe("accepted");
    expect(r1Doc.satisfiesCurrentAcceptance()).toBe(true);
    expect(r1Doc.getSources().isEmpty()).toBe(true);

    const r2Doc = reviews.require(r2);
    expect(r2Doc.getResult()).toBe("rejected");
    expect(r2Doc.isAccepted()).toBe(false);
    expect(r2Doc.satisfiesCurrentAcceptance()).toBe(false);

    const r3Doc = reviews.require(r3);
    expect(r3Doc.getState()).toBe("requested");
    expect(r3Doc.isCompleted()).toBe(false);
    expect(r3Doc.getRequestedBy()).toBeUndefined();
    expect(r3Doc.getAssignedReviewer()).toBeUndefined();
    expect(r3Doc.getCompletedBy()).toBeUndefined();
    expect(r3Doc.getCompletedAt()).toBeUndefined();
  });

  it("Test R: Revisions and Completion collection methods", () => {
    const h = create();
    const editor = new MilestoneEditor(h.milestone, h.profile, h);
    editor.definition.update({ title: "Rev 2" }, { reason: "Second revision" });
    editor.accept(actor);
    editor.complete(actor, "Done");
    const milestone = editor.commit().milestone;

    const doc = createMilestoneDocument({
      milestone,
      profile: h.profile,
    });

    const revisions = doc.getRevisions();
    expect(revisions.getCount()).toBe(2);
    expect(revisions.getByNumber(1)).toBeDefined();
    expect(revisions.getByNumber(2)).toBeDefined();
    expect(revisions.getByNumber(99)).toBeUndefined();
    expect(revisions.getPrevious()).toBeDefined();
    expect(revisions.getPrevious()?.getNumber()).toBe(1);

    const completion = doc.getCompletionStatus();
    expect(completion.isCompleted()).toBe(true);
    expect(completion.canComplete()).toBe(true);
    expect(completion.getIssues().isEmpty()).toBe(true);

    const history = completion.getHistory();
    expect(history.getCount()).toBe(1);
    expect(history.getForRevision(milestone.currentRevisionId)).toHaveLength(1);
    expect(history.getForAcceptance(milestone.currentAcceptanceId!)).toHaveLength(1);
  });

  it("Test S: Challenge Target variants and Evidence methods", () => {
    const p = profile({ challenges: { enabled: true }, reviews: { enabled: true, required: false } });
    const h = create({
      profile: p,
      criteria: [{ title: "C1", required: true, state: "submitted" }],
      deliverables: [{ title: "D1", required: true, state: "submitted" }],
    });

    const editor = new MilestoneEditor(h.milestone, p, h);
    const critId = h.milestone.criteria[0]!.id;
    const delivId = h.milestone.deliverables[0]!.id;
    const revId = editor.reviews.request();

    const ch1 = editor.challenges.raise({ type: "criterion", criterionId: critId }, "Crit check", "blocking", actor);
    const ch2 = editor.challenges.raise({ type: "deliverable_requirement", deliverableRequirementId: delivId }, "Deliv check", "non_blocking", actor);
    const ch3 = editor.challenges.raise({ type: "review", reviewId: revId }, "Rev check", "non_blocking", actor);
    const ch4 = editor.challenges.raise({ type: "artifact", artifactId: "art-x" as never, artifactVersionId: "ver-x" as never }, "Art check", "non_blocking", actor);
    const ch5 = editor.challenges.raise({ type: "evidence", ref: "ev-ref" }, "Evidence check", "non_blocking", actor);

    const milestone = editor.commit().milestone;
    const doc = createMilestoneDocument({ milestone, profile: p });

    const c1Doc = doc.getChallenges().require(ch1);
    expect(c1Doc.getTarget().getType()).toBe("criterion");
    expect(c1Doc.getTarget().getCriterionId()).toBe(critId);
    expect(c1Doc.isBlocking()).toBe(true);

    const c2Doc = doc.getChallenges().require(ch2);
    expect(c2Doc.getTarget().getType()).toBe("deliverable_requirement");
    expect(c2Doc.getTarget().getDeliverableRequirementId()).toBe(delivId);

    const c3Doc = doc.getChallenges().require(ch3);
    expect(c3Doc.getTarget().getType()).toBe("review");
    expect(c3Doc.getTarget().getReviewId()).toBe(revId);

    const c4Doc = doc.getChallenges().require(ch4);
    expect(c4Doc.getTarget().getType()).toBe("artifact");
    expect(c4Doc.getTarget().getArtifactId()).toBe("art-x");
    expect(c4Doc.getTarget().getArtifactVersionId()).toBe("ver-x");

    const c5Doc = doc.getChallenges().require(ch5);
    expect(c5Doc.getTarget().getType()).toBe("evidence");
    expect(c5Doc.getTarget().getReference()).toBe("ev-ref");

    const evidenceColl = c1Doc.getEvidence();
    expect(evidenceColl.isEmpty()).toBe(true);
    expect(evidenceColl.getCount()).toBe(0);
    expect(evidenceColl.list()).toHaveLength(0);
  });

  it("Test T: Revision Snapshot sub-definition documents", () => {
    const p = profile({
      approvals: { enabled: true, required: true },
      dependencies: { enabled: true, participatesInGraph: true },
    });
    const h = create({
      profile: p,
      definition: { title: "Sub-definitions", description: "Desc text", key: "KEY-1" },
      criteria: [{ title: "C1", state: "not_started", description: "C1 desc", required: true, weight: 3, artifactRequirementIds: ["req-1" as never] }],
      deliverables: [{ title: "D1", state: "missing", description: "D1 desc", required: true, artifactRequirementIds: ["req-2" as never] }],
      approvalPolicy: {
        stages: [
          { label: "Sec", required: true, requiredApprovalCount: 2, scope: "milestone", order: 1, authorityRef: "auth-1" },
        ],
      },
    });

    const editor = new MilestoneEditor(h.milestone, p, h);
    editor.dependencies.add("up-x" as never, { type: "completed" });
    const milestone = editor.commit().milestone;

    const doc = createMilestoneDocument({ milestone, profile: p });
    const snap = doc.getRevisions().getCurrent().getSnapshot();

    // Criterion Definition Document
    const cDef = snap.getCriteria()[0]!;
    expect(cDef.getId()).toBe(h.milestone.criteria[0]!.id);
    expect(cDef.getTitle()).toBe("C1");
    expect(cDef.getDescription().getText()).toBe("C1 desc");
    expect(cDef.isRequired()).toBe(true);
    expect(cDef.getWeight()).toBe(3);
    expect(cDef.getArtifactRequirementIds()).toEqual(["req-1"]);

    // Deliverable Definition Document
    const dDef = snap.getDeliverables()[0]!;
    expect(dDef.getId()).toBe(h.milestone.deliverables[0]!.id);
    expect(dDef.getTitle()).toBe("D1");
    expect(dDef.getDescription().getText()).toBe("D1 desc");
    expect(dDef.isRequired()).toBe(true);
    expect(dDef.getArtifactRequirementIds()).toEqual(["req-2"]);

    // Dependency Definition Document
    const depDef = snap.getDependencies()[0]!;
    expect(depDef.getDependsOnMilestoneId()).toBe("up-x");
    expect(depDef.getGate()).toEqual({ type: "completed" });
    expect(depDef.isBlocking()).toBe(true);

    // Approval Policy Snapshot Document
    const appPolicy = snap.getApprovalPolicy();
    expect(appPolicy.getStages()).toHaveLength(1);
    const stageDef = appPolicy.getStages()[0]!;
    expect(stageDef.getLabel()).toBe("Sec");
    expect(stageDef.isRequired()).toBe(true);
    expect(stageDef.getRequiredApprovalCount()).toBe(2);
    expect(stageDef.getScope()).toBe("milestone");
    expect(stageDef.getOrder()).toBe(1);
    expect(stageDef.getAuthorityRef()).toBe("auth-1");
  });

  it("Test U: Artifact Acceptance Snapshots and Issues categorization", () => {
    const h = create({
      criteria: [
        { title: "C1", required: true, state: "verified", artifactRequirementIds: ["req-1" as never] },
      ],
    });

    const requirement: ArtifactRequirement = { schemaVersion: "1.1" as const, id: "req-1" as never, required: true, minimumCount: 1, allowedKinds: ["report"], allowedValueTypes: ["file"] };
    const artifact = { schemaVersion: "1.1" as const, id: "art-1" as never, kind: "report", valueType: "file" as const, currentVersionId: "ver-1" as never, createdBy: { type: "user" as const, id: "author" }, createdAt: "2026-08-15T00:00:00Z", updatedAt: "2026-08-15T00:00:00Z" };
    const version = { schemaVersion: "1.1" as const, id: "ver-1" as never, artifactId: artifact.id, version: 1, source: { type: "url" as const, url: "https://example.test/report" }, createdBy: { type: "user" as const, id: "author" }, createdAt: "2026-08-15T00:00:00Z" };
    const submission = { schemaVersion: "1.1" as const, id: "sub-1" as never, artifactId: artifact.id, artifactVersionId: version.id, submittedBy: { type: "user" as const, id: "author" }, submittedAt: "2026-08-15T01:00:00Z" };
    const verification = { schemaVersion: "1.1" as const, id: "verif-1" as never, artifactId: artifact.id, artifactVersionId: version.id, submissionId: submission.id, status: "verified" as const, createdAt: "2026-08-15T02:00:00Z", verifiedAt: "2026-08-15T02:00:00Z", verifiedBy: { type: "user" as const, id: "verifier" } };
    const link = { schemaVersion: "1.1" as const, id: "link-1" as never, artifactId: artifact.id, artifactVersionId: version.id, subject: { type: "criterion" as const, id: h.milestone.criteria[0]!.id }, role: "evidence" as const, createdBy: { type: "user" as const, id: "author" }, createdAt: "2026-08-15T01:00:00Z", metadata: { artifactRequirementId: requirement.id } };

    const artifacts: MilestoneArtifactContext = {
      requirements: new Map([[requirement.id, requirement]]),
      artifacts: new Map([[artifact.id, artifact]]),
      versions: new Map([[version.id, version]]),
      submissions: new Map([[submission.id, submission]]),
      verifications: new Map([[verification.id, verification]]),
      links: [link],
    };

    const editor = new MilestoneEditor(h.milestone, h.profile, { ...h, artifacts });
    editor.accept(actor);
    const accepted = editor.commit().milestone;

    const doc = createMilestoneDocument({ milestone: accepted, profile: h.profile, artifacts });
    const snap = doc.getAcceptanceStatus().getCurrent()!.getSnapshot();
    const artSnaps = snap.getArtifacts();
    expect(artSnaps).toHaveLength(1);

    const aSnap = artSnaps[0]!;
    expect(aSnap.getArtifactRequirementId()).toBe("req-1");
    expect(aSnap.getArtifactId()).toBe("art-1");
    expect(aSnap.getArtifactVersionId()).toBe("ver-1");
    expect(aSnap.getSubmissionId()).toBe("sub-1");
    expect(aSnap.getVerificationId()).toBe("verif-1");
    expect(aSnap.getOutcome()).toBe("satisfied");
  });

  it("Test V: Approvals DOM full methods", () => {
    const p = profile({ approvals: { enabled: true, required: true } });
    const h = create({
      profile: p,
      approvalPolicy: {
        stages: [
          { label: "Stage A", required: true, requiredApprovalCount: 1, scope: "milestone", order: 1, authorityRef: "auth-a" },
          { label: "Stage B", required: false, requiredApprovalCount: 1, scope: "milestone", order: 2 },
        ],
      },
    });

    const sA = h.milestone.approvalPolicy!.stages[0]!.id;
    const sB = h.milestone.approvalPolicy!.stages[1]!.id;

    const editor = new MilestoneEditor(h.milestone, p, h);
    editor.approvals.grant(sA, actor);
    editor.approvals.waive(sB, actor, "Not needed");
    const milestone = editor.commit().milestone;

    const doc = createMilestoneDocument({ milestone, profile: p });
    const approvals = doc.getApprovals();
    expect(approvals.isEnabled()).toBe(true);
    expect(approvals.isRequired()).toBe(true);
    expect(approvals.isSatisfied()).toBe(true);

    const stages = approvals.getStages();
    expect(stages.getCount()).toBe(2);
    expect(stages.isEmpty()).toBe(false);
    expect(stages.has(sA)).toBe(true);
    expect(stages.getPending()).toHaveLength(0);
    expect(stages.getSatisfied()).toHaveLength(2);
    expect(stages.getRequired()).toHaveLength(1);
    expect(stages.list({ offset: 0, limit: 1 })).toHaveLength(1);

    const stageADoc = stages.require(sA);
    expect(stageADoc.getLabel()).toBe("Stage A");
    expect(stageADoc.isRequired()).toBe(true);
    expect(stageADoc.getOrder()).toBe(1);
    expect(stageADoc.getAuthorityRef()).toBe("auth-a");
    expect(stageADoc.getRequiredApprovalCount()).toBe(1);
    expect(stageADoc.getEffectiveApprovalCount()).toBe(1);
    expect(stageADoc.getEffectiveActorIds()).toEqual(["user:actor-1"]);
    expect(stageADoc.isSatisfied()).toBe(true);
    expect(stageADoc.isWaived()).toBe(false);
    expect(stageADoc.getCriterionIds()).toHaveLength(0);
    expect(stageADoc.getDeliverableRequirementIds()).toHaveLength(0);
    expect(stageADoc.getOverview().getLabel()).toBe("Stage A");

    const records = approvals.getRecords();
    expect(records.getCount()).toBe(2);
    expect(records.isEmpty()).toBe(false);
    expect(records.getForStage(sA)).toHaveLength(1);
    expect(records.getForRevision(milestone.currentRevisionId)).toHaveLength(2);
    expect(records.list({ offset: 0, limit: 1 })).toHaveLength(1);

    const rA = records.getForStage(sA)[0]!;
    expect(rA.getStageId()).toBe(sA);
    expect(rA.getRevisionId()).toBe(milestone.currentRevisionId);
    expect(rA.getType()).toBe("granted");
    expect(rA.getActor()).toEqual(actor);
    expect(rA.getCreatedAt()).toBeDefined();
    expect(records.has(rA.getId())).toBe(true);
    expect(records.get(rA.getId())).toBeDefined();
  });

  it("Test W: Challenge Evidence Source Resolution with valid and invalid artifact links", () => {
    const p = profile({ challenges: { enabled: true } });
    const h = create({ profile: p });
    const editor = new MilestoneEditor(h.milestone, p, h);

    const challengeId = editor.challenges.raise({ type: "milestone" }, "Chal with evidence", "blocking", actor);
    const ev1 = editor.evidence.add(challengeId, { kind: "supporting", title: "Valid evidence", description: "Desc 1" }, actor);
    const ev2 = editor.evidence.add(challengeId, { kind: "supporting", title: "Unpinned evidence", description: "Desc 2" }, actor);
    const ev3 = editor.evidence.add(challengeId, { kind: "supporting", title: "Missing art evidence", description: "Desc 3" }, actor);
    const ev4 = editor.evidence.add(challengeId, { kind: "supporting", title: "Missing ver evidence", description: "Desc 4" }, actor);
    const ev5 = editor.evidence.add(challengeId, { kind: "supporting", title: "Wrong role evidence", description: "Desc 5" }, actor);
    const ev6 = editor.evidence.add(challengeId, { kind: "supporting", title: "Counter evidence", description: "Desc 6" }, actor);
    editor.evidence.withdraw(ev6, "Withdrawn", actor);

    const milestone = editor.commit().milestone;

    const artifact = { schemaVersion: "1.1" as const, id: "art-ev" as never, kind: "report", valueType: "file" as const, currentVersionId: "ver-ev" as never, createdBy: actor, createdAt: "2026-08-15T00:00:00Z", updatedAt: "2026-08-15T00:00:00Z" };
    const version = { schemaVersion: "1.1" as const, id: "ver-ev" as never, artifactId: artifact.id, version: 1, source: { type: "url" as const, url: "https://example.test" }, createdBy: actor, createdAt: "2026-08-15T00:00:00Z" };

    const links = [
      { schemaVersion: "1.1" as const, id: "l-valid" as never, artifactId: artifact.id, artifactVersionId: version.id, subject: { type: "challenge_evidence" as const, id: ev1 }, role: "challenge_evidence" as const, createdBy: actor, createdAt: "2026-08-15T00:00:00Z" },
      { schemaVersion: "1.1" as const, id: "l-unpinned" as never, artifactId: artifact.id, subject: { type: "challenge_evidence" as const, id: ev2 }, role: "challenge_evidence" as const, createdBy: actor, createdAt: "2026-08-15T00:00:00Z" },
      { schemaVersion: "1.1" as const, id: "l-missing-art" as never, artifactId: "absent-art" as never, artifactVersionId: "ver-absent" as never, subject: { type: "challenge_evidence" as const, id: ev3 }, role: "challenge_evidence" as const, createdBy: actor, createdAt: "2026-08-15T00:00:00Z" },
      { schemaVersion: "1.1" as const, id: "l-missing-ver" as never, artifactId: artifact.id, artifactVersionId: "absent-ver" as never, subject: { type: "challenge_evidence" as const, id: ev4 }, role: "challenge_evidence" as const, createdBy: actor, createdAt: "2026-08-15T00:00:00Z" },
      { schemaVersion: "1.1" as const, id: "l-wrong-role" as never, artifactId: artifact.id, artifactVersionId: version.id, subject: { type: "challenge_evidence" as const, id: ev5 }, role: "response_evidence" as const, createdBy: actor, createdAt: "2026-08-15T00:00:00Z" },
    ];

    const artifacts: MilestoneArtifactContext = {
      requirements: new Map(),
      artifacts: new Map([[artifact.id, artifact]]),
      versions: new Map([[version.id, version]]),
      submissions: new Map(),
      verifications: new Map(),
      links,
    };

    const doc = createMilestoneDocument({ milestone, profile: p, artifacts });
    const chDoc = doc.getChallenges().require(challengeId);
    const evidenceList = chDoc.getEvidence();

    const ev1Doc = evidenceList.require(ev1);
    expect(ev1Doc.getTitle()).toBe("Valid evidence");
    expect(ev1Doc.getState()).toBe("active");
    expect(ev1Doc.getSources().isResolved()).toBe(true);
    expect(ev1Doc.getSources().isPending()).toBe(false);
    expect(ev1Doc.getSources().isInvalid()).toBe(false);
    expect(ev1Doc.getSources().getCount()).toBe(1);
    expect(ev1Doc.getSources().list()[0]!.getLinkId()).toBe("l-valid");
    expect(ev1Doc.getSources().list()[0]!.getRole()).toBe("challenge_evidence");
    expect(ev1Doc.getSources().list()[0]!.getArtifactId()).toBe("art-ev");
    expect(ev1Doc.getSources().list()[0]!.getArtifactVersionId()).toBe("ver-ev");

    const ev2Doc = evidenceList.require(ev2);
    expect(ev2Doc.getSources().isInvalid()).toBe(true);
    expect(ev2Doc.getSources().getIssues()[0]!.getCode()).toBe("evidence_source_unpinned");
    expect(ev2Doc.getSources().getIssues()[0]!.getLinkId()).toBe("l-unpinned");
    expect(ev2Doc.getSources().getIssues()[0]!.getMessage()).toBeDefined();

    const ev3Doc = evidenceList.require(ev3);
    expect(ev3Doc.getSources().getIssues()[0]!.getCode()).toBe("evidence_source_artifact_missing");

    const ev4Doc = evidenceList.require(ev4);
    expect(ev4Doc.getSources().getIssues()[0]!.getCode()).toBe("evidence_source_version_missing");

    const ev5Doc = evidenceList.require(ev5);
    expect(ev5Doc.getSources().getIssues()[0]!.getCode()).toBe("evidence_source_role_mismatch");

    const ev6Doc = evidenceList.require(ev6);
    expect(ev6Doc.getState()).toBe("withdrawn");
    expect(ev6Doc.getWithdrawalReason().getText()).toBe("Withdrawn");
  });

  it("Test X: Source Editor detach and update methods", () => {
    const h = create();
    const editor = new MilestoneEditor(h.milestone, h.profile, h);
    const s1 = sourceLink({ type: "milestone", id: h.milestone.id }, "context", "s-1");
    const s2 = sourceLink({ type: "milestone", id: h.milestone.id }, "context", "s-2");
    const s3 = sourceLink({ type: "milestone", id: h.milestone.id }, "context", "s-3");
    editor.sources.attach(s1);
    editor.sources.attach(s2);
    editor.sources.replace(s2.id, s3, actor);
    editor.sources.remove(s1.id, actor);
    editor.sources.update(s3.id, { note: "Updated note" }, actor);
    const milestone = editor.commit().milestone;
    expect(milestone.sourceLinks).toHaveLength(1);
    expect(milestone.sourceLinks![0]!.note).toBe("Updated note");
  });

  it("Test Z: Factory functions, collection filters, and edge cases across DOM documents", () => {
    const p = profile({
      approvals: { enabled: true, required: true },
      challenges: { enabled: true },
      reviews: { enabled: true, required: true },
      dependencies: { enabled: true, participatesInGraph: true },
    });
    const h = create({
      profile: p,
      criteria: [
        { title: "C1", state: "verified", required: true },
        { title: "C2", state: "not_started", required: false },
      ],
      deliverables: [
        { title: "D1", state: "satisfied", required: true },
        { title: "D2", state: "missing", required: false },
      ],
      approvalPolicy: {
        stages: [
          { label: "Stage 1", required: true, requiredApprovalCount: 1, scope: "milestone" },
        ],
      },
    });

    const upHarness = create({}, "upstream-z");
    const upEditor = new MilestoneEditor(upHarness.milestone, upHarness.profile, upHarness);
    upEditor.accept();
    const upAccepted = upEditor.commit().milestone;

    const editor = new MilestoneEditor(h.milestone, p, h);
    editor.dependencies.add(upAccepted.id, { type: "accepted" });
    editor.sources.attach({ ...sourceLink({ type: "milestone", id: h.milestone.id }, "context", "src-z"), artifactVersionId: "ver-z" as never });

    const stageId = h.milestone.approvalPolicy!.stages[0]!.id;
    editor.approvals.grant(stageId, actor);
    const rev1 = editor.reviews.request({ requestedBy: actor });
    editor.reviews.complete(rev1, "changes_requested", { completedBy: actor, summary: "Needs changes" });
    const rev2 = editor.reviews.request({ requestedBy: actor });
    editor.reviews.complete(rev2, "accepted", { completedBy: actor, summary: "All good" });

    const chOpen = editor.challenges.raise({ type: "milestone" }, "Open blocking", "blocking", actor);
    expect(chOpen).toBeDefined();
    const chResolved = editor.challenges.raise({ type: "milestone" }, "Resolved non-blocking", "non_blocking", actor);
    editor.challenges.resolve(chResolved, "no_effect", { actor, summary: "Resolved cleanly" });

    const evA = editor.evidence.add(chResolved, { kind: "supporting", title: "Evidence A", description: "Desc A" }, actor);
    const evB = editor.evidence.supersede(evA, { kind: "supporting", title: "Evidence B", description: "Desc B" }, actor);

    const milestone = editor.commit().milestone;
    const graph = createGraphSnapshot([upAccepted, milestone], milestone.dependencies);

    const doc = createMilestoneDocument({
      milestone,
      profile: p,
      graph,
    });

    // Challenges collection filters & document methods
    const challenges = doc.getChallenges();
    expect(challenges.getOpen()).toHaveLength(1);
    expect(challenges.getBlocking()).toHaveLength(1);
    expect(challenges.getResolved()).toHaveLength(1);
    expect(challenges.getByState("open")).toHaveLength(1);
    expect(challenges.getByState("resolved")).toHaveLength(1);
    expect(challenges.getForRevision(milestone.currentRevisionId)).toHaveLength(2);
    expect(challenges.getCurrentRevision()).toHaveLength(2);

    const chDoc = challenges.require(chResolved);
    expect(chDoc.isOpen()).toBe(false);
    expect(chDoc.isBlocking()).toBe(false);
    expect(chDoc.isCurrentRevision()).toBe(true);
    expect(chDoc.getRaisedBy()).toEqual(actor);
    expect(chDoc.getCreatedAt()).toBeDefined();
    expect(chDoc.getResolution()).toBeDefined();
    expect(chDoc.getResolution()?.getSourceSnapshots()).toHaveLength(0);

    const evColl = chDoc.getEvidence();
    expect(evColl.getCount()).toBe(2);
    expect(evColl.has(evA)).toBe(true);
    expect(evColl.get(evA)).toBeDefined();
    const evADoc = evColl.require(evA);
    expect(evADoc.getState()).toBe("superseded");
    const evBDoc = evColl.require(evB);
    expect(evBDoc.getSupersedesEvidenceId()).toBe(evA);
    expect(evBDoc.getSources().isPending()).toBe(true);
    expect(evBDoc.getSources().getStatus()).toBe("pending");
    expect(evBDoc.getSources().isInvalid()).toBe(false);
    expect(evBDoc.getSources().isResolved()).toBe(false);

    // Reviews collection filters
    const reviews = doc.getReviews();
    expect(reviews.getChangesRequested()).toHaveLength(1);
    expect(reviews.getByState("completed")).toHaveLength(2);
    const rev1Doc = reviews.require(rev1);
    expect(rev1Doc.getResult()).toBe("changes_requested");
    expect(rev1Doc.getSourceSnapshots()).toHaveLength(0);

    // Criteria collection filters
    const criteria = doc.getCriteria();
    expect(criteria.getRequired()).toHaveLength(1);
    expect(criteria.getOptional()).toHaveLength(1);
    expect(criteria.getVerified()).toHaveLength(1);
    expect(criteria.getByState("not_started")).toHaveLength(1);
    expect(criteria.getUnsatisfied()).toHaveLength(1);

    // Deliverables collection filters
    const deliverables = doc.getDeliverables();
    expect(deliverables.getRequired()).toHaveLength(1);
    expect(deliverables.getOptional()).toHaveLength(1);
    expect(deliverables.getSatisfied()).toHaveLength(1);
    expect(deliverables.getByState("missing")).toHaveLength(1);
    expect(deliverables.getUnsatisfied()).toHaveLength(1);

    // Dependencies collection filters
    const dependencies = doc.getDependencies();
    expect(dependencies.getBlocking()).toHaveLength(1);
    expect(dependencies.getNonBlocking()).toHaveLength(0);
    expect(dependencies.getSatisfied()).toHaveLength(1);
    expect(dependencies.getUnsatisfied()).toHaveLength(0);
    expect(dependencies.getUnknown()).toHaveLength(0);

    // Overview document
    const overview = doc.getOverview();
    expect(overview.getId()).toBe(milestone.id);
    expect(overview.getKey()).toBeUndefined();
    expect(overview.getTitle()).toBe(milestone.definition.title);
    expect(overview.getCriterionCount()).toBe(2);
    expect(overview.getDeliverableCount()).toBe(2);
    expect(overview.getDependencyCount()).toBe(1);
    expect(overview.getChallengeCount()).toBe(2);
    expect(overview.getReviewCount()).toBe(2);
    expect(overview.getRevisionCount()).toBe(2);
    expect(overview.isAccepted()).toBe(false);
    expect(overview.isCompleted()).toBe(false);
    expect(overview.isBlocked()).toBe(false);
    expect(overview.isReady()).toBe(true);

    // Profile document
    const prof = doc.getProfile();
    expect(prof.getId()).toBe(p.ref.id);
    expect(prof.getVersion()).toBe(p.ref.version);
    expect(prof.hasCriteria()).toBe(true);
    expect(prof.hasDeliverables()).toBe(true);
    expect(prof.hasDependencies()).toBe(true);
    expect(prof.participatesInGraph()).toBe(true);
    expect(prof.hasRevisions()).toBe(true);
    expect(prof.hasChallenges()).toBe(true);
    expect(prof.hasReviews()).toBe(true);
    expect(prof.requiresReviews()).toBe(true);
    expect(prof.hasApprovals()).toBe(true);
    expect(prof.requiresApprovals()).toBe(true);
    expect(prof.hasCompletion()).toBe(true);
    expect(prof.closeImmediatelyOnAcceptance()).toBe(false);
  });

  it("Test AA: Builder methods, standalone document factories, and graph gate assertions", () => {
    const p = profile({
      approvals: { enabled: true, required: true },
      challenges: { enabled: true },
      reviews: { enabled: true, required: true },
    });
    const h = create({
      profile: p,
      criteria: [{ title: "C1", state: "verified", required: true }],
      deliverables: [{ title: "D1", state: "satisfied", required: true }],
      approvalPolicy: { stages: [{ label: "S1", required: true, requiredApprovalCount: 1, scope: "milestone" }] },
    });

    const editor = new MilestoneEditor(h.milestone, p, h);
    const s1 = sourceLink({ type: "milestone", id: h.milestone.id }, "specification", "src-aa");
    editor.sources.attach({ ...s1, artifactVersionId: "ver-aa" as never });
    const stageId = h.milestone.approvalPolicy!.stages[0]!.id;
    editor.approvals.grant(stageId, actor);
    const revId = editor.reviews.request({ requestedBy: actor });
    editor.reviews.complete(revId, "accepted", { completedBy: actor, summary: "Pass" });
    const chId = editor.challenges.raise({ type: "milestone" }, "Note", "non_blocking", actor);
    editor.challenges.resolve(chId, "no_effect", { actor, summary: "Resolved" });
    editor.accept(actor);
    editor.complete(actor, "Complete milestone");
    const milestone = editor.commit().milestone;

    const builder = new MilestoneDocumentBuilder(milestone, p);
    builder.withGraph(undefined);
    builder.withoutGraph();
    builder.withArtifacts(undefined);
    builder.withoutArtifacts();
    const doc = builder.build();
    expect(doc.getId()).toBe(milestone.id);

    // Test standalone factories imported from public / dom
    const context = { milestone, profile: p };
    const critDoc = createCriterionDocument(milestone.criteria[0]!, context);
    expect(critDoc.getTitle()).toBe("C1");
    const critsDoc = createCriteriaDocument(context);
    expect(critsDoc.getCount()).toBe(1);

    const delivDoc = createDeliverableDocument(milestone.deliverables[0]!, context);
    expect(delivDoc.getTitle()).toBe("D1");
    const delivsDoc = createDeliverablesDocument(context);
    expect(delivsDoc.getCount()).toBe(1);

    const revDoc = createRevisionDocument(milestone.revisions[0]!, context);
    expect(revDoc.getNumber()).toBe(1);
    const revsDoc = createRevisionsDocument(context);
    expect(revsDoc.getCount()).toBeGreaterThan(0);

    const reviewDoc = createReviewDocument(milestone.reviews[0]!, context);
    expect(reviewDoc.getId()).toBe(revId);
    const reviewsDoc = createReviewsDocument(context);
    expect(reviewsDoc.getCount()).toBe(1);

    const challengeDoc = createChallengeDocument(milestone.challenges[0]!, context);
    expect(challengeDoc.getId()).toBe(chId);
    const challengesDoc = createChallengesDocument(context);
    expect(challengesDoc.getCount()).toBe(1);

    const stageDoc = createApprovalStageDocument(milestone.approvalPolicy!.stages[0]!, context);
    expect(stageDoc.getId()).toBe(stageId);
    const stagesDoc = createApprovalsDocument(context);
    expect(stagesDoc.getStages().getCount()).toBe(1);
    const recordDoc = createApprovalRecordDocument(milestone.approvalRecords[0]!);
    expect(recordDoc.getType()).toBe("granted");

    const acceptanceDoc = createAcceptanceStatusDocument(context);
    expect(acceptanceDoc.isAccepted()).toBe(true);
    const accDoc = createAcceptanceDocument(milestone.acceptanceRecords[0]!, context);
    expect(accDoc.getRevisionId()).toBe(milestone.acceptanceRecords[0]!.milestoneRevisionId);
    const accSnapDoc = createAcceptanceSnapshotDocument(milestone.acceptanceRecords[0]!.snapshot);
    expect(accSnapDoc.getRevisionId()).toBe(milestone.currentRevisionId);

    const completionDoc = createCompletionStatusDocument(context);
    expect(completionDoc.isCompleted()).toBe(true);
    const compDoc = createCompletionDocument(milestone.completionRecords[0]!, context);
    expect(compDoc.getId()).toBe(milestone.completionRecords[0]!.id);

    const srcsDoc = createSourcesDocument(milestone.sourceLinks);
    expect(srcsDoc.getCount()).toBe(1);
    const srcsSubjDoc = createSourcesDocumentForSubject(milestone.sourceLinks, { type: "milestone", id: milestone.id });
    expect(srcsSubjDoc.getCount()).toBe(1);

    // Stale deliverable gate in graph error check
    const baseGraph = createGraphSnapshot([milestone], []);
    const node = baseGraph.milestones.get(milestone.id)!;
    const staleDeliverableNode = {
      ...node,
      gates: {
        ...node.gates,
        deliverables: new Map([[milestone.deliverables[0]!.id, { state: "missing" as const }]]),
      },
    };
    const staleGraph: MilestoneGraphSnapshot = {
      milestones: new Map([[milestone.id, staleDeliverableNode]]),
      dependencies: [],
    };
    expect(() => createMilestoneDocument({ milestone, profile: p, graph: staleGraph })).toThrowError(/Graph deliverable gate .* is stale/);

    const missingDeliverableNode = {
      ...node,
      gates: {
        ...node.gates,
        deliverables: new Map(),
      },
    };
    const missingGraph: MilestoneGraphSnapshot = {
      milestones: new Map([[milestone.id, missingDeliverableNode]]),
      dependencies: [],
    };
    expect(() => createMilestoneDocument({ milestone, profile: p, graph: missingGraph })).toThrowError(/Graph deliverable gates are stale/);
  });

  it("Test BB: Full collection operations, subject-scoped sources, and sub-document factories", () => {
    const p = profile({
      challenges: { enabled: true },
      reviews: { enabled: true, required: false },
      dependencies: { enabled: true, participatesInGraph: false },
    });
    const h = create({
      profile: p,
      definition: {
        title: "Milestone BB",
        description: "Desc BB",
        metadata: { customField: "customVal" },
      },
      criteria: [{ title: "C-BB", state: "verified", required: true }],
      deliverables: [{ title: "D-BB", state: "satisfied", required: true }],
    });

    const cId = h.milestone.criteria[0]!.id;
    const dId = h.milestone.deliverables[0]!.id;

    const editor = new MilestoneEditor(h.milestone, p, h);
    const chId = editor.challenges.raise({ type: "milestone" }, "Chal BB", "non_blocking", actor);
    const evSup = editor.evidence.add(chId, { kind: "supporting", title: "Sup Ev", description: "Sup" }, actor);
    expect(evSup).toBeDefined();
    const evResp = editor.evidence.add(chId, { kind: "response", title: "Resp Ev", description: "Resp" }, actor);
    expect(evResp).toBeDefined();

    const revId = editor.reviews.request({ requestedBy: actor });

    const sCrit = sourceLink({ type: "criterion", id: cId }, "context", "src-crit");
    const sDeliv = sourceLink({ type: "deliverable_requirement", id: dId }, "context", "src-deliv");
    const sChal = sourceLink({ type: "challenge", id: chId }, "context", "src-chal");
    const sRev = sourceLink({ type: "review", id: revId }, "context", "src-rev");

    editor.sources.attach(sCrit, actor);
    editor.sources.attach(sDeliv, actor);
    editor.sources.attach(sChal, actor);
    editor.sources.attach(sRev, actor);
    editor.sources.updateRole(sCrit.id, "reference", actor);

    const milestone = editor.commit().milestone;
    const context = { milestone, profile: p };
    const doc = createMilestoneDocument(context);

    // Overview audit and counts
    const overview = doc.getOverview();
    expect(overview.getSourceCount()).toBeGreaterThan(0);
    expect(overview.getCreatedAt()).toBeDefined();
    expect(overview.getUpdatedAt()).toBeDefined();
    const standaloneOverview = createOverviewDocument(context);
    expect(standaloneOverview.getId()).toBe(milestone.id);

    // Criteria collection methods
    const criteria = doc.getCriteria();
    expect(criteria.has(cId)).toBe(true);
    expect(criteria.has("absent" as never)).toBe(false);
    expect(criteria.get(cId)).toBeDefined();
    expect(criteria.get("absent" as never)).toBeUndefined();
    expect(criteria.list({ offset: 0, limit: 1 })).toHaveLength(1);

    // Deliverables collection methods
    const deliverables = doc.getDeliverables();
    expect(deliverables.has(dId)).toBe(true);
    expect(deliverables.has("absent" as never)).toBe(false);
    expect(deliverables.get(dId)).toBeDefined();
    expect(deliverables.get("absent" as never)).toBeUndefined();
    expect(deliverables.list({ offset: 0, limit: 1 })).toHaveLength(1);

    // Challenges and Evidence collection methods
    const challenges = doc.getChallenges();
    expect(challenges.has(chId)).toBe(true);
    expect(challenges.has("absent" as never)).toBe(false);
    expect(challenges.get(chId)).toBeDefined();
    expect(challenges.get("absent" as never)).toBeUndefined();
    expect(challenges.list({ offset: 0, limit: 1 })).toHaveLength(1);

    const chDoc = challenges.require(chId);
    const evColl = chDoc.getEvidence();
    expect(evColl.getActive()).toHaveLength(2);
    expect(evColl.getSupporting()).toHaveLength(1);
    expect(evColl.getResponses()).toHaveLength(1);
    expect(evColl.list({ offset: 0, limit: 1 })).toHaveLength(1);

    // Reviews collection methods
    const reviews = doc.getReviews();
    expect(reviews.has(revId)).toBe(true);
    expect(reviews.has("absent" as never)).toBe(false);
    expect(reviews.get(revId)).toBeDefined();
    expect(reviews.get("absent" as never)).toBeUndefined();
    expect(reviews.list({ offset: 0, limit: 1 })).toHaveLength(1);

    // Revisions collection methods
    const revisions = doc.getRevisions();
    expect(revisions.has(milestone.currentRevisionId)).toBe(true);
    expect(revisions.has("absent" as never)).toBe(false);
    expect(revisions.get(milestone.currentRevisionId)).toBeDefined();
    expect(revisions.get("absent" as never)).toBeUndefined();
    expect(revisions.list({ offset: 0, limit: 1 })).toHaveLength(1);

    // Dependencies standalone factories
    const depDoc = createDependenciesDocument(context);
    expect(depDoc.isEmpty()).toBe(true);

    // Issues standalone factories
    const issuesDoc = createIssuesDocument([{ code: "missing_criterion", subjectId: "c-1", message: "Test issue message" }]);
    expect(issuesDoc.getCount()).toBe(1);
    expect(issuesDoc.isEmpty()).toBe(false);
    expect(issuesDoc.getByCode("missing_criterion")).toHaveLength(1);
    expect(issuesDoc.getByCategory("criteria")).toHaveLength(1);
    expect(issuesDoc.list({ limit: 1 })).toHaveLength(1);
    const issueDoc = createIssueDocument({ code: "missing_deliverable", subjectId: "d-1", message: "Test issue message 2" });
    expect(issueDoc.getCode()).toBe("missing_deliverable");
    expect(issueDoc.getMessage()).toBe("Test issue message 2");

    // Definition standalone factory
    const defDoc = createDefinitionDocument(milestone.definition);
    expect(defDoc.hasMetadata("customField")).toBe(true);
    expect(defDoc.hasMetadata("absentField")).toBe(false);
    expect(defDoc.getMetadataValue("customField")).toBe("customVal");
    expect(defDoc.getMetadataValue("absentField")).toBeUndefined();

    // Progress standalone factory
    const progDoc = createProgressDocument({ completedWeight: 5, totalWeight: 10, percentage: 50 });
    expect(progDoc.getCompletedWeight()).toBe(5);
    expect(progDoc.getTotalWeight()).toBe(10);
    expect(progDoc.getPercentage()).toBe(50);
    expect(progDoc.isComplete()).toBe(false);

    // Readiness standalone factory
    const readyDoc = createReadinessDocument(context);
    expect(readyDoc.isReady()).toBeUndefined();
    expect(readyDoc.getUnknownDependencyCount()).toBe(0);
  });

  it("Test CC: Subdocument getSources navigation, overview sub-collections, history lookup and description queries", () => {
    const p = profile({
      approvals: { enabled: true, required: true },
      challenges: { enabled: true },
      reviews: { enabled: true, required: true },
    });
    const h = create({
      profile: p,
      definition: { title: "Milestone CC", description: "Has full description" },
      criteria: [{ title: "C-CC", description: "Crit desc", state: "verified", required: true }],
      deliverables: [{ title: "D-CC", description: "Deliv desc", state: "satisfied", required: true }],
      approvalPolicy: { stages: [{ label: "Stage CC", required: true, requiredApprovalCount: 1, scope: "milestone" }] },
    });

    const editor = new MilestoneEditor(h.milestone, p, h);
    const cId = h.milestone.criteria[0]!.id;
    const dId = h.milestone.deliverables[0]!.id;
    const stageId = h.milestone.approvalPolicy!.stages[0]!.id;

    const chId = editor.challenges.raise({ type: "milestone" }, "Chal CC", "non_blocking", actor);
    editor.challenges.resolve(chId, "no_effect", { actor, summary: "Resolved CC" });

    const revId = editor.reviews.request({ requestedBy: actor });
    editor.reviews.complete(revId, "accepted", { completedBy: actor, summary: "Review CC pass" });

    editor.approvals.grant(stageId, actor);
    editor.accept(actor);
    editor.complete(actor, "Done CC");

    const milestone = editor.commit().milestone;
    const context = { milestone, profile: p };
    const doc = createMilestoneDocument(context);

    // Overview accessors
    const overview = doc.getOverview();
    expect(overview.getDefinition().getTitle()).toBe("Milestone CC");
    expect(overview.getDescription().getText()).toBe("Has full description");
    expect(overview.getState()).toBe("completed");
    expect(overview.getSequence()).toBeGreaterThan(0);
    expect(overview.getCurrentRevisionNumber()).toBe(1);
    expect(overview.getProgress().isComplete()).toBe(true);
    expect(overview.getOpenChallengeCount()).toBe(0);
    expect(overview.getBlockingChallengeCount()).toBe(0);
    expect(overview.getCriterionCount()).toBe(1);
    expect(overview.getDeliverableCount()).toBe(1);
    expect(overview.getDependencyCount()).toBe(0);
    expect(overview.getRevisionCount()).toBeGreaterThan(0);
    expect(overview.getChallengeCount()).toBe(1);
    expect(overview.getReviewCount()).toBe(1);

    // Description presence queries
    const critDoc = doc.getCriteria().require(cId);
    expect(critDoc.hasDescription()).toBe(true);
    expect(critDoc.getOverview().hasDescription()).toBe(true);

    const delivDoc = doc.getDeliverables().require(dId);
    expect(delivDoc.hasDescription()).toBe(true);
    expect(delivDoc.getOverview().hasDescription()).toBe(true);

    // Subdocument getSources calls
    const chDoc = doc.getChallenges().require(chId);
    expect(chDoc.getSources().isEmpty()).toBe(true);

    const revDoc = doc.getReviews().require(revId);
    expect(revDoc.getSources().isEmpty()).toBe(true);

    const revisionDoc = doc.getRevisions().require(milestone.currentRevisionId);
    expect(revisionDoc.getSources().isEmpty()).toBe(true);

    const stageDoc = doc.getApprovals().getStages().require(stageId);
    expect(stageDoc.isSatisfied()).toBe(true);

    const accDoc = doc.getAcceptanceStatus().getHistory().require(milestone.currentAcceptanceId!);
    expect(accDoc.getSnapshot().getSources()).toHaveLength(0);
    expect(doc.getAcceptanceStatus().getHistory().has(milestone.currentAcceptanceId!)).toBe(true);
    expect(doc.getAcceptanceStatus().getHistory().get(milestone.currentAcceptanceId!)).toBeDefined();

    const compDoc = doc.getCompletionStatus().getHistory().require(milestone.currentCompletionId!);
    expect(compDoc.hasReason()).toBe(true);
    expect(compDoc.isCurrent()).toBe(true);
    expect(doc.getCompletionStatus().getHistory().has(milestone.currentCompletionId!)).toBe(true);
    expect(doc.getCompletionStatus().getHistory().get(milestone.currentCompletionId!)).toBeDefined();

    // Standalone dependency document factory with active dependency
    const depDoc = createDependencyDocument({
      id: "dep-cc" as never,
      milestoneId: milestone.id,
      dependsOnMilestoneId: "up-cc" as never,
      gate: { type: "accepted" },
      blocking: true,
    }, context);
    expect(depDoc.getId()).toBe("dep-cc");
  });

  it("Test DD: Acceptance/Completion latest, unaccepted status, approval record require, and revision snapshot document", () => {
    // 1. Initial milestone without acceptance or completion
    const p = profile({
      approvals: { enabled: false, required: false },
      reviews: { enabled: true, required: false },
    });
    const h = create({ profile: p });
    const initialDoc = createMilestoneDocument({ milestone: h.milestone, profile: p });

    expect(initialDoc.getAcceptanceStatus().getCurrent()).toBeUndefined();
    expect(initialDoc.getCompletionStatus().getCurrent()).toBeUndefined();
    expect(initialDoc.getAcceptanceStatus().getHistory().getLatest()).toBeUndefined();
    expect(initialDoc.getCompletionStatus().getHistory().getLatest()).toBeUndefined();
    expect(initialDoc.getApprovals().isSatisfied()).toBe(true);

    // 2. Perform actions to create records
    const editor = new MilestoneEditor(h.milestone, p, h);
    const revId = editor.reviews.request({ requestedBy: actor, assignedReviewer: actor });
    editor.reviews.complete(revId, "accepted", { completedBy: actor, summary: "Review narrative" });
    editor.accept(actor);
    editor.complete(actor, "Completed narrative");
    const milestone = editor.commit().milestone;

    const doc = createMilestoneDocument({ milestone, profile: p });
    const accLatest = doc.getAcceptanceStatus().getHistory().getLatest();
    expect(accLatest).toBeDefined();
    expect(accLatest?.getId()).toBe(milestone.currentAcceptanceId);

    const compLatest = doc.getCompletionStatus().getHistory().getLatest();
    expect(compLatest).toBeDefined();
    expect(compLatest?.getId()).toBe(milestone.currentCompletionId);

    const revDoc = doc.getReviews().require(revId);
    expect(revDoc.getSummary().getText()).toBe("Review narrative");
    expect(revDoc.getAssignedReviewer()).toEqual(actor);

    const latestRevision = doc.getRevisions().getLatest(1)[0]!;
    expect(latestRevision.getId()).toBe(milestone.currentRevisionId);
    expect(doc.getRevisions().getCurrent().getId()).toBe(milestone.currentRevisionId);

    const snapDoc = createRevisionSnapshotDocument(milestone.revisions[0]!.snapshot);
    expect(snapDoc.getDefinition().getTitle()).toBe(milestone.definition.title);

    const reviewsDoc = createReviewsDocument({ milestone, profile: p });
    expect(reviewsDoc.getCount()).toBe(1);
  });

  it("Test EE: Exhaustive snapshot sub-properties, policy getters, history filters, and review/approval collections", () => {
    const p = profile({
      approvals: { enabled: true, required: true },
      reviews: { enabled: true, required: true },
      dependencies: { enabled: true, participatesInGraph: true },
      challenges: { enabled: true },
    });
    const h = create({
      profile: p,
      definition: { title: "Milestone EE", description: "EE Desc" },
      criteria: [{ title: "C-EE", state: "verified", required: true }],
      deliverables: [{ title: "D-EE", state: "satisfied", required: true }],
      approvalPolicy: {
        stages: [{ label: "Stage EE", required: true, requiredApprovalCount: 1, scope: "milestone" }],
      },
    });

    const upH = create({}, "up-ee");
    const upEd = new MilestoneEditor(upH.milestone, upH.profile, upH);
    upEd.accept();
    const upAccepted = upEd.commit().milestone;

    const editorContext = {
      ...h,
      graph: createGraphSnapshot([upAccepted, h.milestone]),
    };
    const editor = new MilestoneEditor(h.milestone, p, editorContext);
    editor.dependencies.add(upAccepted.id, { type: "accepted" });

    const sCrit = sourceLink({ type: "criterion", id: h.milestone.criteria[0]!.id }, "specification", "src-crit-ee");
    editor.sources.attach({ ...sCrit, artifactVersionId: "ver-crit" as never });

    const stageId = h.milestone.approvalPolicy!.stages[0]!.id;
    editor.approvals.grant(stageId, actor);

    const revId = editor.reviews.request({ requestedBy: actor, assignedReviewer: actor });
    editor.reviews.complete(revId, "accepted", { completedBy: actor, summary: "Review pass EE" });

    const chId = editor.challenges.raise({ type: "milestone" }, "Chal EE", "non_blocking", actor);
    editor.challenges.resolve(chId, "no_effect", { actor, summary: "Resolved EE" });

    editor.accept(actor);
    editor.complete(actor, "Complete EE");
    const milestone = editor.commit().milestone;

    const graph = createGraphSnapshot([upAccepted, milestone], milestone.dependencies);
    const doc = createMilestoneDocument({ milestone, profile: p, graph });

    // 1. Acceptance history filters & snapshot policy getters
    const accHistory = doc.getAcceptanceStatus().getHistory();
    expect(accHistory.getForRevision(milestone.currentRevisionId)).toHaveLength(1);
    expect(accHistory.getForRevision("absent-rev" as never)).toHaveLength(0);

    const accDoc = doc.getAcceptanceStatus().getCurrent()!;
    const accSnap = accDoc.getSnapshot();
    expect(accSnap.getCriteria()).toHaveLength(1);
    expect(accSnap.getDeliverables()).toHaveLength(1);
    expect(accSnap.getDependencies()).toHaveLength(1);
    expect(accSnap.getChallenges()).toHaveLength(1);
    expect(accSnap.getReviews()).toHaveLength(1);
    expect(accSnap.getApprovals()).toHaveLength(1);
    expect(accSnap.getArtifacts()).toHaveLength(0);
    expect(accSnap.getSources()).toHaveLength(1);

    // 2. Completion history filters
    const compHistory = doc.getCompletionStatus().getHistory();
    expect(compHistory.getForRevision(milestone.currentRevisionId)).toHaveLength(1);
    expect(compHistory.getForRevision("absent-rev" as never)).toHaveLength(0);
    expect(compHistory.getForAcceptance(milestone.currentAcceptanceId!)).toHaveLength(1);
    expect(compHistory.getForAcceptance("absent-acc" as never)).toHaveLength(0);

    // 3. Approval records & stage definition queries
    const approvals = doc.getApprovals();
    expect(approvals.getRecords().getForRevision(milestone.currentRevisionId)).toHaveLength(1);
    expect(approvals.getRecords().getForStage(stageId)).toHaveLength(1);

    // 4. Revision queries, history list options, and sub-definitions
    const revisions = doc.getRevisions();
    expect(revisions.getByNumber(1)).toBeDefined();
    expect(revisions.getByNumber(999)).toBeUndefined();
    expect(revisions.getPrevious()).toBeDefined();
    expect(revisions.getLatest(0)).toHaveLength(0);

    const revSnap = revisions.getCurrent().getSnapshot();
    const critDef = revSnap.getCriterion(h.milestone.criteria[0]!.id)!;
    expect(critDef.getSources()).toHaveLength(1);
    expect(critDef.getWeight()).toBe(1);
    expect(critDef.getArtifactRequirementIds()).toHaveLength(0);

    const delivDef = revSnap.getDeliverables()[0]!;
    expect(delivDef.getSources()).toHaveLength(0);
    expect(delivDef.getArtifactRequirementIds()).toHaveLength(0);

    const depDef = revSnap.getDependencies()[0]!;
    expect(depDef.getGate().type).toBe("accepted");
    expect(depDef.isBlocking()).toBe(true);

    const appPol = revSnap.getApprovalPolicy();
    expect(appPol.hasPolicy()).toBe(true);
    expect(appPol.getStages()).toHaveLength(1);
    expect(appPol.getStage(stageId)).toBeDefined();
    expect(appPol.getStage("absent-stage" as never)).toBeUndefined();

    const pol = revSnap.getEvaluationPolicy();
    expect(pol.requiredCriteriaMustBeVerified()).toBe(true);
    expect(pol.requiredDeliverablesMustBeSatisfied()).toBe(true);
    expect(pol.waivedCriteriaSatisfyRequired()).toBe(true);
    expect(pol.waivedDeliverablesSatisfyRequired()).toBe(true);
    expect(pol.blockingChallengesPreventAcceptance()).toBe(true);
    expect(pol.getRequiredReviewResult()).toBe("accepted");
    expect(pol.requireReviewWhenProfileRequires()).toBe(true);
    expect(pol.requireApprovalsWhenProfileRequires()).toBe(true);
    expect(pol.completionRequiresCurrentAcceptance()).toBe(true);
    expect(pol.closeImmediatelyOnAcceptance()).toBe(false);

    // 5. Review document collection queries
    const reviews = doc.getReviews();
    expect(reviews.getPending()).toHaveLength(0);
    expect(reviews.getCompleted()).toHaveLength(1);
    expect(reviews.getAccepted()).toHaveLength(1);
    expect(reviews.getChangesRequested()).toHaveLength(0);
    expect(reviews.getRejected()).toHaveLength(0);
    expect(reviews.getCurrentRevision()).toHaveLength(1);
    expect(reviews.getSatisfyingCurrentAcceptance()).toHaveLength(1);

    // 6. Dependencies document queries
    const dependencies = doc.getDependencies();
    expect(dependencies.getBlocking()).toHaveLength(1);
    expect(dependencies.getNonBlocking()).toHaveLength(0);
    expect(dependencies.getSatisfied()).toHaveLength(1);
    expect(dependencies.getUnsatisfied()).toHaveLength(0);
    expect(dependencies.getUnknown()).toHaveLength(0);
  });

  it("Test FF: Multi-record history sorting, empty collection edge-cases, non-blocking dependencies, and unresolved challenge resolution", () => {
    // 1. Empty collections on bare milestone
    const pBare = profile({
      approvals: { enabled: true, required: false },
      challenges: { enabled: true },
      reviews: { enabled: true, required: false },
      dependencies: { enabled: true, participatesInGraph: false },
    });
    const hBare = create({ profile: pBare });
    const bareDoc = createMilestoneDocument({ milestone: hBare.milestone, profile: pBare });

    expect(bareDoc.getChallenges().isEmpty()).toBe(true);
    expect(bareDoc.getCriteria().isEmpty()).toBe(true);
    expect(bareDoc.getDeliverables().isEmpty()).toBe(true);
    expect(bareDoc.getDependencies().isEmpty()).toBe(true);
    expect(bareDoc.getReviews().isEmpty()).toBe(true);
    expect(bareDoc.getApprovals().getStages().isEmpty()).toBe(true);
    expect(bareDoc.getApprovals().getRecords().isEmpty()).toBe(true);

    // 2. Reopen and multi-acceptance/completion history sorting + non-blocking dependency + unresolved challenge
    const pFull = profile({
      approvals: { enabled: true, required: false },
      challenges: { enabled: true },
      dependencies: { enabled: true, participatesInGraph: false },
    });
    const hFull = create({
      profile: pFull,
      criteria: [{ title: "C1", state: "verified", required: true }],
      approvalPolicy: { stages: [{ label: "Stage 1", required: false, requiredApprovalCount: 1, scope: "milestone" }] },
    });

    const editor = new MilestoneEditor(hFull.milestone, pFull, hFull);
    const stageId = hFull.milestone.approvalPolicy!.stages[0]!.id;
    editor.dependencies.add("upstream-other" as never, { type: "completed" }, false); // non-blocking
    const chId = editor.challenges.raise({ type: "milestone" }, "Open Chal", "non_blocking", actor);
    const rId1 = editor.approvals.grant(stageId, actor);

    editor.accept(actor);
    editor.complete(actor, "First complete");
    editor.reopen({
      reason: "Reopen to make second record",
      actor,
      effect: "invalidate_acceptance_and_completion",
    });
    editor.accept(actor);
    editor.complete(actor, "Second complete");
    const milestone = editor.commit().milestone;

    const doc = createMilestoneDocument({ milestone, profile: pFull });

    // Multi-record acceptance and completion history sorting
    const accLatest = doc.getAcceptanceStatus().getHistory().getLatest();
    expect(accLatest).toBeDefined();
    expect(doc.getAcceptanceStatus().getHistory().getCount()).toBe(2);

    const compLatest = doc.getCompletionStatus().getHistory().getLatest();
    expect(compLatest).toBeDefined();
    expect(doc.getCompletionStatus().getHistory().getCount()).toBe(2);

    // Multiple revisions sorting
    const revs = doc.getRevisions();
    expect(revs.getLatest(2)).toHaveLength(2);
    expect(revs.getLatest(0)).toHaveLength(0);

    // Unresolved challenge resolution getter
    const chDoc = doc.getChallenges().require(chId);
    expect(chDoc.getResolution()).toBeUndefined();

    // Non-blocking dependency
    const nonBlockingDeps = doc.getDependencies().getNonBlocking();
    expect(nonBlockingDeps).toHaveLength(1);
    expect(nonBlockingDeps[0]!.isBlocking()).toBe(false);

    // Approval record require
    const appRecDoc = doc.getApprovals().getRecords().require(rId1);
    expect(appRecDoc.getId()).toBe(rId1);
  });

  it("Test GG: Pagination validation, text chunk bounds, bare definition metadata, readiness dependencies, and validation error", () => {
    const h = create({
      definition: { title: "Milestone GG", description: "Line 1\nLine 2\nLine 3" },
      criteria: [
        { title: "C1", required: true, state: "not_started" },
        { title: "C2", required: true, state: "not_started" },
      ],
    });
    const doc = createMilestoneDocument({ milestone: h.milestone, profile: h.profile });

    // Collection paging validation
    const critColl = doc.getCriteria();
    expect(() => critColl.list({ offset: -1 })).toThrow(RangeError);
    expect(() => critColl.list({ offset: 1.5 })).toThrow(RangeError);
    expect(() => critColl.list({ limit: Infinity })).toThrow(RangeError);

    // Text chunk paging validation and edge cases
    const descText = doc.getOverview().getDescription();
    expect(() => descText.read({ offset: -1 })).toThrow(RangeError);
    expect(() => descText.read({ offset: 1.5 })).toThrow(RangeError);
    expect(() => descText.read({ limit: Infinity })).toThrow(RangeError);

    const chunkZeroLimit = descText.read({ offset: 2, limit: 0 });
    expect(chunkZeroLimit.text).toBe("");
    expect(chunkZeroLimit.previousOffset).toBe(0);

    const chunkNoLimit = descText.read({ offset: 2 });
    expect(chunkNoLimit.text.length).toBeGreaterThan(0);
    expect(chunkNoLimit.previousOffset).toBe(0);

    // Bare definition without description or metadata
    const bareDef = createDefinitionDocument({ title: "Bare GG" });
    expect(bareDef.hasDescription()).toBe(false);
    expect(bareDef.hasMetadata("anyKey")).toBe(false);
    expect(bareDef.getMetadataValue("anyKey")).toBeUndefined();
    expect(bareDef.getMetadata()).toEqual({});

    // Overview readiness navigation
    expect(doc.getOverview().getReadiness().getDependencies().getCount()).toBe(0);

    // MilestoneValidationError
    const valErr = new MilestoneValidationError([{ code: "TEST_ERR", path: "test.path", message: "Validation issue" }]);
    expect(valErr.issues).toHaveLength(1);
    expect(valErr.name).toBe("MilestoneValidationError");
  });
});




