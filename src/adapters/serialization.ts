import type {
  Artifact,
  ArtifactId,
  ArtifactRequirement,
  ArtifactRequirementId,
  ArtifactSubmission,
  ArtifactSubmissionId,
  ArtifactVerification,
  ArtifactVerificationId,
  ArtifactVersion,
  ArtifactVersionId,
} from "@elqora/artifacts";
import { ARTIFACT_PROTOCOL_VERSION } from "@elqora/artifacts";
import type {
  Breakdown,
  BreakdownEvent,
  BreakdownWire,
  CriterionId,
  DeliverableRequirementId,
  Milestone,
  MilestoneArtifactContext,
  MilestoneArtifactLink,
  MilestoneDependency,
  MilestoneEvent,
  MilestoneGraphNode,
  MilestoneGraphSnapshot,
  MilestoneWire,
  Task,
  TaskArtifactLink,
  TaskDependency,
  TaskEvent,
  TaskWire,
} from "../model/domain.js";
import { MilestoneDomainError, invariant } from "../model/errors.js";
import {
  BREAKDOWN_PROTOCOL_VERSION,
  MILESTONE_PROTOCOL_VERSION,
  TASK_PROTOCOL_VERSION,
} from "../model/protocol.js";
import { assertValidBreakdown, assertValidMilestone, assertValidTask } from "../services/validation.js";
import type { TaskGraphNode, TaskGraphSnapshot } from "../services/task-graph.js";

export interface MilestoneGraphWire {
  readonly schemaVersion: "1.0";
  readonly milestones: readonly MilestoneGraphNodeWire[];
  readonly dependencies: readonly MilestoneDependency[];
}

export interface MilestoneGraphNodeWire extends Omit<MilestoneGraphNode, "gates"> {
  readonly gates: {
    readonly criteria: readonly [string, MilestoneGraphNode["gates"]["criteria"] extends ReadonlyMap<string, infer V> ? V : never][];
    readonly deliverables: readonly [string, MilestoneGraphNode["gates"]["deliverables"] extends ReadonlyMap<string, infer V> ? V : never][];
    readonly accepted: boolean;
    readonly completed: boolean;
  };
}

export interface TaskGraphWire {
  readonly schemaVersion: "1.0";
  readonly tasks: readonly TaskGraphNodeWire[];
  readonly dependencies: readonly TaskDependency[];
  readonly milestones?: readonly MilestoneGraphNodeWire[];
}

export interface TaskGraphNodeWire extends Omit<TaskGraphNode, "gates"> {
  readonly gates: {
    readonly criteria: readonly [string, TaskGraphNode["gates"]["criteria"] extends ReadonlyMap<string, infer V> ? V : never][];
    readonly deliverables: readonly [string, TaskGraphNode["gates"]["deliverables"] extends ReadonlyMap<string, infer V> ? V : never][];
    readonly accepted: boolean;
    readonly completed: boolean;
  };
}

export interface MilestoneArtifactContextWire {
  readonly schemaVersion: typeof ARTIFACT_PROTOCOL_VERSION;
  readonly requirements: readonly ArtifactRequirement[];
  readonly artifacts: readonly Artifact[];
  readonly versions: readonly ArtifactVersion[];
  readonly submissions: readonly ArtifactSubmission[];
  readonly verifications: readonly ArtifactVerification[];
  readonly links: readonly MilestoneArtifactLink[];
}

export interface TaskArtifactContextWire {
  readonly schemaVersion: typeof ARTIFACT_PROTOCOL_VERSION;
  readonly requirements: readonly ArtifactRequirement[];
  readonly artifacts: readonly Artifact[];
  readonly versions: readonly ArtifactVersion[];
  readonly submissions: readonly ArtifactSubmission[];
  readonly verifications: readonly ArtifactVerification[];
  readonly links: readonly TaskArtifactLink[];
}

/* -------------------------------------------------------------------------- */
/*                               Milestone                                    */
/* -------------------------------------------------------------------------- */

export function serializeMilestone(milestone: Milestone): MilestoneWire {
  assertSerializable(milestone);
  return { schemaVersion: MILESTONE_PROTOCOL_VERSION, ...structuredClone(milestone) };
}

