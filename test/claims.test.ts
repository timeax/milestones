import { describe, expect, it } from "vitest";
import {
  MilestoneDomainError,
  MilestoneEditor,
  createMilestoneDocument,
  deserializeMilestone,
  migrateMilestoneWire,
  serializeMilestone,
  validateMilestone,
} from "../src/index.js";
import { create } from "./helpers.js";

describe("Milestone claims", () => {
  it("records nonexclusive claims and terminal releases without revising or changing execution gates", () => {
    const context = create({}, "claim-lifecycle");
    const beforeEvaluation = new MilestoneEditor(context.milestone, context.profile, context).evaluateAcceptance();
    const editor = new MilestoneEditor(context.milestone, context.profile, context);
    const alice = { id: "alice", type: "member" };
    const bob = { id: "bob", type: "member" };
    const aliceClaim = editor.claims.claim(alice);
    const bobClaim = editor.claims.claim(bob);
    expect(() => editor.claims.claim(alice)).toThrowError(MilestoneDomainError);
    editor.claims.release(aliceClaim, { id: "manager", type: "member" });
    expect(() => editor.claims.release(aliceClaim)).toThrowError(MilestoneDomainError);
    const nextAliceClaim = editor.claims.claim(alice);
    const result = editor.commit();
    expect(nextAliceClaim).not.toBe(aliceClaim);
    expect(result.milestone.claims).toHaveLength(3);
    expect(result.milestone.claims[0]).toMatchObject({ id: aliceClaim, state: "released", releasedBy: { id: "manager" } });
    expect(result.milestone.claims[1]).toMatchObject({ id: bobClaim, state: "active" });
    expect(result.events.map((event) => event.type)).toEqual(["claim.created", "claim.created", "claim.released", "claim.created"]);
    expect(result.events.map((event) => event.sequence)).toEqual([2, 3, 4, 5]);
    expect(result.milestone.sequence).toBe(5);
    expect(result.milestone.revisions).toEqual(context.milestone.revisions);
    expect(new MilestoneEditor(result.milestone, context.profile, context).evaluateAcceptance()).toEqual(beforeEvaluation);
    const doc = createMilestoneDocument({ milestone: result.milestone, profile: context.profile });
    expect(doc.getClaims().getActiveCount()).toBe(2);
    expect(doc.getClaims().getById(aliceClaim)?.state).toBe("released");
    expect(doc.getClaims().getAll()).toHaveLength(3);
    expect(deserializeMilestone(serializeMilestone(result.milestone)).claims).toEqual(result.milestone.claims);
  });

  it("rejects claims after completion while allowing a release, without invalidating lifecycle state", () => {
    const context = create({}, "claim-completion");
    const claimed = new MilestoneEditor(context.milestone, context.profile, context);
    const claimId = claimed.claims.claim({ id: "alice" });
    claimed.accept({ id: "acceptor" });
    claimed.complete({ id: "completer" });
    const completed = claimed.commit().milestone;
    const editor = new MilestoneEditor(completed, context.profile, context);
    expect(() => editor.claims.claim({ id: "bob" })).toThrowError(MilestoneDomainError);
    editor.claims.release(claimId);
    const result = editor.commit();
    expect(result.milestone.currentAcceptanceId).toBe(completed.currentAcceptanceId);
    expect(result.milestone.currentCompletionId).toBe(completed.currentCompletionId);
    expect(result.milestone.revisions).toEqual(completed.revisions);
  });

  it("restores claims, changes, and events across undo, redo, and failed transactions", () => {
    const context = create({}, "claim-history");
    const editor = new MilestoneEditor(context.milestone, context.profile, context);
    editor.transact("claims", () => {
      editor.claims.claim({ id: "alice" });
      editor.claims.claim({ id: "bob" });
    });
    expect(editor.history.length).toBe(2);
    expect(editor.history.undo()).toBe(true);
    expect(editor.claims.list()).toEqual([]);
    expect(editor.history.redo()).toBe(true);
    expect(editor.claims.list()).toHaveLength(2);
    expect(() => editor.transact("duplicate", () => {
      editor.claims.claim({ id: "charlie" });
      editor.claims.claim({ id: "alice" });
    })).toThrowError(MilestoneDomainError);
    const result = editor.commit();
    expect(result.milestone.claims).toHaveLength(2);
    expect(result.events).toHaveLength(2);
    expect(result.milestone.sequence).toBe(3);
  });

  it("validates malformed claim history and migrates 1.2 records without inventing claims", () => {
    const context = create({}, "claim-wire");
    const current = serializeMilestone(context.milestone);
    const { claims: _claims, ...old } = current;
    const migrated = migrateMilestoneWire({ ...old, schemaVersion: "1.2" });
    expect(migrated).toMatchObject({ fromVersion: "1.2", toVersion: "1.3", appliedMigrations: ["1.2-to-1.3"] });
    expect(migrated.wire.claims).toEqual([]);
    const editor = new MilestoneEditor(context.milestone, context.profile, context);
    editor.claims.claim({ id: "alice" });
    const milestone = editor.commit().milestone;
    expect(validateMilestone({ ...milestone, claims: [...milestone.claims, milestone.claims[0]!] }).map((issue) => issue.code)).toContain("duplicate_active_claim");
    expect(validateMilestone({ ...milestone, claims: [{ ...milestone.claims[0]!, milestoneId: "wrong" as typeof milestone.id }] }).map((issue) => issue.code)).toContain("claim_milestone_mismatch");
    expect(() => deserializeMilestone({ ...serializeMilestone(milestone), claims: [null] })).toThrowError(MilestoneDomainError);
    expect(() => deserializeMilestone({ ...serializeMilestone(milestone), claims: [{ ...milestone.claims[0]!, state: "released" }] })).toThrowError(MilestoneDomainError);
  });

  it("delegates claim and release authorization to the host before mutation", () => {
    const context = create({}, "claim-authorization");
    const actions: string[] = [];
    const editor = new MilestoneEditor(context.milestone, context.profile, {
      ...context,
      authorization: {
        canPerform(input) {
          actions.push(input.action);
          return input.action !== "claim.release";
        },
      },
    });
    const claimId = editor.claims.claim({ id: "alice" }, { id: "manager" });
    expect(() => editor.claims.release(claimId)).toThrowError(MilestoneDomainError);
    const result = editor.commit();
    expect(actions).toEqual(["claim.create", "claim.release"]);
    expect(result.milestone.claims[0]?.state).toBe("active");
    expect(result.milestone.claims[0]?.createdBy).toEqual({ id: "manager" });
    expect(result.events).toHaveLength(1);
  });
});
