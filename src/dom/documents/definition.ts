import type {JsonValue, MilestoneDefinition,} from "../../model/domain.js";

import type {MilestoneDefinitionDocument, TextDocument,} from "../types.js";

import {createTextDocument,} from "./text.js";

const EMPTY_METADATA: Readonly<Record<string, JsonValue>> =
    Object.freeze({});

/**
 * Read-only DOM representation of a milestone definition.
 *
 * The definition document exposes the current definition semantically without
 * exposing mutation behavior.
 *
 * Large narrative content such as the milestone description is represented
 * through TextDocument rather than being treated as ordinary inline data.
 */
export class MilestoneDefinitionDocumentImpl
    implements MilestoneDefinitionDocument {
    readonly #definition: MilestoneDefinition;
    readonly #description: TextDocument;

    constructor(definition: MilestoneDefinition) {
        this.#definition = definition;
        this.#description = createTextDocument(definition.description);
    }

    /**
     * Human-readable milestone title.
     */
    getTitle(): string {
        return this.#definition.title;
    }

    /**
     * Optional host-defined milestone key.
     *
     * This is separate from the milestone's canonical MilestoneId.
     */
    getKey(): string | undefined {
        return this.#definition.key;
    }

    /**
     * Returns the milestone's potentially large narrative description.
     *
     * Consumers can retrieve the whole value with getText(), request an excerpt,
     * or perform bounded reads.
     */
    getDescription(): TextDocument {
        return this.#description;
    }

    /**
     * Whether a description is present.
     *
     * An undefined or empty-string description is considered absent.
     */
    hasDescription(): boolean {
        return !this.#description.isEmpty();
    }

    /**
     * Returns definition metadata.
     *
     * Metadata remains host-defined. The milestone DOM exposes it without
     * attempting to interpret host-specific fields.
     */
    getMetadata(): Readonly<Record<string, JsonValue>> {
        return this.#definition.metadata ?? EMPTY_METADATA;
    }

    /**
     * Returns one metadata value by key.
     */
    getMetadataValue(key: string): JsonValue | undefined {
        return this.#definition.metadata?.[key];
    }

    /**
     * Determines whether the metadata record explicitly contains a key.
     *
     * This intentionally differs from:
     *
     *   getMetadataValue(key) !== undefined
     *
     * because membership should be based on the record itself rather than
     * truthiness or value interpretation.
     */
    hasMetadata(key: string): boolean {
        const metadata = this.#definition.metadata;

        if (metadata === undefined) {
            return false;
        }

        return Object.prototype.hasOwnProperty.call(metadata, key);
    }
}

/**
 * Creates a read-only DOM representation of a milestone definition.
 *
 * Other DOM nodes—particularly historical revision snapshots—can reuse this
 * factory without depending on the root MilestoneDocument implementation.
 */
export function createDefinitionDocument(
    definition: MilestoneDefinition,
): MilestoneDefinitionDocument {
    return new MilestoneDefinitionDocumentImpl(definition);
}