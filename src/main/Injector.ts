/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { Scope, ScopeError, ScopeSlot, getRootScope } from "@kayahr/scope";
import { type InjectableDecoratorFactory, createInjectableDecorator } from "./decorator.ts";
import { Injectable } from "./Injectable.ts";
import { InjectionError } from "./InjectionError.ts";
import type { InjectionToken } from "./InjectionToken.ts";
import { Lifetime } from "./Lifetime.ts";
import { type AnyDependencyQualifier, type DependencyQualifier, type NullableQualifier, type NullableQualifiers, Qualifier,
    type Qualifiers } from "./Qualifier.ts";
import { Registry } from "./Registry.ts";
import type { Class, Constructor, Factory } from "./types.ts";

/**
 * Options for creating an injectable class or factory.
 *
 * @template Params - The inject array type.
 * @template Value  - The provided dependency type.
 */
export interface InjectableOptions<Params extends unknown[] = [], Value = unknown> {
    /** Optional scope owning this registration. Defaults to the shared root scope. */
    scope?: Scope;

    /** The dependency lifetime. Defaults to {@link Lifetime.SINGLETON}. */
    lifetime?: Lifetime;

    /** Optional additional class qualifier or qualifiers explicitly provided by this injectable. */
    provide?: Class | Class[];

    /** Optional injection token (or tokens) of this injectable. This allows injecting it via token in addition to its type. */
    token?: InjectionToken<Value> | Array<InjectionToken<Value>>;

    /** The parameter types. Optional when injectable has no parameters. Otherwise it must match the constructor/factory signature. */
    inject?: Params;
}

/**
 * Options for registrations identified only by injection tokens.
 *
 * @template Value - The provided dependency type.
 */
export interface TokenOptions<Value = unknown> {
    /** Optional scope owning this registration. Defaults to the shared root scope. */
    scope?: Scope;

    /** Optional injection token (or tokens) of this registration. */
    token?: InjectionToken<Value> | Array<InjectionToken<Value>>;
}

/**
 * Options for function registrations.
 *
 * @template Value - The resolved function type.
 */
export interface FunctionOptions<Value = unknown> extends TokenOptions<Value> {
    /** The dependency lifetime. Defaults to {@link Lifetime.SINGLETON}. */
    lifetime?: Lifetime;
}

/**
 * Options for resolving dependencies.
 */
export interface ResolveOptions {
    /** Optional scope from which to resolve. Defaults to the shared root scope. */
    scope?: Scope;

    /** Optional pass-through arguments for transient class or factory dependencies. */
    args?: unknown[];
}

/**
 * Maps function parameter types to an inject array allowing dependency qualifiers or `null` pass-through placeholders.
 *
 * @template Params - The original function parameter types.
 */
export type FunctionInject<Params extends unknown[]> = { [ K in keyof Params ]: NullableQualifier<Params[K]> };

/**
 * Derives the remaining call-time parameters of an injected function from the original parameter list and inject array.
 *
 * Each `null` entry in the inject array becomes one remaining parameter on the resolved function, while all other entries are injected
 * automatically by DI.
 *
 * @template Params - The original function parameter types.
 * @template Inject - The inject array containing qualifiers and `null` placeholders.
 */
export type FunctionPassThroughParams<Params extends unknown[], Inject extends readonly unknown[]> =
    Params extends [ infer Param, ...infer RemainingParams ]
        ? Inject extends [ infer Qualifier, ...infer RemainingInject ]
            ? Qualifier extends null
                ? [ Param, ...FunctionPassThroughParams<Extract<RemainingParams, unknown[]>, Extract<RemainingInject, readonly unknown[]>> ]
                : FunctionPassThroughParams<Extract<RemainingParams, unknown[]>, Extract<RemainingInject, readonly unknown[]>>
            : []
        : [];

