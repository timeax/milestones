import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MILESTONE_PROTOCOL_VERSION,
  MilestoneDomainError,
  deriveMilestoneState,
  deserializeMilestone,
  deserializeMilestoneJson,
  migrateAndDeserializeMilestone,
  serializeMilestone,
  serializeMilestoneJson,
} from "../src/index.js";

const fixtureNames = ["minimal", "full", "accepted", "completed", "reopened", "artifacts"] as const;
const fixtureDirectory = fileURLToPath(new URL("fixtures/", import.meta.url));

async function fixture(name: typeof fixtureNames[number]): Promise<string> {
  return readFile(`${fixtureDirectory}milestone-${name}-v1.json`, "utf8");
}

describe("milestone serialization protocol", () => {
  it("declares protocol v1.2 independently", () => {
    expect(MILESTONE_PROTOCOL_VERSION).toBe("1.2");
  });

  it.each(fixtureNames)("hydrates and canonically round-trips the %s v1 fixture", async (name) => {
    const json = await fixture(name);
    const milestone = migrateAndDeserializeMilestone(JSON.parse(json));
    const first = serializeMilestoneJson(milestone);
    const second = serializeMilestoneJson(deserializeMilestoneJson(first));
    expect(second).toBe(first);
    expect(JSON.parse(first)).toMatchObject({ schemaVersion: "1.2" });
    expect(serializeMilestone(milestone).schemaVersion).toBe("1.2");
  });

  it("retains the lifecycle meaning of compatibility fixtures", async () => {
    expect(deriveMilestoneState(migrateAndDeserializeMilestone(JSON.parse(await fixture("minimal"))))).toBe("open");
    expect(deriveMilestoneState(migrateAndDeserializeMilestone(JSON.parse(await fixture("accepted"))))).toBe("accepted");
    expect(deriveMilestoneState(migrateAndDeserializeMilestone(JSON.parse(await fixture("completed"))))).toBe("completed");
    const reopened = migrateAndDeserializeMilestone(JSON.parse(await fixture("reopened")));
    expect(deriveMilestoneState(reopened)).toBe("open");
    expect(reopened.acceptanceRecords).toHaveLength(1);
    expect(reopened.completionRecords).toHaveLength(1);
  });

  it("rejects invalid JSON, future versions, unknown fields, and invalid discriminators", async () => {
    expect(() => deserializeMilestoneJson("not json")).toThrowError(MilestoneDomainError);
    const minimal = JSON.parse(await fixture("minimal")) as Record<string, unknown>;
    expect(() => deserializeMilestone({ ...minimal, schemaVersion: "2.0" })).toThrowError(MilestoneDomainError);
    expect(() => deserializeMilestone({ ...minimal, futureField: true })).toThrowError(MilestoneDomainError);
    const full = JSON.parse(await fixture("full")) as { criteria: Record<string, unknown>[] } & Record<string, unknown>;
    full.criteria[0]!["state"] = "invented";
    expect(() => deserializeMilestone(full)).toThrowError(MilestoneDomainError);
  });

  it("canonicalizes object-key insertion while preserving array order", async () => {
    const milestone = migrateAndDeserializeMilestone(JSON.parse(await fixture("minimal")));
    const left = { ...milestone, definition: { ...milestone.definition, metadata: { z: 1, a: 2 } } };
    const right = { ...milestone, definition: { ...milestone.definition, metadata: { a: 2, z: 1 } } };
    expect(serializeMilestoneJson(left)).toBe(serializeMilestoneJson(right));
  });
});
