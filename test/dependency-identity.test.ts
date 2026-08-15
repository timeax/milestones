import { describe, expect, it } from "vitest";
import {
  MilestoneDomainError,
  MilestoneEditor,
  asCriterionId,
  asDependencyId,
  asMilestoneId,
  createGraphSnapshot,
  validateGraph,
  validateMilestone,
  type MilestoneDependency,
  type MilestoneDependencyGate,
} from "../src/index.js";
import { dependencyIdentityKey } from "../src/services/dependency-identity.js";
import { create } from "./helpers.js";

function expectDuplicate(operation: () => unknown): void {
  try {
    operation();
    throw new Error("Expected duplicate dependency rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(MilestoneDomainError);
    expect((error as MilestoneDomainError).code).toBe("DUPLICATE_DEPENDENCY");
  }
}

describe("dependency semantic identity", () => {
  it("rejects reordered criterion and deliverable gates regardless of blocking", () => {
    const upstream = create({
      criteria: [{ title: "Criterion", required: false, state: "not_started" }],
      deliverables: [{ title: "Deliverable", required: false, state: "missing" }],
    }, "identity-upstream").milestone;
    const harness = create({}, "identity-downstream");
    const criterionId = upstream.criteria[0]!.id;
    const deliverableId = upstream.deliverables[0]!.id;
    const criterionGate: MilestoneDependencyGate = {
      type: "criterion",
      criterionId,
      requiredState: "verified",
    };
    const reorderedCriterionGate: MilestoneDependencyGate = {
      requiredState: "verified",
      criterionId,
      type: "criterion",
    };
    const deliverableGate: MilestoneDependencyGate = {
      type: "deliverable",
      deliverableRequirementId: deliverableId,
      requiredState: "satisfied",
    };
    const reorderedDeliverableGate: MilestoneDependencyGate = {
      requiredState: "satisfied",
      deliverableRequirementId: deliverableId,
      type: "deliverable",
    };

    const criterionEditor = new MilestoneEditor(
      harness.milestone,
      harness.profile,
      harness,
    );
    criterionEditor.dependencies.add(upstream.id, criterionGate, true);
    expectDuplicate(() => criterionEditor.dependencies.add(
      upstream.id,
      reorderedCriterionGate,
      false,
    ));

    const deliverableEditor = new MilestoneEditor(
      harness.milestone,
      harness.profile,
      harness,
    );
    deliverableEditor.dependencies.add(upstream.id, deliverableGate, false);
    expectDuplicate(() => deliverableEditor.dependencies.add(
      upstream.id,
      reorderedDeliverableGate,
      true,
    ));
  });

  it("rejects an update that collides semantically while allowing blocking updates", () => {
    const upstream = create({
      criteria: [{ title: "Criterion", required: false, state: "not_started" }],
    }, "identity-update-upstream").milestone;
    const harness = create({}, "identity-update-downstream");
    const editor = new MilestoneEditor(harness.milestone, harness.profile, harness);
    editor.dependencies.add(upstream.id, {
      type: "criterion",
      criterionId: upstream.criteria[0]!.id,
      requiredState: "verified",
    });
    const completedId = editor.dependencies.add(upstream.id, { type: "completed" });

    expectDuplicate(() => editor.dependencies.update(completedId, {
      gate: {
        requiredState: "verified",
        criterionId: upstream.criteria[0]!.id,
        type: "criterion",
      },
    }));
    editor.dependencies.update(completedId, { blocking: false }, { reason: "Advisory" });

    const result = editor.commit().milestone;
    expect(result.dependencies.find((item) => item.id === completedId)?.blocking).toBe(false);
  });

  it("reports reordered semantic duplicates in aggregate and graph validation", () => {
    const upstream = create({
      criteria: [{ title: "Criterion", required: false, state: "not_started" }],
      deliverables: [{ title: "Deliverable", required: false, state: "missing" }],
    }, "identity-validation-upstream").milestone;
    const downstream = create({}, "identity-validation-downstream").milestone;
    const criterionId = upstream.criteria[0]!.id;
    const deliverableId = upstream.deliverables[0]!.id;
    const dependencies: MilestoneDependency[] = [
      {
        id: asDependencyId("criterion-a"),
        milestoneId: downstream.id,
        dependsOnMilestoneId: upstream.id,
        gate: { type: "criterion", criterionId, requiredState: "verified" },
        blocking: true,
      },
      {
        id: asDependencyId("criterion-b"),
        milestoneId: downstream.id,
        dependsOnMilestoneId: upstream.id,
        gate: { requiredState: "verified", criterionId, type: "criterion" },
        blocking: false,
      },
      {
        id: asDependencyId("deliverable-a"),
        milestoneId: downstream.id,
        dependsOnMilestoneId: upstream.id,
        gate: {
          type: "deliverable",
          deliverableRequirementId: deliverableId,
          requiredState: "satisfied",
        },
        blocking: true,
      },
      {
        id: asDependencyId("deliverable-b"),
        milestoneId: downstream.id,
        dependsOnMilestoneId: upstream.id,
        gate: {
          requiredState: "satisfied",
          deliverableRequirementId: deliverableId,
          type: "deliverable",
        },
        blocking: false,
      },
    ];
    const corrupt = { ...downstream, dependencies };

    expect(validateMilestone(corrupt, create().profile).map((issue) => issue.code))
      .toContain("duplicate_dependency");
    expect(validateGraph(createGraphSnapshot([upstream, downstream], dependencies))
      .filter((issue) => issue.code === "duplicate_dependency")).toHaveLength(2);
  });

  it("keeps opaque IDs collision-safe in dependency identity", () => {
    const first = dependencyIdentityKey(asMilestoneId("a"), {
      type: "criterion",
      criterionId: asCriterionId("b|criterion:c"),
      requiredState: "verified",
    });
    const second = dependencyIdentityKey(asMilestoneId("a|criterion:b"), {
      type: "criterion",
      criterionId: asCriterionId("c"),
      requiredState: "verified",
    });

    expect(first).not.toBe(second);
  });
});
