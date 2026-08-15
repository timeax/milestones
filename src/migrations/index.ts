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

/**
 * Routes serialized data to the current protocol. Protocol 1.0 currently needs
 * validation/normalization only; real transforms are added here when a later
 * protocol is defined.
 */
export function migrateMilestoneWire(value: unknown): MilestoneMigrationResult {
  const version = protocolVersion(value);
  if (version !== MILESTONE_PROTOCOL_VERSION) {
    throw new MilestoneDomainError(
      "MIGRATION_UNSUPPORTED",
      `No milestone migration path exists from ${version} to ${MILESTONE_PROTOCOL_VERSION}`,
      { fromVersion: version, toVersion: MILESTONE_PROTOCOL_VERSION },
    );
  }
  const wire = serializeMilestone(deserializeMilestone(value));
  return {
    fromVersion: version,
    toVersion: MILESTONE_PROTOCOL_VERSION,
    appliedMigrations: [],
    wire,
  };
}

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