export function deserializeMilestone(value: unknown): Milestone {
  invariant(
    isRecord(value) && value["schemaVersion"] === MILESTONE_PROTOCOL_VERSION,
    "SERIALIZATION_INVALID",
    "Unsupported or missing milestone schemaVersion",
  );
  const allowed = new Set([
    "schemaVersion",
    "id",
    "profile",
    "currentRevisionId",
    "revisions",
    "definition",
    "sourceLinks",
    "criteria",
    "deliverables",
    "dependencies",
    "challenges",
    "reviews",
    "approvalPolicy",
    "approvalRecords",
    "acceptanceRecords",
    "currentAcceptanceId",
    "completionRecords",
    "currentCompletionId",
    "sequence",
    "createdAt",
    "updatedAt",
  ]);
  invariant(
    Object.keys(value).every((key) => allowed.has(key)),
    "SERIALIZATION_INVALID",
    "Milestone wire record contains unknown top-level fields",
  );
  const { schemaVersion: _schemaVersion, ...milestone } = value;
  invariant(
    typeof milestone["id"] === "string" &&
      typeof milestone["currentRevisionId"] === "string" &&
      typeof milestone["sequence"] === "number" &&
      isRecord(milestone["profile"]) &&
      isRecord(milestone["definition"]) &&
      [
        "sourceLinks",
        "revisions",
        "criteria",
        "deliverables",
        "dependencies",
        "challenges",
        "reviews",
        "approvalRecords",
        "acceptanceRecords",
        "completionRecords",
      ].every((key) => Array.isArray(milestone[key])),
    "SERIALIZATION_INVALID",
    "Malformed milestone wire record",
  );
  assertValidMilestone(milestone as unknown as Milestone);
  return structuredClone(milestone) as unknown as Milestone;
}

export function serializeMilestoneJson(milestone: Milestone): string {
  return stableJson(serializeMilestone(milestone));
}

export function deserializeMilestoneJson(json: string): Milestone {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    throw new MilestoneDomainError("SERIALIZATION_INVALID", "Invalid milestone JSON", {
      cause: String(error),
    });
  }
  return deserializeMilestone(value);
}

export function serializeEvents(events: readonly MilestoneEvent[]): string {
  assertSerializable(events);
  return stableJson(events);
}

export function deserializeEvents(json: string): readonly MilestoneEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    throw new MilestoneDomainError("SERIALIZATION_INVALID", "Invalid event JSON", {
      cause: String(error),
    });
  }
  invariant(
    Array.isArray(parsed) &&
      parsed.every(
        (event) =>
          isRecord(event) &&
          typeof event["type"] === "string" &&
          typeof event["sequence"] === "number" &&
          isRecord(event["payload"]),
      ),
    "SERIALIZATION_INVALID",
    "Invalid milestone event array",
  );
  return parsed as unknown as readonly MilestoneEvent[];
}

export function serializeGraph(graph: MilestoneGraphSnapshot): MilestoneGraphWire {
  return {
    schemaVersion: "1.0",
    milestones: [...graph.milestones.values()].map((node) => ({
      id: node.id,
      revisionId: node.revisionId,
      gates: {
        criteria: [...node.gates.criteria.entries()],
        deliverables: [...node.gates.deliverables.entries()],
        accepted: node.gates.accepted,
        completed: node.gates.completed,
      },
    })),
    dependencies: structuredClone(graph.dependencies),
  };
}

export function deserializeGraph(wire: MilestoneGraphWire): MilestoneGraphSnapshot {
  invariant(wire.schemaVersion === "1.0", "SERIALIZATION_INVALID", "Unsupported graph schemaVersion");
  const nodes: MilestoneGraphNode[] = wire.milestones.map((node) => ({
    id: node.id,
    revisionId: node.revisionId,
    gates: {
      criteria: new Map(node.gates.criteria.map(([id, value]) => [id as CriterionId, value])),
      deliverables: new Map(
        node.gates.deliverables.map(([id, value]) => [id as DeliverableRequirementId, value]),
      ),
      accepted: node.gates.accepted,
      completed: node.gates.completed,
    },
  }));
  return {
    milestones: new Map(nodes.map((node) => [node.id, node])),
    dependencies: structuredClone(wire.dependencies),
  };
}

