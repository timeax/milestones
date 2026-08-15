import { describe, expect, it } from "vitest";
import * as root from "../src/index.js";
import * as evaluation from "../src/public/evaluation.js";
import * as graph from "../src/public/graph.js";
import * as model from "../src/public/model.js";
import * as migrations from "../src/public/migrations.js";
import * as serialization from "../src/public/serialization.js";
import * as testing from "../src/public/testing.js";
import * as validation from "../src/public/validation.js";

describe("public API", () => {
  it("keeps internal helpers out of the root surface", () => {
    expect(root).not.toHaveProperty("invariant");
    expect(root).not.toHaveProperty("graphNodeFromMilestone");
    expect(root).not.toHaveProperty("validateProfile");
    expect(root).not.toHaveProperty("validateRevisionSnapshot");
  });

  it("provides each documented source subpath", () => {
    expect(model.MilestoneDomainError).toBeTypeOf("function");
    expect(evaluation.evaluateAcceptance).toBeTypeOf("function");
    expect(graph.createGraphSnapshot).toBeTypeOf("function");
    expect(serialization.serializeMilestone).toBeTypeOf("function");
    expect(validation.validateMilestone).toBeTypeOf("function");
    expect(testing.FixedMilestoneClock).toBeTypeOf("function");
    expect(migrations.migrateMilestoneWire).toBeTypeOf("function");
  });
});
