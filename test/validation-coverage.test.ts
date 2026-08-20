import { describe, expect, it } from "vitest";
import {
  MilestoneDomainError,
  assertValidBreakdown,
  assertValidTask,
  validateBreakdown,
  validateTask,
  type TaskProfile,
} from "../src/index.js";
import {
  assertValidTaskProfile,
  validateTaskProfile,
} from "../src/public/validation.js";

describe("Validation Coverage for Task & Breakdown", () => {
  it("validates TaskProfile and rejects invalid configurations", () => {
    const validProfile: TaskProfile = {
      ref: { id: "tp-1" as any, version: 1 },
      criteria: { enabled: true },
      deliverables: { enabled: true },
      dependencies: { enabled: true, participatesInGraph: true },
      revisions: { enabled: true },
      challenges: { enabled: true },
      reviews: { enabled: true, required: true },
      approvals: { enabled: true, required: true },
      completion: {
        enabled: true,
        requiresAcceptance: true,
        closeImmediatelyOnAcceptance: false,
      },
    };

    expect(validateTaskProfile(validProfile).length).toBe(0);
    expect(() => assertValidTaskProfile(validProfile)).not.toThrow();

    // Invalid profile: reviews required but reviews disabled
    const invalidProfile: TaskProfile = {
      ...validProfile,
      reviews: { enabled: false, required: true },
    };
    const issues = validateTaskProfile(invalidProfile);
    expect(issues.length).toBeGreaterThan(0);
    expect(() => assertValidTaskProfile(invalidProfile)).toThrow(MilestoneDomainError);

    // Invalid profile: approvals required but approvals disabled
    expect(validateTaskProfile({ ...validProfile, approvals: { enabled: false, required: true } }).some((i) => i.code === "invalid_profile")).toBe(true);

    // Invalid profile: immediate completion but completion disabled
    expect(validateTaskProfile({ ...validProfile, completion: { enabled: false, requiresAcceptance: false, closeImmediatelyOnAcceptance: true } }).some((i) => i.code === "invalid_profile")).toBe(true);

    // Invalid profile: version 0
    expect(validateTaskProfile({ ...validProfile, ref: { id: "p1" as any, version: 0 } }).some((i) => i.code === "invalid_version")).toBe(true);
  });

  it("validates Task and reports comprehensive issues for malformed tasks", () => {
    const invalidTask: any = {
      id: "task_bad",
      profile: { id: "p1", version: 1 },
      scope: { type: "invalid_scope" },
      revisions: [
        {
          id: "rev_1",
          taskId: "task_bad",
          number: 5, // Non-sequential revision number! (expected 1)
          previousRevisionId: "rev_unknown", // Initial revision cannot have previous revision!
          summary: "Init",
          snapshot: {
            definition: { title: "Title" },
            profile: { id: "p1", version: 1 },
          },
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "rev_2",
          taskId: "task_other", // mismatch
          number: 2,
          previousRevisionId: "rev_wrong", // invalid previous revision!
          summary: "Second",
          snapshot: {
            definition: { title: "Title 2" },
            profile: { id: "p1", version: 1 },
          },
          createdAt: "2026-08-20T12:00:00.000Z",
        },
      ],
      definition: { title: "" },
      sourceLinks: [
        {
          id: "sl_1",
          artifactId: "a1",
          role: "specification",
          subject: { type: "task", id: "task_different" }, // mismatch
        },
      ],
      criteria: [
        {
          id: "c1",
          title: "C1",
          sourceLinks: [
            {
              id: "sl_dup",
              artifactId: "a1",
              role: "evidence",
              subject: { type: "criterion", id: "c1" },
            },
            {
              id: "sl_dup", // Duplicate source link!
              artifactId: "a1",
              role: "evidence",
              subject: { type: "criterion", id: "c1" },
            },
          ],
        },
      ],
      deliverables: [{ id: "d1", title: "D1" }],
      dependencies: [
        {
          id: "dep_1",
          taskId: "task_other",
          dependsOn: { type: "task", id: "task_bad" }, // self dependency
          gate: { type: "invalid_gate" },
          blocking: true,
        },
        {
          id: "dep_dup_1",
          taskId: "task_bad",
          dependsOn: { type: "milestone", id: "ms-1" as any },
          gate: { type: "completed" },
          blocking: true,
        },
        {
          id: "dep_dup_2",
          taskId: "task_bad",
          dependsOn: { type: "milestone", id: "ms-1" as any },
          gate: { type: "completed" }, // Duplicate dependency gate!
          blocking: false,
        },
      ],
      challenges: [
        {
          id: "chal_1",
          taskId: "task_other",
          taskRevisionId: "rev_missing",
          target: { type: "criterion", criterionId: "c_none" },
          severity: "blocking",
          state: "resolved", // missing resolution
          evidence: [
            {
              id: "ev_0",
              taskId: "task_bad",
              challengeId: "chal_1",
              taskRevisionId: "rev_missing",
              kind: "supporting",
              title: "Ev 0",
              description: "Desc 0",
              state: "superseded", // Valid superseded predecessor!
              createdAt: "2026-08-20T12:00:00.000Z",
            },
            {
              id: "ev_valid_succ",
              taskId: "task_bad",
              challengeId: "chal_1",
              taskRevisionId: "rev_missing",
              kind: "supporting",
              title: "Valid Successor",
              description: "Desc",
              state: "active",
              supersedesEvidenceId: "ev_0", // Valid supersession!
              createdAt: "2026-08-20T12:00:00.000Z",
            },
            {
              id: "ev_bad_succ",
              taskId: "task_bad",
              challengeId: "chal_1",
              taskRevisionId: "rev_missing",
              kind: "supporting",
              title: "Bad Successor",
              description: "Desc",
              state: "active",
              supersedesEvidenceId: "ev_valid_succ", // ev_valid_succ is active, not superseded! (triggers line 377)
              createdAt: "2026-08-20T12:00:00.000Z",
            },
            {
              id: "ev_1",
              taskId: "task_other",
              challengeId: "chal_1",
              taskRevisionId: "rev_missing",
              kind: "supporting",
              title: "",
              description: "",
              state: "withdrawn", // missing withdrawal reason
              createdAt: "2026-08-20T12:00:00.000Z",
            },
            {
              id: "ev_3",
              taskId: "task_bad",
              challengeId: "chal_1",
              taskRevisionId: "rev_missing",
              kind: "supporting",
              title: "Ev 3",
              description: "Desc 3",
              state: "active",
              withdrawnAt: "2026-08-20T12:00:00.000Z", // active with withdrawal field!
              createdAt: "2026-08-20T12:00:00.000Z",
            },
            {
              id: "ev_4",
              taskId: "task_bad",
              challengeId: "chal_1",
              taskRevisionId: "rev_missing",
              kind: "supporting",
              title: "Ev 4",
              description: "Desc 4",
              state: "active",
              supersedesEvidenceId: "non_existent_ev", // missing predecessor!
              createdAt: "2026-08-20T12:00:00.000Z",
            },
            {
              id: "ev_1", // Duplicate evidence ID!
              taskId: "task_bad",
              challengeId: "chal_1",
              taskRevisionId: "rev_missing",
              kind: "invalid_kind" as any,
              title: "Ev 5",
              description: "Desc 5",
              state: "invalid_state" as any,
              createdAt: "", // Empty createdAt!
            },
          ],
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "chal_2",
          taskId: "task_bad",
          taskRevisionId: "rev_missing",
          target: { type: "deliverable_requirement", deliverableRequirementId: "d_missing" },
          severity: "warning",
          state: "open",
          evidence: [],
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "chal_3",
          taskId: "task_bad",
          taskRevisionId: "rev_missing",
          target: { type: "review", reviewId: "r_missing" },
          severity: "warning",
          state: "open",
          evidence: [],
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "chal_4",
          taskId: "task_bad",
          taskRevisionId: "rev_missing",
          target: { type: "evidence", ref: "" },
          severity: "warning",
          state: "open",
          evidence: [],
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "chal_5",
          taskId: "task_bad",
          taskRevisionId: "rev_missing",
          target: { type: "criterion", criterionId: "c1" },
          severity: "warning",
          state: "invalid_challenge_state" as any, // Invalid challenge state!
          evidence: [],
          createdAt: "2026-08-20T12:00:00.000Z",
        },
      ],
      reviews: [
        {
          id: "revw_1",
          taskId: "task_other",
          taskRevisionId: "rev_missing",
          state: "completed", // missing result
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "revw_2",
          taskId: "task_bad",
          taskRevisionId: "rev_missing",
          state: "pending",
          result: "invalid_result" as any, // Invalid review result!
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "revw_3",
          taskId: "task_bad",
          taskRevisionId: "rev_missing",
          state: "in_progress",
          result: "accepted", // Non-completed review carrying completion result!
          createdAt: "2026-08-20T12:00:00.000Z",
        },
      ],
      currentRevisionId: "rev_different",
      approvalRecords: [
        {
          id: "appr_bad_type",
          type: "invalid_type" as any, // Invalid approval record type!
          taskId: "task_bad",
          taskRevisionId: "rev_missing",
          stageId: "stg_1",
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "appr_grant_1",
          type: "granted",
          taskId: "task_bad",
          taskRevisionId: "rev_missing",
          stageId: "stg_1",
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "appr_rev_valid",
          type: "revoked",
          taskId: "task_bad",
          taskRevisionId: "rev_missing",
          stageId: "stg_1",
          revokesApprovalId: "appr_grant_1", // Valid preceding grant!
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "appr_rev_early",
          type: "revoked",
          taskId: "task_bad",
          taskRevisionId: "rev_missing",
          stageId: "stg_1",
          revokesApprovalId: "appr_grant_late", // Out of order revocation!
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "appr_grant_late",
          type: "granted",
          taskId: "task_bad",
          taskRevisionId: "rev_missing",
          stageId: "stg_1",
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "appr_rev_none",
          type: "revoked",
          taskId: "task_other",
          taskRevisionId: "rev_missing",
          stageId: "stg_1",
          revokesApprovalId: "appr_none", // Non-existent grant!
          createdAt: "2026-08-20T12:00:00.000Z",
        },
      ],
      currentAcceptanceId: "acc_1", // Stale current acceptance (targets rev_missing, not rev_different)!
      acceptanceRecords: [
        {
          id: "acc_1",
          taskId: "task_other",
          taskRevisionId: "rev_missing",
          acceptedAt: "2026-08-20T12:00:00.000Z",
          snapshot: {} as any,
        },
      ],
      currentCompletionId: "comp_missing", // Current completion does not exist!
      completionRecords: [
        {
          id: "comp_1",
          taskId: "task_other",
          taskRevisionId: "rev_missing",
          acceptanceId: "acc_none",
          completedAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "comp_2",
          taskId: "task_bad",
          taskRevisionId: "rev_different", // Mismatch with acc_1 (rev_missing)!
          acceptanceId: "acc_1",
          completedAt: "2026-08-20T12:00:00.000Z",
        },
      ],
      reminders: [
        { id: "rem-1", trigger: { type: "invalid" } },
        { id: "rem-2", trigger: { type: "at", at: "" } },
        { id: "rem-3", trigger: { type: "before_due", duration: "" } },
      ],
      timing: {
        startsAt: "2026-08-25T12:00:00.000Z",
        dueAt: "2026-08-20T12:00:00.000Z",
      },
      sequence: 0,
      createdAt: "",
    };

    // Disabled features in profile check
    const disabledProfile: TaskProfile = {
      ref: { id: "p-disabled" as any, version: 1 },
      criteria: { enabled: false },
      deliverables: { enabled: false },
      dependencies: { enabled: false, participatesInGraph: false },
      revisions: { enabled: true },
      challenges: { enabled: false },
      reviews: { enabled: false, required: false },
      approvals: { enabled: false, required: false },
      completion: {
        enabled: true,
        requiresAcceptance: true,
        closeImmediatelyOnAcceptance: false,
      },
    };

    const issues = validateTask(invalidTask, disabledProfile);
    expect(issues.length).toBeGreaterThan(0);
    expect(() => assertValidTask(invalidTask, disabledProfile)).toThrow(MilestoneDomainError);

    const issuesMissingAcc = validateTask({ ...invalidTask, currentAcceptanceId: "acc_missing" });
    expect(issuesMissingAcc.some((i) => i.code === "missing_current_acceptance")).toBe(true);

    const issuesStaleRev = validateTask({ ...invalidTask, currentRevisionId: "rev_1" });
    expect(issuesStaleRev.some((i) => i.code === "stale_current_revision")).toBe(true);

    const issuesProfileMismatch = validateTask({
      ...invalidTask,
      currentRevisionId: "rev_2",
      profile: { id: "p_different" as any, version: 99 },
    });
    expect(issuesProfileMismatch.some((i) => i.code === "profile_snapshot_mismatch")).toBe(true);

    // Self scoped task & empty scope IDs
    expect(validateTask({ ...invalidTask, scope: { type: "task", taskId: "task_bad" as any } }).some((i) => i.code === "self_scoped_task")).toBe(true);
    expect(validateTask({ ...invalidTask, scope: { type: "project", projectId: "" as any } }).some((i) => i.code === "empty_scope_project_id")).toBe(true);
    expect(validateTask({ ...invalidTask, scope: { type: "milestone", milestoneId: "" as any } }).some((i) => i.code === "empty_scope_milestone_id")).toBe(true);
    expect(validateTask({ ...invalidTask, scope: { type: "breakdown", breakdownId: "" as any } }).some((i) => i.code === "empty_scope_breakdown_id")).toBe(true);
    expect(validateTask({ ...invalidTask, scope: { type: "task", taskId: "" as any } }).some((i) => i.code === "empty_scope_task_id")).toBe(true);

    // Empty timing strings
    expect(validateTask({ ...invalidTask, timing: { startsAt: "", dueAt: "" } }).some((i) => i.code === "invalid_timing")).toBe(true);

    // Invalid profile ref on task
    expect(validateTask({ ...invalidTask, profile: { id: "", version: 0 } }).some((i) => i.code === "invalid_profile_ref")).toBe(true);
  });

  it("validates Breakdown and reports issues for malformed breakdowns", () => {
    const invalidBreakdown: any = {
      id: "",
      parentMilestoneId: "ms_parent",
      definition: { title: "" },
      milestones: [
        {
          id: "ms_parent", // Collision with parent!
          sequence: 1,
          definition: { title: "" }, // empty title in child milestone
          profile: { id: "p1", version: 1 },
          currentRevisionId: "rev_1",
          revisions: [
            {
              id: "rev_1",
              milestoneId: "ms_parent",
              number: 1,
              summary: "init",
              snapshot: {
                definition: { title: "" },
                profile: { id: "p1", version: 1 },
                criteria: [],
                deliverables: [],
                dependencies: [],
              },
              createdAt: "2026-08-20T12:00:00.000Z",
            },
          ],
          sourceLinks: [],
          criteria: [],
          deliverables: [],
          dependencies: [],
          challenges: [],
          reviews: [],
          approvalRecords: [],
          acceptanceRecords: [],
          completionRecords: [],
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "ms_dup",
          sequence: 1,
          definition: { title: "Dup child" },
          profile: { id: "p1", version: 1 },
          currentRevisionId: "rev_1",
          revisions: [
            {
              id: "rev_1",
              milestoneId: "ms_dup",
              number: 1,
              summary: "init",
              snapshot: {
                definition: { title: "Dup child" },
                profile: { id: "p1", version: 1 },
                criteria: [],
                deliverables: [],
                dependencies: [],
              },
              createdAt: "2026-08-20T12:00:00.000Z",
            },
          ],
          sourceLinks: [],
          criteria: [],
          deliverables: [],
          dependencies: [],
          challenges: [],
          reviews: [],
          approvalRecords: [],
          acceptanceRecords: [],
          completionRecords: [],
          createdAt: "2026-08-20T12:00:00.000Z",
        },
        {
          id: "ms_dup", // Duplicate child milestone!
          sequence: 1,
          definition: { title: "Dup child" },
          profile: { id: "p1", version: 1 },
          currentRevisionId: "rev_1",
          revisions: [
            {
              id: "rev_1",
              milestoneId: "ms_dup",
              number: 1,
              summary: "init",
              snapshot: {
                definition: { title: "Dup child" },
                profile: { id: "p1", version: 1 },
                criteria: [],
                deliverables: [],
                dependencies: [],
              },
              createdAt: "2026-08-20T12:00:00.000Z",
            },
          ],
          sourceLinks: [],
          criteria: [],
          deliverables: [],
          dependencies: [],
          challenges: [],
          reviews: [],
          approvalRecords: [],
          acceptanceRecords: [],
          completionRecords: [],
          createdAt: "2026-08-20T12:00:00.000Z",
        },
      ],
      sequence: 0,
      createdAt: "",
    };

    const issues = validateBreakdown(invalidBreakdown);
    expect(issues.length).toBeGreaterThan(0);
    expect(() => assertValidBreakdown(invalidBreakdown)).toThrow(MilestoneDomainError);

    expect(validateBreakdown({ ...invalidBreakdown, parentMilestoneId: "" as any }).some((i) => i.code === "empty_parent_milestone_id")).toBe(true);
  });
});
