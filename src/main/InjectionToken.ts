/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

/**
 * Typed token for identifying one dependency independently of its implementation class.
 *
 * @template Value - The resolved dependency type.
 */
export class InjectionToken<Value = unknown> {
    /** Type-only private property binding the token type in an invariant way to this token instance. */
    private declare readonly valueType: (value: Value) => Value;

    /** Optional human-readable description used in debug output. */
    readonly #description: string | null;

    /**
     * Creates a new injection token.
     *
     * @param description - Optional human-readable description used in debug output.
     */
    public constructor(description: string | null = null) {
        this.#description = description;
    }

    /**
     * Returns a compact debug representation of the token.
     *
     * @returns The debug string used in error messages and qualifier rendering.
     */
    public toString(): string {
        return this.#description == null ? "InjectionToken" : `InjectionToken(${this.#description})`;
    }
}
