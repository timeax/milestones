import type {TextChunk, TextDocument, TextExcerptOptions, TextReadOptions,} from "../types.js";

const DEFAULT_EXCERPT_LIMIT = 240;

/**
 * Immutable DOM wrapper around potentially large textual content.
 *
 * TextDocumentImpl intentionally works with character offsets rather than
 * lines, tokens, bytes, or storage-specific chunks.
 *
 * The DOM must not care whether the underlying text originally came from:
 *
 * - an inline domain field,
 * - a JSON document,
 * - a Markdown file,
 * - SQLite,
 * - another Project Manager document,
 * - or any future storage representation.
 *
 * Storage-specific reading/chunking belongs outside this implementation.
 */
export class TextDocumentImpl implements TextDocument {
    readonly #text: string;

    constructor(text?: string | null) {
        this.#text = text ?? "";
    }

    /**
     * Returns true when this document contains no characters.
     */
    isEmpty(): boolean {
        return this.#text.length === 0;
    }

    /**
     * Returns the complete character length of the document.
     */
    getLength(): number {
        return this.#text.length;
    }

    /**
     * Returns the complete document text.
     *
     * Consumers such as CLI or AI integrations should prefer read() when the
     * content may be large and the entire value is not explicitly required.
     */
    getText(): string {
        return this.#text;
    }

    /**
     * Returns a compact preview of the document.
     *
     * When truncation is required, the returned value ends with an ellipsis
     * while remaining within the requested limit.
     */
    getExcerpt(options: TextExcerptOptions = {}): string {
        const limit = normalizeNonNegativeInteger(
            options.limit ?? DEFAULT_EXCERPT_LIMIT,
            "limit",
        );

        if (limit === 0 || this.#text.length === 0) {
            return "";
        }

        if (this.#text.length <= limit) {
            return this.#text;
        }

        if (limit === 1) {
            return "…";
        }

        return `${this.#text.slice(0, limit - 1)}…`;
    }

    /**
     * Reads a bounded portion of the document.
     *
     * Offsets are zero-based.
     *
     * Examples:
     *
     *   read()
     *   → entire document
     *
     *   read({ limit: 4000 })
     *   → first 4000 characters
     *
     *   read({ offset: 4000, limit: 4000 })
     *   → next 4000 characters
     *
     * An offset equal to the document length is valid and returns an empty
     * terminal chunk.
     *
     * An offset greater than the document length is invalid.
     */
    read(options: TextReadOptions = {}): TextChunk {
        const totalLength = this.#text.length;

        const offset = normalizeNonNegativeInteger(
            options.offset ?? 0,
            "offset",
        );

        if (offset > totalLength) {
            throw new RangeError(
                `Text read offset ${offset} exceeds document length ${totalLength}`,
            );
        }

        const requestedLimit =
            options.limit === undefined
                ? undefined
                : normalizeNonNegativeInteger(options.limit, "limit");

        const end =
            requestedLimit === undefined
                ? totalLength
                : Math.min(offset + requestedLimit, totalLength);

        const text = this.#text.slice(offset, end);
        const length = end - offset;

        const hasPrevious = offset > 0;
        const hasMore = end < totalLength;

        return {
            text,
            offset,
            end,
            length,
            totalLength,
            hasPrevious,
            hasMore,

            ...(hasPrevious
                ? {
                    previousOffset: calculatePreviousOffset(
                        offset,
                        requestedLimit,
                    ),
                }
                : {}),

            ...(hasMore
                ? {
                    nextOffset: end,
                }
                : {}),
        };
    }
}

/**
 * Convenience constructor used by other DOM implementations.
 *
 * Keeping text construction behind this helper prevents child Documents from
 * repeatedly handling optional domain strings themselves.
 */
export function createTextDocument(
    text?: string | null,
): TextDocument {
    return new TextDocumentImpl(text);
}

function normalizeNonNegativeInteger(
    value: number,
    name: string,
): number {
    if (!Number.isFinite(value)) {
        throw new RangeError(`${name} must be a finite number`);
    }

    if (!Number.isInteger(value)) {
        throw new RangeError(`${name} must be an integer`);
    }

    if (value < 0) {
        throw new RangeError(`${name} must be greater than or equal to 0`);
    }

    return value;
}

function calculatePreviousOffset(
    offset: number,
    limit: number | undefined,
): number {
    if (limit === undefined || limit === 0) {
        return 0;
    }

    return Math.max(0, offset - limit);
}