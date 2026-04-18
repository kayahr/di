/*
 * Copyright (C) 2025 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import type { InjectionToken } from "./InjectionToken.ts";
import type { Class } from "./types.ts";

/**
 * Type of a dependency qualifier. Either a class or an injection token.
 *
 * @template Value - The resolved dependency value type.
 */
export type Qualifier<Value = any> = Class<Value> | InjectionToken<Value>;

/**
 * Internal qualifier type used by the registry and resolver.
 *
 * This extends the public {@link Qualifier} with the raw function qualifier used by {@link Injector.setFunction}.
 *
 * @template Value - The resolved dependency value type.
 * @template Type  - The raw registration type of the injectable itself.
 */
export type DependencyQualifier<Value = any, Type extends Function = Class<Value>> = Type | Qualifier<Value>;

/** Internal fully-erased dependency qualifier type used by heterogeneous resolver and registry internals. */
export type AnyDependencyQualifier = DependencyQualifier<any, any>;

/**
 * Maps constructor/factory parameter types to qualifiers.
 *
 * @template Params - The constructor/factory parameter types to map.
 */
export type Qualifiers<Params extends unknown[] = unknown[]> = NoInfer<{ [ K in keyof Params ]: Qualifier<Params[K]> }>;

/**
 * Type of a nullable dependency qualifier. Either a normal qualifier or null. Used for function injection where `null` defines a pass-through
 * parameter.
 *
 * @template Value - The resolved dependency value type.
 */
export type NullableQualifier<Value = any> = Qualifier<Value> | null;

/**
 * Maps function parameter types to nullable qualifiers. Used for function injection where `null` defines a pass-through parameter.
 *
 * @template Params - The function parameter types to map.
 */
export type NullableQualifiers<Params extends unknown[] = unknown[]> =
    NoInfer<{ [ K in keyof Params ]: NullableQualifier<Params[K]> }>;

/**
 * Internal qualifier formatting helpers used in diagnostics.
 *
 * @namespace
 */
export const Qualifier = {
    /**
     * @returns A string representation of the qualifier.
     */
    toString(qualifier: AnyDependencyQualifier): string {
        return qualifier instanceof Function
            ? (qualifier.name === "" ? "<anonymous function>" : `<${qualifier.name}>`)
            : qualifier.toString();
    },

    /**
     * @returns A string representation of one or multiple qualifiers.
     */
    toStrings(qualifiers: readonly AnyDependencyQualifier[]): string {
        if (qualifiers.length === 0) {
            return "<unknown dependency>";
        }
        if (qualifiers.length === 1) {
            return this.toString(qualifiers[0]);
        }
        return `one of [${qualifiers.map(qualifier => this.toString(qualifier)).join(", ")}]`;
    }
} as const;
