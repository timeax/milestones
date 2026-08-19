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
 * Builds an index by any key (string or number) while preserving the milestone package's normal
 * duplicate-ID error behavior.
 */
export function indexByUniqueKey<
    TKey,
    TValue,
>(
    values: readonly TValue[],
    getKey: (value: TValue) => TKey,
    label: string,
): ReadonlyMap<TKey, TValue> {
    const map = new Map<TKey, TValue>();

    for (const value of values) {
        const key = getKey(value);

        invariant(
            !map.has(key),
            "DUPLICATE_ID",
            `Duplicate ${label} ${String(key)}`,
            {
                id: String(key),
                kind: label,
            },
        );

        map.set(key, value);
    }

    return map;
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
    return indexByUniqueKey(values, getId, label);
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