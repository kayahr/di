/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import type { InjectionToken } from "./InjectionToken.ts";
import { InjectionError } from "./InjectionError.ts";
import { Lifetime } from "./Lifetime.ts";
import type { DependencyQualifier, NullableQualifier } from "./Qualifier.ts";
import type { Class } from "./types.ts";

/**
 * Constructor arguments of one injectable.
 */
export interface InjectableArgs<Value = unknown, Type extends Function = Class<Value>> {
    /** The raw registration type under which this injectable registers itself, for example a class, target class, or raw function. */
    type: Type;

    /**
     * The factory function to create the actual dependency (synchronous or asynchronous), or null when the registration is
     * backed by an already existing value set separately as singleton instance.
     */
    factory: ((params: unknown[], qualifier: DependencyQualifier<Value, Type>) => Value | Promise<Value>) | null;

    /** The parameters of the constructor or static factory method. */
    params?: NullableQualifier[];

    /** Additional injection token aliases of this injectable. */
    token?: InjectionToken<any> | Array<InjectionToken<any>>;

    /** Additional class qualifiers explicitly provided by this injectable. */
    provide?: Class | Class[];

    /** Whether the concrete type itself should be registered as qualifier. Defaults to true. */
    registerSelf?: boolean;

    /** The dependency lifetime. Defaults to {@link Lifetime.SINGLETON}. */
    lifetime?: Lifetime;
}

/**
 * Internal runtime model of one DI registration.
 *
 * An injectable combines the static registration metadata with the mutable singleton instance slot. It deliberately does not know anything about
 * scopes or registries; ownership and lifecycle decisions are handled outside by the injector and registry layers.
 *
 * @template Value - The dependency value produced or cached by this registration.
 * @template Type  - The raw registration type under which this injectable registers itself.
 */
export class Injectable<Value = unknown, Type extends Function = Class<Value>> {
    readonly #factory: ((params: unknown[], qualifier: DependencyQualifier<Value, Type>) => Value | Promise<Value>) | null;
    readonly #params: NullableQualifier[];
    readonly #qualifiers: ReadonlyArray<DependencyQualifier<Value, Type>>;
    readonly #lifetime: Lifetime;

    /** Cached singleton instance or pending singleton promise. */
    #instance: Value | Promise<Value> | null = null;

    /**
     * Creates a new injectable.
     *
     * @param args - Registration metadata and runtime creation settings of this injectable.
     */
    public constructor({
        type,
        factory,
        params,
        token,
        provide,
        registerSelf,
        lifetime = Lifetime.SINGLETON
    }: InjectableArgs<Value, Type>) {
        this.#factory = factory;
        this.#params = params?.slice() ?? [];
        this.#qualifiers = Injectable.#createQualifiers(type, token, provide, registerSelf);
        this.#lifetime = lifetime;
    }

    /**
     * @returns True when this injectable is transient.
     */
    public isTransient(): boolean {
        return this.#lifetime === Lifetime.TRANSIENT;
    }

    /**
     * @returns True when this injectable can create new instances through a factory.
     */
    public hasFactory(): boolean {
        return this.#factory != null;
    }

    /**
     * @returns The complete set of local qualifier aliases under which this injectable is registered.
     */
    public getQualifiers(): ReadonlyArray<DependencyQualifier<Value, Type>> {
        return this.#qualifiers;
    }

    /**
     * @returns The configured injected parameters and pass-through placeholders.
     */
    public getParams(): readonly NullableQualifier[] {
        return this.#params;
    }

    /**
     * @returns The cached singleton instance, or null when it was not created yet.
     */
    public getInstance(): Value | Promise<Value> | null {
        return this.#instance;
    }

    /**
     * Sets the cached singleton instance.
     *
     * @param instance - The instance to cache.
     * @returns The cached instance.
     *
     * @template Instance - The concrete instance or pending promise type being cached.
     */
    public setInstance<Instance extends Value | Promise<Value>>(instance: Instance): Instance {
        return this.#instance = instance;
    }

    /**
     * Clears the cached singleton instance.
     */
    public clearInstance(): void {
        this.#instance = null;
    }

    /**
     * Creates one dependency instance from already resolved constructor or factory arguments.
     *
     * @param params - The resolved constructor or factory arguments.
     * @returns The created instance.
     * @throws {@link InjectionError} when no factory is configured for this registration.
     */
    public create(params: unknown[], qualifier: DependencyQualifier<Value, Type>): Promise<Value> | Value {
        if (this.#factory == null) {
            throw new InjectionError("Factory not set");
        }
        return this.#factory(params, qualifier);
    }

    /**
     * Creates the full local qualifier list of one injectable.
     *
     * Exact type qualifiers, explicit provides, and raw tokens are all derived once here so registry registration and removal use the exact same
     * qualifier set.
     *
     * @param type         - The raw registration type under which the injectable registers itself.
     * @param token        - Optional injection token or tokens.
     * @param provide      - Optional explicit class qualifiers.
     * @param registerSelf - Optional flag controlling whether the concrete type itself should be registered as qualifier. Defaults to true.
     * @returns The complete qualifier list without duplicates.
     *
     * @template Value - The dependency value type.
     * @template Type  - The raw registration type of the injectable itself.
     */
    static #createQualifiers<Value, Type extends Function>(
        type: Type,
        token?: InjectionToken<any> | Array<InjectionToken<any>>,
        provide?: Class | Class[],
        registerSelf = true
    ): ReadonlyArray<DependencyQualifier<Value, Type>> {
        const qualifiers: Array<DependencyQualifier<Value, Type>> = [];
        const knownQualifiers = new Set<DependencyQualifier<Value, Type>>();
        const selfTypes = registerSelf ? [ type ] : [];
        const providedTypes = Array.isArray(provide) ? provide.slice() : (provide == null ? [] : [ provide ]);
        const tokens = Array.isArray(token) ? token.slice() : (token == null ? [] : [ token ]);
        const rawTypes = [ ...selfTypes, ...providedTypes ];

        for (const qualifier of [ ...rawTypes, ...tokens ]) {
            if (!knownQualifiers.has(qualifier)) {
                qualifiers.push(qualifier);
                knownQualifiers.add(qualifier);
            }
        }
        return qualifiers;
    }
}

/** Internal fully-erased injectable type used by heterogeneous registry internals. */
export type AnyInjectable = Injectable<any, any>;