/**
 * Type of a function after DI has removed all non-`null` parameters from its call signature.
 *
 * @template Params - The original function parameter types.
 * @template Inject - The inject array containing qualifiers and `null` placeholders.
 * @template Return - The function return type.
 */
export type InjectedFunction<Params extends unknown[], Inject extends readonly unknown[], Return> =
    (...params: FunctionPassThroughParams<Params, Inject>) => Return;

/**
 * Type of a function resolved from DI by its raw function qualifier when the exact inject array is not known statically.
 *
 * The resulting call signature preserves the original parameter types, but allows every subset of them because DI can not infer at compile time
 * which parameters were injected and which stayed as pass-through parameters.
 *
 * @template Params - The original function parameter types.
 * @template Return - The function return type.
 */
export type ResolvedFunction<Params extends unknown[], Return> = InjectedFunction<Params, FunctionInject<Params>, Return>;

/**
 * Dependency injector operating on explicit scopes, or on the shared root scope when no scope is specified.
 */
export class Injector {
    /** Registry slot storing providers owned by this injector on one scope. */
    readonly #registrySlot = ScopeSlot.create<Registry>();

    /** `@injectable` decorator factory bound to this injector instance. */
    public readonly injectable: InjectableDecoratorFactory;

    /**
     * Creates a new injector bound to the shared root scope.
     */
    public constructor() {
        this.injectable = createInjectableDecorator(this);
    }

    /**
     * Registers a class with no constructor parameters.
     *
     * @param type    - The class to register.
     * @param options - Optional registration options.
     *
     * @template Value - The created dependency type.
     */
    public setClass<Value>(type: Constructor<Value, []>, options?: InjectableOptions<[], Value>): this;

    /**
     * Registers a class with fully injected constructor parameters.
     *
     * @param type    - The class to register.
     * @param options - Registration options including the injected constructor parameters.
     *
     * @template Value  - The created dependency type.
     * @template Params - The constructor parameter types.
     */
    public setClass<Value, Params extends unknown[]>(type: Constructor<Value, Params>,
        options: InjectableOptions<Qualifiers<Params>, Value> & { inject: Qualifiers<Params> }): this;

    /**
     * Registers a transient class whose constructor may use `null` pass-through placeholders.
     *
     * @param type    - The class to register.
     * @param options - Registration options including the injected constructor parameters and transient lifetime.
     *
     * @template Value  - The created dependency type.
     * @template Params - The constructor parameter types.
     */
    public setClass<Value, Params extends unknown[]>(type: Constructor<Value, Params>,
        options: InjectableOptions<NullableQualifiers<Params>, Value>
        & { inject: NullableQualifiers<Params>, lifetime: typeof Lifetime.TRANSIENT }): this;

