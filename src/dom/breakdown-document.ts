import type {
  Breakdown,
  BreakdownDefinition,
  BreakdownId,
  ActorRef,
  JsonValue,
  MilestoneArtifactContext,
  MilestoneGraphSnapshot,
  MilestoneId,
  MilestoneProfile,
  MilestoneProfileRef,
} from "../model/domain.js";
import { assertValidBreakdown } from "../services/validation.js";
import { invariant } from "../model/errors.js";
import { createMilestoneDocument } from "./builder.js";
import type { MilestoneDocument } from "./document.js";
import { createTextDocument } from "./documents/text.js";
import type { TextDocument } from "./types.js";

export type MilestoneProfileResolver = (profileRef: MilestoneProfileRef) => MilestoneProfile;
export type MilestoneGraphResolver = (milestoneId: MilestoneId) => MilestoneGraphSnapshot | undefined;
export type MilestoneArtifactContextResolver = (milestoneId: MilestoneId) => MilestoneArtifactContext | undefined;

export interface BreakdownDocumentContext {
  readonly breakdown: Breakdown;
  readonly profileResolver?: MilestoneProfileResolver;
  readonly graphResolver?: MilestoneGraphResolver;
  readonly artifactContextResolver?: MilestoneArtifactContextResolver;
}

export interface BreakdownDocumentBuildInput {
  readonly breakdown: Breakdown;
  readonly profileResolver?: MilestoneProfileResolver;
  readonly graphResolver?: MilestoneGraphResolver;
  readonly artifactContextResolver?: MilestoneArtifactContextResolver;
}

export interface BreakdownDefinitionDocument {
  getTitle(): string;
  getDescription(): TextDocument;
  getMetadata(): Readonly<Record<string, JsonValue>> | undefined;
  toObject(): BreakdownDefinition;
}

export interface BreakdownReadinessDocument {
  hasRunnableWork(): boolean | undefined;
  isFullyEvaluated(): boolean;
  /** @deprecated Use isFullyEvaluated(). */
  canEvaluate(): boolean;
  /** @deprecated Use hasRunnableWork(). */
  isReady(): boolean | undefined;
  getIncompleteCount(): number;
  getReadyCount(): number;
  getBlockedCount(): number;
  getUnknownCount(): number;
  getReadyMilestoneIds(): readonly MilestoneId[];
  getBlockedMilestoneIds(): readonly MilestoneId[];
  getUnknownMilestoneIds(): readonly MilestoneId[];
}

class BreakdownDefinitionDocumentImpl implements BreakdownDefinitionDocument {
  readonly #description: TextDocument;

  constructor(private readonly value: BreakdownDefinition) {
    this.#description = createTextDocument(value.description);
  }

  getTitle(): string { return this.value.title; }
  getDescription(): TextDocument { return this.#description; }
  getMetadata(): Readonly<Record<string, JsonValue>> | undefined { return structuredClone(this.value.metadata); }
  toObject(): BreakdownDefinition { return structuredClone(this.value); }
}

export class BreakdownDocument {
  readonly #context: BreakdownDocumentContext;
  #definition?: BreakdownDefinitionDocument;
  #milestones?: readonly MilestoneDocument[];

  constructor(context: BreakdownDocumentContext) {
    this.#context = context;
  }

  getId(): BreakdownId {
    return this.#context.breakdown.id;
  }

  getParentMilestoneId(): MilestoneId {
    return this.#context.breakdown.parentMilestoneId;
  }