export function serializeArtifactContext(
  context: MilestoneArtifactContext,
): MilestoneArtifactContextWire {
  const wire = {
    schemaVersion: ARTIFACT_PROTOCOL_VERSION,
    requirements: [...context.requirements.values()],
    artifacts: [...context.artifacts.values()],
    versions: [...context.versions.values()],
    submissions: [...context.submissions.values()],
    verifications: [...context.verifications.values()],
    links: [...context.links],
  };
  assertSerializable(wire);
  return structuredClone(wire);
}

export function deserializeArtifactContext(
  wire: MilestoneArtifactContextWire,
): MilestoneArtifactContext {
  invariant(
    wire.schemaVersion === ARTIFACT_PROTOCOL_VERSION,
    "SERIALIZATION_INVALID",
    "Unsupported artifact context schemaVersion",
  );
  const records = [
    ...wire.requirements,
    ...wire.artifacts,
    ...wire.versions,
    ...wire.submissions,
    ...wire.verifications,
    ...wire.links,
  ];
  invariant(
    records.every((record) => record.schemaVersion === ARTIFACT_PROTOCOL_VERSION),
    "SERIALIZATION_INVALID",
    `Artifact context contains a record outside protocol ${ARTIFACT_PROTOCOL_VERSION}`,
  );
  return {
    requirements: keyed<ArtifactRequirementId, ArtifactRequirement>(wire.requirements),
    artifacts: keyed<ArtifactId, Artifact>(wire.artifacts),
    versions: keyed<ArtifactVersionId, ArtifactVersion>(wire.versions),
    submissions: keyed<ArtifactSubmissionId, ArtifactSubmission>(wire.submissions),
    verifications: keyed<ArtifactVerificationId, ArtifactVerification>(wire.verifications),
    links: structuredClone(wire.links),
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Task                                     */
/* -------------------------------------------------------------------------- */

export function serializeTask(task: Task): TaskWire {
  assertSerializable(task);
  return { schemaVersion: TASK_PROTOCOL_VERSION, ...structuredClone(task) };
}

export function deserializeTask(value: unknown): Task {
  invariant(
    isRecord(value) && value["schemaVersion"] === TASK_PROTOCOL_VERSION,
    "SERIALIZATION_INVALID",
    "Unsupported or missing task schemaVersion",
  );
  const allowed = new Set([
    "schemaVersion",
    "id",
    "profile",
    "scope",
    "currentRevisionId",
    "revisions",
    "definition",
    "sourceLinks",
    "criteria",
    "deliverables",
    "dependencies",
    "challenges",
    "reviews",
    "approvalPolicy",
    "approvalRecords",
    "acceptanceRecords",
    "currentAcceptanceId",
    "completionRecords",
    "currentCompletionId",
    "timing",
    "reminders",
    "sequence",
    "createdAt",
    "updatedAt",
  ]);
  invariant(
    Object.keys(value).every((key) => allowed.has(key)),
    "SERIALIZATION_INVALID",
    "Task wire record contains unknown top-level fields",
  );
  const { schemaVersion: _schemaVersion, ...task } = value;
  invariant(
    typeof task["id"] === "string" &&
      typeof task["currentRevisionId"] === "string" &&
      typeof task["sequence"] === "number" &&
      isRecord(task["profile"]) &&
      isRecord(task["scope"]) &&
      isRecord(task["definition"]) &&
      [
        "sourceLinks",
        "revisions",
        "criteria",
        "deliverables",
        "dependencies",
        "challenges",
        "reviews",
        "approvalRecords",
        "acceptanceRecords",
        "completionRecords",
        "reminders",
      ].every((key) => Array.isArray(task[key])),
    "SERIALIZATION_INVALID",
    "Malformed task wire record",
  );
  assertValidTask(task as unknown as Task);
  return structuredClone(task) as unknown as Task;
}

export function serializeTaskJson(task: Task): string {
  return stableJson(serializeTask(task));
}

export function deserializeTaskJson(json: string): Task {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    throw new MilestoneDomainError("SERIALIZATION_INVALID", "Invalid task JSON", {
      cause: String(error),
    });
  }
  return deserializeTask(value);
}

export function serializeTaskEvents(events: readonly TaskEvent[]): string {
  assertSerializable(events);
  return stableJson(events);
}

export function deserializeTaskEvents(json: string): readonly TaskEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    throw new MilestoneDomainError("SERIALIZATION_INVALID", "Invalid event JSON", {
      cause: String(error),
    });
  }
  invariant(
    Array.isArray(parsed) &&
      parsed.every(
        (event) =>
          isRecord(event) &&
          typeof event["type"] === "string" &&
          typeof event["sequence"] === "number" &&
          isRecord(event["payload"]),
      ),
    "SERIALIZATION_INVALID",
    "Invalid task event array",
  );
  return parsed as unknown as readonly TaskEvent[];
}

