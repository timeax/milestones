import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MilestoneDomainError,
  migrateAndDeserializeMilestone,
  migrateMilestoneWire,
  serializeMilestoneJson,
} from "../src/index.js";

const fixtures = fileURLToPath(new URL("fixtures/", import.meta.url));

describe("milestone protocol migration routing", () => {
  it("migrates v1.0 deterministically to canonical v1.2", async () => {
    const value = JSON.parse(await readFile(`${fixtures}milestone-full-v1.json`, "utf8")) as unknown;
    const before = structuredClone(value);
    const first = migrateMilestoneWire(value);
    const second = migrateMilestoneWire(first.wire);
    expect(first).toMatchObject({ fromVersion: "1.0", toVersion: "1.2", appliedMigrations: ["1.0-to-1.1", "1.1-to-1.2"] });
    expect(second.wire).toEqual(first.wire);
    expect(value).toEqual(before);
    expect(first.wire.challenges.every((challenge) => Array.isArray(challenge.evidence))).toBe(true);
  });

  it("preserves stable IDs, historical ledgers, actors, and evidence", async () => {
    const completed = migrateAndDeserializeMilestone(JSON.parse(await readFile(`${fixtures}milestone-completed-v1.json`, "utf8")));
    expect(completed).toMatchObject({
      id: "fixture-completed",
      revisions: [{ id: "r1" }],
      acceptanceRecords: [{ id: "acceptance1" }],
      completionRecords: [{ id: "completion1", acceptanceId: "acceptance1" }],
    });
    const artifacts = migrateAndDeserializeMilestone(JSON.parse(await readFile(`${fixtures}milestone-artifacts-v1.json`, "utf8")));
    expect(artifacts.acceptanceRecords[0]?.snapshot.artifacts[0]).toMatchObject({
      artifactVersionId: "v1",
      submissionId: "submission1",
      verificationId: "verification1",
    });
    expect(serializeMilestoneJson(artifacts)).toContain("fixture-artifacts");
  });

  it.each(["0.9", "2.0"])("rejects unsupported protocol version %s", async (schemaVersion) => {
    const current = JSON.parse(await readFile(`${fixtures}milestone-minimal-v1.json`, "utf8")) as Record<string, unknown>;
    expect(() => migrateMilestoneWire({ ...current, schemaVersion })).toThrowError(MilestoneDomainError);
    try {
      migrateMilestoneWire({ ...current, schemaVersion });
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: "MIGRATION_UNSUPPORTED" });
    }
  });

  it("rejects non-object or versionless migration input", () => {
    expect(() => migrateMilestoneWire(null)).toThrowError(MilestoneDomainError);
    expect(() => migrateMilestoneWire({})).toThrowError(MilestoneDomainError);
  });
});