  getOwner(): ActorRef | undefined {
    return this.#context.breakdown.owner === undefined
      ? undefined
      : structuredClone(this.#context.breakdown.owner);
  }

  getSequence(): number {
    return this.#context.breakdown.sequence;
  }

  getCreatedAt(): string {
    return this.#context.breakdown.createdAt;
  }

  getUpdatedAt(): string | undefined {
    return this.#context.breakdown.updatedAt;
  }

  getDefinition(): BreakdownDefinitionDocument {
    return (this.#definition ??= new BreakdownDefinitionDocumentImpl(this.#context.breakdown.definition));
  }

  getDescription(): TextDocument {
    return this.getDefinition().getDescription();
  }

  getMilestoneCount(): number {
    return this.#context.breakdown.milestones.length;
  }

  getProgress(): { getCompletedCount(): number; getAcceptedCount(): number; getTotalCount(): number; getPercentage(): number } {
    const children = this.#context.breakdown.milestones;
    const completed = children.filter((item) => item.currentCompletionId !== undefined).length;
    const accepted = children.filter((item) => item.currentAcceptanceId !== undefined).length;
    return {
      getCompletedCount: () => completed,
      getAcceptedCount: () => accepted,
      getTotalCount: () => children.length,
      getPercentage: () => children.length === 0 ? 100 : (completed / children.length) * 100,
    };
  }

  getReadiness(): BreakdownReadinessDocument {
    const incomplete = this.#context.breakdown.milestones.filter((item) => item.currentCompletionId === undefined);
    const ready: MilestoneId[] = [];
    const blocked: MilestoneId[] = [];
    const unknown: MilestoneId[] = [];
    for (const milestone of incomplete) {
      if (this.#context.profileResolver === undefined) {
        unknown.push(milestone.id);
        continue;
      }
      const readiness = this.#createChild(milestone).getReadiness().isReady();
      if (readiness === true) ready.push(milestone.id);
      else if (readiness === false) blocked.push(milestone.id);
      else unknown.push(milestone.id);
    }
    const fullyEvaluated = unknown.length === 0;
    const hasRunnableWork = ready.length > 0 ? true : unknown.length > 0 ? undefined : false;
    return {
      hasRunnableWork: () => hasRunnableWork,
      isFullyEvaluated: () => fullyEvaluated,
      canEvaluate: () => fullyEvaluated,
      isReady: () => hasRunnableWork,
      getIncompleteCount: () => incomplete.length,
      getReadyCount: () => ready.length,
      getBlockedCount: () => blocked.length,
      getUnknownCount: () => unknown.length,
      getReadyMilestoneIds: () => structuredClone(ready),
      getBlockedMilestoneIds: () => structuredClone(blocked),
      getUnknownMilestoneIds: () => structuredClone(unknown),
    };
  }

  getMilestones(): readonly MilestoneDocument[] {
    if (this.#milestones !== undefined) return this.#milestones;
    if (this.#context.profileResolver === undefined) {
      invariant(false, "INVALID_ARGUMENT", "MilestoneProfileResolver is required to construct child MilestoneDocuments in a BreakdownDocument");
    }
    this.#milestones = this.#context.breakdown.milestones.map((milestone) =>
      this.#createChild(milestone),
    );
    return this.#milestones;
  }

  getMilestone(id: MilestoneId): MilestoneDocument | undefined {
    const milestone = this.#context.breakdown.milestones.find((m) => m.id === id);
    if (milestone === undefined) return undefined;
    if (this.#context.profileResolver === undefined) {
      invariant(false, "INVALID_ARGUMENT", "MilestoneProfileResolver is required to construct child MilestoneDocuments in a BreakdownDocument");
    }
    return this.#createChild(milestone);
  }

  #createChild(milestone: Breakdown["milestones"][number]): MilestoneDocument {
    invariant(this.#context.profileResolver !== undefined, "INVALID_ARGUMENT", "MilestoneProfileResolver is required to construct child MilestoneDocuments in a BreakdownDocument");
    const graph = this.#context.graphResolver?.(milestone.id);
    const artifacts = this.#context.artifactContextResolver?.(milestone.id);
    return createMilestoneDocument({
      milestone,
      profile: this.#context.profileResolver(milestone.profile),
      ...(graph === undefined ? {} : { graph }),
      ...(artifacts === undefined ? {} : { artifacts }),
    });
  }

  toObject(): Breakdown {
    return structuredClone(this.#context.breakdown);
  }
}

export function createBreakdownDocumentContext(
  input: BreakdownDocumentBuildInput,
): BreakdownDocumentContext {
  assertValidBreakdown(input.breakdown);
  return {
    breakdown: input.breakdown,
    ...(input.profileResolver === undefined ? {} : { profileResolver: input.profileResolver }),
    ...(input.graphResolver === undefined ? {} : { graphResolver: input.graphResolver }),
    ...(input.artifactContextResolver === undefined ? {} : { artifactContextResolver: input.artifactContextResolver }),
  };
}

export function createBreakdownDocument(input: BreakdownDocumentBuildInput): BreakdownDocument {
  return new BreakdownDocument(createBreakdownDocumentContext(input));
}

export class BreakdownDocumentBuilder {
  readonly #breakdown: Breakdown;
  #profileResolver?: MilestoneProfileResolver | undefined;
  #graphResolver?: MilestoneGraphResolver | undefined;
  #artifactContextResolver?: MilestoneArtifactContextResolver | undefined;

  constructor(breakdown: Breakdown) {
    this.#breakdown = breakdown;
  }

  withProfileResolver(resolver: MilestoneProfileResolver | undefined): this {
    this.#profileResolver = resolver;
    return this;
  }

  withGraphResolver(resolver: MilestoneGraphResolver | undefined): this { this.#graphResolver = resolver; return this; }
  withArtifactContextResolver(resolver: MilestoneArtifactContextResolver | undefined): this { this.#artifactContextResolver = resolver; return this; }

  build(): BreakdownDocument {
    return createBreakdownDocument({
      breakdown: this.#breakdown,
      ...(this.#profileResolver === undefined ? {} : { profileResolver: this.#profileResolver }),
      ...(this.#graphResolver === undefined ? {} : { graphResolver: this.#graphResolver }),
      ...(this.#artifactContextResolver === undefined ? {} : { artifactContextResolver: this.#artifactContextResolver }),
    });
  }
}