export function serializeTaskGraph(graph: TaskGraphSnapshot): TaskGraphWire {
  return {
    schemaVersion: "1.0",
    tasks: [...graph.tasks.values()].map((node) => ({
      id: node.id,
      revisionId: node.revisionId,
      gates: {
        criteria: [...node.gates.criteria.entries()],
        deliverables: [...node.gates.deliverables.entries()],
        accepted: node.gates.accepted,
        completed: node.gates.completed,
      },
    })),
    dependencies: structuredClone(graph.dependencies),
    ...(graph.milestones === undefined
      ? {}
      : {
          milestones: [...graph.milestones.values()].map((node) => ({
            id: node.id,
            revisionId: node.revisionId,
            gates: {
              criteria: [...node.gates.criteria.entries()],
              deliverables: [...node.gates.deliverables.entries()],
              accepted: node.gates.accepted,
              completed: node.gates.completed,
            },
          })),
        }),
  };
}

export function deserializeTaskGraph(wire: TaskGraphWire): TaskGraphSnapshot {
  invariant(wire.schemaVersion === "1.0", "SERIALIZATION_INVALID", "Unsupported task graph schemaVersion");
  const taskNodes: TaskGraphNode[] = wire.tasks.map((node) => ({
    id: node.id,
    revisionId: node.revisionId,
    gates: {
      criteria: new Map(node.gates.criteria.map(([id, value]) => [id as CriterionId, value])),
      deliverables: new Map(
        node.gates.deliverables.map(([id, value]) => [id as DeliverableRequirementId, value]),
      ),
      accepted: node.gates.accepted,
      completed: node.gates.completed,
    },
  }));
  const milestoneNodes: MilestoneGraphNode[] | undefined = wire.milestones?.map((node) => ({
    id: node.id,
    revisionId: node.revisionId,
    gates: {
      criteria: new Map(node.gates.criteria.map(([id, value]) => [id as CriterionId, value])),
      deliverables: new Map(
        node.gates.deliverables.map(([id, value]) => [id as DeliverableRequirementId, value]),
      ),
      accepted: node.gates.accepted,
      completed: node.gates.completed,
    },
  }));
  return {
    tasks: new Map(taskNodes.map((node) => [node.id, node])),
    ...(milestoneNodes === undefined
      ? {}
      : { milestones: new Map(milestoneNodes.map((node) => [node.id, node])) }),
    dependencies: structuredClone(wire.dependencies),
  };
}

/* -------------------------------------------------------------------------- */
/*                                 Breakdown                                  */
/* -------------------------------------------------------------------------- */

export function serializeBreakdown(breakdown: Breakdown): BreakdownWire {
  assertSerializable(breakdown);
  return {
    schemaVersion: BREAKDOWN_PROTOCOL_VERSION,
    ...structuredClone(breakdown),
    milestones: breakdown.milestones.map((m) => serializeMilestone(m)),
  };
}