    /**
     * Registers the given injectable class in the target scope.
     *
     * @param type    - The class to register. Must be constructable (constructor must be public).
     * @param options - Options for the injectable. Optional if class constructor has no parameters. Use `provide` to register additional base-type
     *                  qualifiers.
     *
     * @template Value  - The created dependency type.
     * @template Params - The constructor parameter types.
     */
    public setClass<Value, Params extends unknown[]>(type: Constructor<Value, Params>, { scope, inject, lifetime = Lifetime.SINGLETON, token, provide }:
            InjectableOptions<NullableQualifiers<Params>, Value> = {}): this {
        this.#getRegistry(scope).register(new Injectable({
            type,
            factory: args => new type(...args as Params),
            params: inject,
            token,
            provide: this.#normalizeProvidedTypes(type, provide),
            lifetime
        }));
        return this;
    }

    /**
     * Registers a factory with no parameters.
     *
     * @param type    - The type produced by the factory.
     * @param factory - The factory function to register.
     * @param options - Optional registration options.
     *
     * @template Value - The created dependency type.
     */
    public setFactory<Value>(type: Class<Value>, factory: Factory<Value, []>, options?: InjectableOptions<[], Value>): this;

    /**
     * Registers a factory with fully injected parameters.
     *
     * @param type    - The type produced by the factory.
     * @param factory - The factory function to register.
     * @param options - Registration options including the injected factory parameters.
     *
     * @template Value  - The created dependency type.
     * @template Params - The factory parameter types.
     */
    public setFactory<Value, Params extends unknown[]>(type: Class<Value>, factory: Factory<Value, Params>,
        options: InjectableOptions<Qualifiers<Params>, Value> & { inject: Qualifiers<Params> }): this;

    /**
     * Registers a transient factory whose parameters may use `null` pass-through placeholders.
     *
     * @param type    - The type produced by the factory.
     * @param factory - The factory function to register.
     * @param options - Registration options including the injected factory parameters and transient lifetime.
     *
     * @template Value  - The created dependency type.
     * @template Params - The factory parameter types.
     */
    public setFactory<Value, Params extends unknown[]>(type: Class<Value>, factory: Factory<Value, Params>,
        options: InjectableOptions<NullableQualifiers<Params>, Value>
        & { inject: NullableQualifiers<Params>, lifetime: typeof Lifetime.TRANSIENT }): this;

    /**
     * Registers the given injectable factory in the target scope.
     *
     * @param type    - The type of the value generated by the factory.
     * @param factory - The factory function which creates the value (synchronous or asynchronous).
     * @param options - Options for the injectable. Optional if factory has no parameters. Use `provide` to register additional base-type qualifiers.
     *
     * @template Value  - The created dependency type.
     * @template Params - The factory parameter types.
     */
    public setFactory<Value, Params extends unknown[]>(type: Class<Value>, factory: Factory<Value, Params>,
            { scope, inject, lifetime = Lifetime.SINGLETON, token, provide }: InjectableOptions<NullableQualifiers<Params>, Value> = {}): this {
        this.#getRegistry(scope).register(new Injectable({
            type,
            factory: args => factory.apply(type, args as Params),
            params: inject,
            token,
            provide: this.#normalizeProvidedTypes(type, provide),
            lifetime
        }));
        return this;
    }

    /**
     * Registers the given injectable value in the target scope.
     *
     * Value registrations are token-based only. For type-based registrations use {@link setClass} or {@link setFactory}.
     *
     * @param value   - The value to inject.
     * @param token   - Injection token or non-empty token list of the value registration.
     * @param options - Optional options for the value registration.
     *
     * @template Value - The provided dependency type.
     */
    public setValue<Value>(value: Value | Promise<Value>, token: InjectionToken<Value> | [ InjectionToken<Value>, ...Array<InjectionToken<Value>> ],
            { scope }: { scope?: Scope } = {}): this {
        if (token == null) {
            throw new InjectionError("Value registrations require an injection token");
        }
        const registry = this.#getRegistry(scope);
        const injectable = new Injectable({
            type: Object(value).constructor as Constructor,
            factory: null,
            params: [],
            token,
            registerSelf: false
        });
        registry.register(injectable);
        registry.setSingletonInstance(injectable, value);
        return this;
    }

    /**
     * Registers the given injectable function in the target scope. Using `null` in the inject array defines placeholders for pass-through
     * function parameters. So when injecting a function with inject arguments `[ null, Service, null ]` the resolved function expects two
     * parameters which are filled into the placeholders while `Service` is injected automatically.
     *
     * @param func    - The function to inject.
     * @param inject  - The parameter inject array. It must match the function signature and may use `null` to keep parameters in the resolved call signature.
     * @param options - Optional options for the function registration.
     *
     * @template Params - The original function parameter types.
     * @template Inject - The inject array containing qualifiers and `null` placeholders.
     * @template Return - The function return type.
     */
    public setFunction<Params extends unknown[], const Inject extends FunctionInject<Params>, Return>(func: (...params: Params) => Return,
            inject: Inject, { scope, token, lifetime = Lifetime.SINGLETON }: FunctionOptions<InjectedFunction<Params, Inject, Return>> = {}): this {
        const injectQualifiers = inject.slice();
        function createParams(injectParams: unknown[], callParams: unknown[], dependencyName: string): unknown[] {
            let injectParamIndex = 0;
            let callParamIndex = 0;
            return injectQualifiers.map(qualifier => {
                if (qualifier != null) {
                    return injectParams[injectParamIndex++];
                }
                if (callParamIndex >= callParams.length) {
                    throw new InjectionError(`Pass-through parameter ${callParamIndex + 1} not found for dependency ${dependencyName}`);
                }
                return callParams[callParamIndex++];
            });
        }
        this.#getRegistry(scope).register(new Injectable({
            type: func,
            factory: (injectParams, qualifier) => {
                const dependencyName = Qualifier.toString(qualifier);
                return (...callParams: Params) => func(...createParams(injectParams, callParams, dependencyName) as Params);
            },
            params: injectQualifiers.filter(qualifier => qualifier != null),
            token,
            lifetime
        }));
        return this;
    }

    /**
     * Checks if the given scope or one of its parent scopes can resolve the given registered function.
     *
     * @param fn      - The registered function qualifier to look for.
     * @param options - Optional resolve options.
     * @returns True if the function can be resolved, false if not.
     *
     * @template Params - The original function parameter types.
     * @template Return - The function return type.
     */
    public has<Params extends unknown[], Return>(fn: (...params: Params) => Return, options?: ResolveOptions): boolean;

    /**
     * Checks if the given scope or one of its parent scopes can resolve the given class or injection token.
     *
     * @param qualifier - The dependency qualifier to look for.
     * @param options   - Optional resolve options.
     * @returns True if the qualifier can be resolved, false if not.
     *
     * @template Value - The provided dependency type.
     */
    public has<Value>(qualifier: Qualifier<Value>, options?: ResolveOptions): boolean;

    /**
     * Checks if the given scope or one of its parent scopes can resolve the given dependency.
     *
     * @param qualifier - The dependency qualifier to look for.
     * @param options   - Optional resolve options.
     * @returns True if the dependency can be resolved, false if not.
     */
    public has(qualifier: AnyDependencyQualifier, { scope }: ResolveOptions = {}): boolean {
        const resolutionScope = this.#getTargetScope(scope);
        if (qualifier === Injector || qualifier === Scope) {
            return true;
        }
        return this.#findInjectable(resolutionScope, qualifier) != null;
    }

    /**
     * Removes the given registered function from the target scope's registry only and does not bubble up the parent chain.
     *
     * @param fn      - The registered function qualifier to remove.
     * @param options - Optional resolve options.
     * @returns True if something was removed, false if not.
     *
     * @template Params - The original function parameter types.
     * @template Return - The function return type.
     */
    public remove<Params extends unknown[], Return>(fn: (...params: Params) => Return, options?: ResolveOptions): boolean;

    /**
     * Removes the given class or injection token from the target scope's registry only and does not bubble up the parent chain.
     *
     * @param qualifier - The qualifier to remove.
     * @param options   - Optional resolve options.
     * @returns True if something was removed, false if not.
     *
     * @template Value - The provided dependency type.
     */
    public remove<Value>(qualifier: Qualifier<Value>, options?: ResolveOptions): boolean;

    /**
     * Removes the given dependency from the target scope's registry only and does not bubble up the parent chain.
     *
     * @param qualifier - The qualifier to remove.
     * @param options   - Optional resolve options.
     * @returns True if something was removed, false if not.
     */
    public remove(qualifier: AnyDependencyQualifier, { scope }: ResolveOptions = {}): boolean {
        const targetScope = this.#getTargetScope(scope);
        if (qualifier === Injector || qualifier === Scope) {
            return false;
        }
        const registry = targetScope.get(this.#registrySlot);
        if (registry == null) {
            return false;
        }
        return registry.remove(qualifier);
    }

    /**
     * Resolves a registered function and returns the injected function wrapper.
     *
     * @param fn      - The registered function qualifier.
     * @param options - Optional resolve options.
     * @throws {@link InjectionError} when the dependency was not found.
     *
     * @template Params - The original function parameter types.
     * @template Return - The function return type.
     */
    public get<Params extends unknown[], Return>(fn: (...params: Params) => Return,
        options?: ResolveOptions): Promise<ResolvedFunction<Params, Return>> | ResolvedFunction<Params, Return>;

    /**
     * Resolves a class or injection token.
     *
     * @param qualifier - The dependency qualifier.
     * @param options   - Optional resolve options.
     * @throws {@link InjectionError} when the dependency was not found.
     *
     * @template Value - The provided dependency type.
     */
    public get<Value>(qualifier: Qualifier<Value>, options?: ResolveOptions): Value | Promise<Value>;

    /**
     * Returns the dependency matching the given qualifier. Resolution starts in the specified scope and walks up the real scope tree. When no scope is
     * specified it starts at the shared root scope.
     *
     * @param qualifier - The dependency qualifier (class or token).
     * @param options   - Optional resolve options.
     * @returns The found dependency. Synchronous if possible, asynchronous otherwise.
     * @throws {@link InjectionError} when the dependency was not found.
     */
    public get<Value>(qualifier: Qualifier<Value>, { scope, args }: ResolveOptions = {}): Value | Promise<Value> {
        return this.#resolve(this.#getTargetScope(scope), qualifier, args);
    }

    /**
     * Resolves a registered function asynchronously and returns the injected function wrapper.
     *
     * @param fn      - The registered function qualifier.
     * @param options - Optional resolve options.
     * @throws {@link InjectionError} when the dependency was not found.
     *
     * @template Params - The original function parameter types.
     * @template Return - The function return type.
     */
    public getAsync<Params extends unknown[], Return>(fn: (...params: Params) => Return,
        options?: ResolveOptions): Promise<ResolvedFunction<Params, Return>>;

    /**
     * Resolves a class or injection token asynchronously.
     *
     * @param qualifier - The dependency qualifier.
     * @param options   - Optional resolve options.
     * @throws {@link InjectionError} when the dependency was not found.
     *
     * @template Value - The provided dependency type.
     */
    public getAsync<Value>(qualifier: Qualifier<Value>, options?: ResolveOptions): Promise<Value>;

    /**
     * Alias for {@link get} which always returns a promise, even when all involved dependencies are synchronous.
     *
     * @param qualifier - The dependency qualifier.
     * @param options   - Optional resolve options.
     * @returns The found dependency.
     * @throws {@link InjectionError} when the dependency was not found.
     */
    public async getAsync<Value>(qualifier: Qualifier<Value>, options?: ResolveOptions): Promise<Value> {
        return this.get(qualifier, options);
    }

    /**
     * Resolves a registered function synchronously and returns the injected function wrapper.
     *
     * @param fn      - The registered function qualifier.
     * @param options - Optional resolve options.
     * @throws {@link InjectionError} when the dependency was not found or is asynchronous.
     *
     * @template Params - The original function parameter types.
     * @template Return - The function return type.
     */
    public getSync<Params extends unknown[], Return>(fn: (...params: Params) => Return,
        options?: ResolveOptions): ResolvedFunction<Params, Return>;

    /**
     * Resolves a class or injection token synchronously.
     *
     * @param qualifier - The dependency qualifier.
     * @param options   - Optional resolve options.
     * @throws {@link InjectionError} when the dependency was not found or is asynchronous.
     *
     * @template Value - The provided dependency type.
     */
    public getSync<Value>(qualifier: Qualifier<Value>, options?: ResolveOptions): Value;

    /**
     * Alias for {@link get} which always returns a synchronous value or throws an exception if an asynchronous dependency is involved.
     *
     * @param qualifier - The dependency qualifier.
     * @param options   - Optional resolve options.
     * @returns The found dependency.
     * @throws {@link InjectionError} when the dependency was not found or is asynchronous.
     */
    public getSync<Value>(qualifier: Qualifier<Value>, options?: ResolveOptions): Value {
        const dependency = this.get(qualifier, options);
        if (dependency instanceof Promise) {
            throw new InjectionError(`Asynchronous dependency ${Qualifier.toString(qualifier)} can not be resolved synchronously`);
        }
        return dependency;
    }

    /**
     * Validates and normalizes explicitly provided class qualifiers.
     *
     * Provided class qualifiers must be the concrete type itself or one of its runtime base classes. Anything else would be a lie because DI would
     * pretend that one implementation satisfies an unrelated class contract.
     *
     * @param type    - The concrete registered type.
     * @param provide - The optional explicit provided class or classes.
     * @returns The normalized provided class qualifiers.
     */
    #normalizeProvidedTypes(type: Class, provide?: Class | Class[]): Class[] {
        let providedTypes: Class[];
        if (provide == null) {
            providedTypes = [];
        } else if (Array.isArray(provide)) {
            providedTypes = provide;
        } else {
            providedTypes = [ provide ];
        }
        for (const providedType of providedTypes) {
            if (type !== providedType && !(type.prototype instanceof providedType)) {
                throw new InjectionError(`Provided type ${Qualifier.toString(providedType)} is not assignable from ${Qualifier.toString(type)}`);
            }
        }
        return providedTypes;
    }

    /**
     * Returns the registry stored directly on the target scope, creating it if needed.
     *
     * @param scope - The optional explicit scope. When omitted, the shared root scope is used.
     * @returns The scope-local registry.
     */
    #getRegistry(scope?: Scope): Registry {
        const targetScope = this.#getTargetScope(scope);
        let registry = targetScope.get(this.#registrySlot);
        if (registry == null) {
            const createdRegistry = new Registry(targetScope);
            targetScope.set(this.#registrySlot, createdRegistry);
            targetScope.onDispose(() => {
                createdRegistry.dispose();
            });
            registry = createdRegistry;
        }
        return registry;
    }

    /**
     * Returns the target scope, falling back to the shared root scope when no scope is specified.
     *
     * @param scope - The optional explicit scope. When omitted, the shared root scope is used.
     * @returns The target scope.
     */
    #getTargetScope(scope?: Scope): Scope {
        if (scope == null) {
            return getRootScope();
        }
        if (scope.isDisposed()) {
            throw new ScopeError("Scope is disposed");
        }
        return scope;
    }

    /**
     * Finds the nearest injectable matching the given qualifier.
     *
     * @param scope     - The scope to start searching from.
     * @param qualifier - The qualifier to search.
     * @returns The injectable and its owner scope, or null when none was found.
     *
     * @template Value - The dependency value type.
     * @template Type  - The raw registration type of the injectable itself.
     */
    #findInjectable<Value, Type extends Function>(scope: Scope, qualifier: DependencyQualifier<Value, Type>):
            { registry: Registry, injectable: Injectable<Value, Type> } | null {
        let current: Scope | null = scope;
        while (current != null) {
            const registry = current.get(this.#registrySlot);
            const injectable = registry?.get(qualifier);
            if (registry != null && injectable != null) {
                return { registry, injectable };
            }
            current = current.getParent();
        }
        return null;
    }

    #resolve(scope: Scope, qualifier: typeof Injector, params?: unknown[]): Injector;
    #resolve(scope: Scope, qualifier: typeof Scope, params?: unknown[]): Scope;
    #resolve<Params extends unknown[], Return>(scope: Scope, qualifier: (...params: Params) => Return,
        params?: unknown[]): ResolvedFunction<Params, Return> | Promise<ResolvedFunction<Params, Return>>;
    #resolve<Value>(scope: Scope, qualifier: Qualifier<Value>, params?: unknown[]): Value | Promise<Value>;

    /**
     * Resolves the given qualifier against the specified scope.
     *
     * Singleton providers are instantiated in their owner scope so cached instances do not capture child-scope overrides. Transient providers resolve
     * their dependencies in the calling scope so explicit scoped overrides apply naturally.
     *
     * @param scope     - The resolution scope.
     * @param qualifier - The qualifier to resolve.
     * @param params    - Optional pass-through parameters.
     * @returns The resolved dependency.
     * @throws {@link InjectionError} when nothing matches the qualifier.
     */
    #resolve(scope: Scope, qualifier: AnyDependencyQualifier, params?: unknown[]): unknown {
        if (qualifier === Injector) {
            return this;
        }
        if (qualifier === Scope) {
            return scope;
        }
        const match = this.#findInjectable(scope, qualifier);
        if (match == null) {
            throw new InjectionError(`Dependency ${Qualifier.toString(qualifier)} not found`);
        }
        return this.#resolveInjectable(match.registry, match.injectable, scope, qualifier, params);
    }

    /**
     * Resolves one provider match either by creating a new transient instance or by creating/caching one singleton instance.
     *
     * Transient instances resolve their nested dependencies in the calling scope so explicit overrides apply. Singleton instances resolve their nested
     * dependencies in their owner scope so cached values do not capture child-local overrides.
     *
     * @param registry   - The registry owning the matched provider.
     * @param injectable - The matched provider.
     * @param scope      - The scope from which the current lookup started.
     * @param qualifier  - The originally requested qualifier.
     * @param params     - Optional pass-through parameters for transient providers.
     * @returns The resolved dependency.
     *
     * @template Value - The dependency value type.
     * @template Type  - The raw registration type of the injectable itself.
     */
    #resolveInjectable<Value, Type extends Function>(registry: Registry, injectable: Injectable<Value, Type>, scope: Scope,
            qualifier: DependencyQualifier<Value, Type>, params?: unknown[]): Value | Promise<Value> {
        if (injectable.isTransient()) {
            return this.#createInstance(injectable, scope, qualifier, params);
        }
        const instance = injectable.getInstance();
        if (instance != null) {
            return instance;
        }
        const ownerScope = registry.getScope();
        return registry.setSingletonInstance(injectable, this.#createInstance(injectable, ownerScope, qualifier), qualifier);
    }

    /**
     * Creates one provider instance by resolving its configured dependency parameters and pass-through placeholders.
     *
     * @param injectable - The provider to instantiate.
     * @param scope      - The scope in which dependency qualifiers are resolved.
     * @param qualifier  - The originally requested qualifier. Used in error messages.
     * @param params     - Optional pass-through parameters.
     * @returns The created dependency.
     *
     * @template Value - The dependency value type.
     * @template Type  - The raw registration type of the injectable itself.
     */
    #createInstance<Value, Type extends Function>(injectable: Injectable<Value, Type>, scope: Scope, qualifier: DependencyQualifier<Value, Type>,
            params?: unknown[]): Value | Promise<Value> {
        let paramIndex = 0;
        const numParams = params?.length ?? 0;
        const values = injectable.getParams().map(param => {
            if (param == null) {
                if (paramIndex >= numParams) {
                    throw new InjectionError(`Pass-through parameter ${paramIndex + 1} not found for dependency ${Qualifier.toString(qualifier)}`);
                }
                return params?.[paramIndex++];
            }
            return this.#resolve(scope, param);
        });
        return values.some(value => value instanceof Promise)
            ? (async (): Promise<Value> => injectable.create(await Promise.all(values), qualifier))()
            : injectable.create(values, qualifier);
    }

}

/** Default injector instance used by the top-level API and decorator. */
export const injector = new Injector();

/** Default injectable decorator bound to {@link injector}. */
export const injectable = injector.injectable;
