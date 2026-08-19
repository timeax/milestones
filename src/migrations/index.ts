import type { Milestone, MilestoneWire } from "../model/domain.js";
import { MilestoneDomainError } from "../model/errors.js";
import { MILESTONE_PROTOCOL_VERSION } from "../model/protocol.js";
import { deserializeMilestone, serializeMilestone } from "../adapters/serialization.js";

export interface MilestoneMigrationResult {
  readonly fromVersion: string;
  readonly toVersion: typeof MILESTONE_PROTOCOL_VERSION;
  readonly appliedMigrations: readonly string[];
  readonly wire: MilestoneWire;
}

export function migrateMilestoneWire(value: unknown): MilestoneMigrationResult {
  const version = protocolVersion(value);
  if (version === MILESTONE_PROTOCOL_VERSION) {
    const wire = serializeMilestone(deserializeMilestone(value));
    return { fromVersion: version, toVersion: MILESTONE_PROTOCOL_VERSION, appliedMigrations: [], wire };
  }
  if (version !== "1.0" && version !== "1.1") {
    throw new MilestoneDomainError(
      "MIGRATION_UNSUPPORTED",
      `No milestone migration path exists from ${version} to ${MILESTONE_PROTOCOL_VERSION}`,
      { fromVersion: version, toVersion: MILESTONE_PROTOCOL_VERSION },
    );
  }
  const migrated = structuredClone(value) as Record<string, unknown>;
  const appliedMigrations: string[] = [];
  if (version === "1.0") {
    const challenges = migrated["challenges"];
    if (!Array.isArray(challenges)) throw new MilestoneDomainError("SERIALIZATION_INVALID", "Milestone 1.0 wire record has malformed challenges");
    migrated["challenges"] = challenges.map((challenge) => ({ ...(challenge as Record<string, unknown>), evidence: [] }));
    migrated["schemaVersion"] = "1.1";
    appliedMigrations.push("1.0-to-1.1");
  }
  migrateOneOneToOneTwo(migrated);
  migrated["schemaVersion"] = MILESTONE_PROTOCOL_VERSION;
  appliedMigrations.push("1.1-to-1.2");
  const wire = serializeMilestone(deserializeMilestone(migrated));
  return {
    fromVersion: version,
    toVersion: MILESTONE_PROTOCOL_VERSION,
    appliedMigrations,
    wire,
  };
}

function migrateOneOneToOneTwo(wire: Record<string, unknown>): void {
  wire["sourceLinks"] = [];
  forEachRecord(wire["criteria"], "criteria", (item) => { item["sourceLinks"] = []; });
  forEachRecord(wire["deliverables"], "deliverables", (item) => { item["sourceLinks"] = []; });
  forEachRecord(wire["revisions"], "revisions", (item) => { item["sourceLinks"] = []; const snapshot = record(item["snapshot"], "revision snapshot"); snapshot["sources"] = []; });
  forEachRecord(wire["challenges"], "challenges", (item) => { item["sourceLinks"] = []; if (item["resolution"] !== undefined) record(item["resolution"], "challenge resolution")["sourceSnapshot"] = []; });
  forEachRecord(wire["reviews"], "reviews", (item) => { item["sourceLinks"] = []; if (item["state"] === "completed") item["sourceSnapshot"] = []; });
  forEachRecord(wire["acceptanceRecords"], "acceptance records", (item) => { record(item["snapshot"], "acceptance snapshot")["sources"] = []; });
}
function forEachRecord(value: unknown, name: string, action: (item: Record<string, unknown>) => void): void { if (!Array.isArray(value)) throw new MilestoneDomainError("SERIALIZATION_INVALID", `Milestone 1.1 ${name} are malformed`); value.forEach((item) => action(record(item, name))); }
function record(value: unknown, name: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new MilestoneDomainError("SERIALIZATION_INVALID", `Milestone ${name} is malformed`); return value as Record<string, unknown>; }

export function migrateAndDeserializeMilestone(value: unknown): Milestone {
  return deserializeMilestone(migrateMilestoneWire(value).wire);
}

function protocolVersion(value: unknown): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MilestoneDomainError("SERIALIZATION_INVALID", "Milestone migration input must be a wire object");
  }
  const version = (value as Readonly<Record<string, unknown>>)["schemaVersion"];
  if (typeof version !== "string" || version.length === 0) {
    throw new MilestoneDomainError("SERIALIZATION_INVALID", "Milestone migration input has no schemaVersion");
  }
  return version;
}