export function deserializeBreakdown(value: unknown): Breakdown {
  invariant(
    isRecord(value) && value["schemaVersion"] === BREAKDOWN_PROTOCOL_VERSION,
    "SERIALIZATION_INVALID",
    "Unsupported or missing breakdown schemaVersion",
  );
  const allowed = new Set([
    "schemaVersion",
    "id",
    "parentMilestoneId",
    "owner",
    "definition",
    "milestones",
    "sequence",
    "createdAt",
    "updatedAt",
  ]);
  invariant(
    Object.keys(value).every((key) => allowed.has(key)),
    "SERIALIZATION_INVALID",
    "Breakdown wire record contains unknown top-level fields",
  );
  const { schemaVersion: _schemaVersion, ...breakdown } = value;
  invariant(
    typeof breakdown["id"] === "string" &&
      typeof breakdown["parentMilestoneId"] === "string" &&
      typeof breakdown["sequence"] === "number" &&
      isRecord(breakdown["definition"]) &&
      Array.isArray(breakdown["milestones"]),
    "SERIALIZATION_INVALID",
    "Malformed breakdown wire record",
  );
  const milestones = (breakdown["milestones"] as unknown[]).map((m) => deserializeMilestone(m));
  const result = {
    ...breakdown,
    milestones,
  } as unknown as Breakdown;
  assertValidBreakdown(result);
  return structuredClone(result);
}

export function serializeBreakdownJson(breakdown: Breakdown): string {
  return stableJson(serializeBreakdown(breakdown));
}

export function deserializeBreakdownJson(json: string): Breakdown {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    throw new MilestoneDomainError("SERIALIZATION_INVALID", "Invalid breakdown JSON", {
      cause: String(error),
    });
  }
  return deserializeBreakdown(value);
}

export function serializeBreakdownEvents(events: readonly BreakdownEvent[]): string {
  assertSerializable(events);
  return stableJson(events);
}

export function deserializeBreakdownEvents(json: string): readonly BreakdownEvent[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    throw new MilestoneDomainError("SERIALIZATION_INVALID", "Invalid event JSON", {
      cause: String(error),
    });
  }
  invariant(
    Array.isArray(parsed) &&
      parsed.every(
        (event) =>
          isRecord(event) &&
          typeof event["type"] === "string" &&
          typeof event["sequence"] === "number" &&
          isRecord(event["payload"]),
      ),
    "SERIALIZATION_INVALID",
    "Invalid breakdown event array",
  );
  return parsed as unknown as readonly BreakdownEvent[];
}

/* -------------------------------------------------------------------------- */
/*                                Helpers                                     */
/* -------------------------------------------------------------------------- */

function keyed<K extends string, V extends { readonly id: K }>(
  records: readonly V[],
): ReadonlyMap<K, V> {
  invariant(
    records.every((record) => record.id.length > 0) &&
      new Set(records.map((record) => record.id)).size === records.length,
    "SERIALIZATION_INVALID",
    "Artifact context record IDs must be non-empty and unique per record type",
  );
  return new Map(records.map((record) => [record.id, structuredClone(record)]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertSerializable(value: unknown): void {
  const active = new WeakSet();
  const visit = (item: unknown, path: string): void => {
    if (item === null || typeof item === "string" || typeof item === "boolean") return;
    if (typeof item === "number") {
      invariant(Number.isFinite(item), "SERIALIZATION_INVALID", `Non-finite number at ${path}`);
      return;
    }
    invariant(typeof item === "object", "SERIALIZATION_INVALID", `Non-JSON value at ${path}`);
    invariant(!active.has(item), "SERIALIZATION_INVALID", `Cyclic value at ${path}`);
    active.add(item);
    if (Array.isArray(item)) item.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    else for (const [key, entry] of Object.entries(item)) visit(entry, `${path}.${key}`);
    active.delete(item);
  };
  try {
    visit(value, "$");
    JSON.stringify(value);
  } catch (error) {
    if (error instanceof MilestoneDomainError) throw error;
    throw new MilestoneDomainError("SERIALIZATION_INVALID", "Value is not JSON serializable", {
      cause: String(error),
    });
  }
}

function stableJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (isRecord(item))
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, normalize(item[key])]),
      );
    return item;
  };
  return JSON.stringify(normalize(value));
}
