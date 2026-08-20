import type {
  Breakdown,
  BreakdownDefinition,
  BreakdownId,
  MilestoneId,
  MilestoneProfile,
  MilestoneProfileRef,
} from "../model/domain.js";
import { assertValidBreakdown } from "../services/validation.js";
import { createMilestoneDocument } from "./builder.js";
import type { MilestoneDocument } from "./document.js";
import { createDefinitionDocument } from "./documents/index.js";
import type { MilestoneDefinitionDocument, TextDocument } from "./types.js";

export type MilestoneProfileResolver = (profileRef: MilestoneProfileRef) => MilestoneProfile;

export interface BreakdownDocumentContext {
  readonly breakdown: Breakdown;
  readonly profileResolver?: MilestoneProfileResolver;
}

export interface BreakdownDocumentBuildInput {
  readonly breakdown: Breakdown;
  readonly profileResolver?: MilestoneProfileResolver;
}

export interface BreakdownDefinitionDocument {
  getTitle(): string;
  getDescription(): TextDocument;
  getMetadata(): Readonly<Record<string, import("../model/domain.js").JsonValue>> | undefined;
  toObject(): BreakdownDefinition;
}

export class BreakdownDocument {
  readonly #context: BreakdownDocumentContext;
  #definition?: MilestoneDefinitionDocument;
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

  getSequence(): number {
    return this.#context.breakdown.sequence;
  }

  getCreatedAt(): string {
    return this.#context.breakdown.createdAt;
  }

  getUpdatedAt(): string | undefined {
    return this.#context.breakdown.updatedAt;
  }

  getDefinition(): MilestoneDefinitionDocument {
    return (this.#definition ??= createDefinitionDocument(this.#context.breakdown.definition));
  }

  getDescription(): TextDocument {
    return this.getDefinition().getDescription();
  }

  getMilestoneCount(): number {
    return this.#context.breakdown.milestones.length;
  }

  getMilestones(): readonly MilestoneDocument[] {
    if (this.#milestones !== undefined) return this.#milestones;
    if (this.#context.profileResolver === undefined) {
      throw new Error(
        "MilestoneProfileResolver is required to construct child MilestoneDocuments in a BreakdownDocument",
      );
    }
    this.#milestones = this.#context.breakdown.milestones.map((milestone) =>
      createMilestoneDocument({
        milestone,
        profile: this.#context.profileResolver!(milestone.profile),
      }),
    );
    return this.#milestones;
  }

  getMilestone(id: MilestoneId): MilestoneDocument | undefined {
    const milestone = this.#context.breakdown.milestones.find((m) => m.id === id);
    if (milestone === undefined) return undefined;
    if (this.#context.profileResolver === undefined) {
      throw new Error(
        "MilestoneProfileResolver is required to construct child MilestoneDocuments in a BreakdownDocument",
      );
    }
    return createMilestoneDocument({
      milestone,
      profile: this.#context.profileResolver(milestone.profile),
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
  };
}

export function createBreakdownDocument(input: BreakdownDocumentBuildInput): BreakdownDocument {
  return new BreakdownDocument(createBreakdownDocumentContext(input));
}

export class BreakdownDocumentBuilder {
  readonly #breakdown: Breakdown;
  #profileResolver?: MilestoneProfileResolver | undefined;

  constructor(breakdown: Breakdown) {
    this.#breakdown = breakdown;
  }

  withProfileResolver(resolver: MilestoneProfileResolver | undefined): this {
    this.#profileResolver = resolver;
    return this;
  }

  build(): BreakdownDocument {
    return createBreakdownDocument({
      breakdown: this.#breakdown,
      ...(this.#profileResolver === undefined ? {} : { profileResolver: this.#profileResolver }),
    });
  }
}
