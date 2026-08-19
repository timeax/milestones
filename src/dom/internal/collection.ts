import { invariant } from "../../model/errors.js";

import type {
    DocumentListOptions,
} from "../types.js";

/**
 * Applies the DOM's standard offset/limit semantics to an immutable
 * collection.
 *
 * An offset beyond the collection length simply produces an empty page.
 */
export function sliceCollection<T>(
    values: readonly T[],
    options: DocumentListOptions = {},
): readonly T[] {
    const offset = normalizeNonNegativeInteger(
        options.offset ?? 0,
        "offset",
    );

    const limit =
        options.limit === undefined
            ? undefined
            : normalizeNonNegativeInteger(
                options.limit,
                "limit",
            );

    if (offset >= values.length) {
        return [];
    }

    if (limit === undefined) {
        return values.slice(offset);
    }

    return values.slice(
        offset,
        offset + limit,
    );
}

/**
 * Validates a DOM paging number.
 */
export function normalizeNonNegativeInteger(
    value: number,
    name: string,
): number {
    if (!Number.isFinite(value)) {
        throw new RangeError(
            `${name} must be a finite number`,
        );
    }

    if (!Number.isInteger(value)) {
        throw new RangeError(
            `${name} must be an integer`,
        );
    }

    if (value < 0) {
        throw new RangeError(
            `${name} must be greater than or equal to 0`,
        );
    }

    return value;
}

/**
 * Builds an ID index while preserving the milestone package's normal
 * duplicate-ID error behavior.
 */
export function indexById<
    TId extends string,
    TValue,
>(
    values: readonly TValue[],
    getId: (value: TValue) => TId,
    label: string,
): ReadonlyMap<TId, TValue> {
    const map = new Map<TId, TValue>();

    for (const value of values) {
        const id = getId(value);

        invariant(
            !map.has(id),
            "DUPLICATE_ID",
            `Duplicate ${label} ${id}`,
            {
                id,
                kind: label,
            },
        );

        map.set(id, value);
    }

    return map;
}

/**
 * Standard helper for DocumentCollection.require().
 */
export function requireFromMap<
    TId extends string,
    TValue,
>(
    map: ReadonlyMap<TId, TValue>,
    id: TId,
    label: string,
): TValue {
    const value = map.get(id);

    invariant(
        value !== undefined,
        "NOT_FOUND",
        `${label} ${id} was not found`,
        {
            id,
            kind: label,
        },
    );

    return value;
}