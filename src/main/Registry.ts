/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import type { Scope } from "@kayahr/scope";
import type { AnyInjectable, Injectable } from "./Injectable.ts";
import { InjectionError } from "./InjectionError.ts";
import { hasErrors, throwErrors } from "./error.ts";
import { type AnyDependencyQualifier, type DependencyQualifier, Qualifier } from "./Qualifier.ts";

/**
 * Returns whether the given value exposes a synchronous disposal callback.
 *
 * @param value - The value to test.
 * @returns True when the value is disposable.
 */
function isDisposable(value: unknown): value is Disposable {
    return value != null && typeof (value as Disposable)[Symbol.dispose] === "function";
}

/**
 * Scope-local DI registry owning all injectables registered on one concrete scope.
 */
export class Registry implements Disposable {
    readonly #scope: Scope;
    readonly #injectables = new Map<AnyDependencyQualifier, AnyInjectable>();
    readonly #ownedInjectables = new Set<AnyInjectable>();

    /**
     * Creates a new scope-local registry.
     *
     * @param scope - The owning scope.
     */
    public constructor(scope: Scope) {
        this.#scope = scope;
    }

    /**
     * Returns the concrete scope owning this registry.
     *
     * @returns The owner scope.
     */
    public getScope(): Scope {
        return this.#scope;
    }

    /**
     * Returns the injectable stored under the given qualifier directly on this registry.
     *
     * @param qualifier - The qualifier to look up.
     * @returns The matching injectable, or undefined when this registry does not own it.
     *
     * @template Value - The dependency value type.
     * @template Type  - The raw registration type of the injectable itself.
     */
    public get<Value, Type extends Function>(qualifier: DependencyQualifier<Value, Type>): Injectable<Value, Type> | undefined {
        return this.#injectables.get(qualifier) as Injectable<Value, Type> | undefined;
    }

    /**
     * Returns whether this registry still owns the given injectable through at least one qualifier alias.
     *
     * @param injectable - The injectable to test.
     * @returns True when the injectable is still owned by this registry.
     */
    public hasInjectable(injectable: AnyInjectable): boolean {
        return this.#ownedInjectables.has(injectable);
    }

    /**
     * Sets the cached singleton instance of the given injectable under this registry's ownership.
     *
     * Synchronous values are cached immediately. Asynchronous values are cached as a pending promise first and normalized to the resolved value later
     * only when the injectable still belongs to this registry. Otherwise the resolved value is disposed immediately because it has become orphaned and
     * the pending resolution rejects with an {@link InjectionError}.
     *
     * @param injectable - The injectable whose singleton instance should be updated.
     * @param value      - The instance value or pending instance promise.
     * @param qualifier  - The qualifier through which the dependency is currently being resolved. Optional for eager value registrations where no
     *                     single runtime resolve qualifier exists yet.
     * @returns The stored synchronous value or pending promise.
     *
     * @template Value - The dependency value type.
     * @template Type  - The raw registration type of the injectable itself.
     */
    public setSingletonInstance<Value, Type extends Function>(injectable: Injectable<Value, Type>, value: Value | Promise<Value>,
            qualifier?: DependencyQualifier<Value, Type>): Value | Promise<Value> {
        if (!(value instanceof Promise)) {
            return injectable.setInstance(value);
        }
        const pending = (async (): Promise<Value> => {
            try {
                const resolvedValue = await value;
                if (!this.hasInjectable(injectable)) {
                    this.#disposeValue(resolvedValue);
                    const dependencyName = qualifier == null
                        ? Qualifier.toStrings(injectable.getQualifiers())
                        : Qualifier.toString(qualifier);
                    throw new InjectionError(`Asynchronous dependency ${dependencyName} was invalidated before creation completed`);
                }
                return injectable.setInstance(resolvedValue);
            } catch (error) {
                if (injectable.hasFactory() && injectable.getInstance() instanceof Promise) {
                    injectable.clearInstance();
                }
                throw error;
            }
        })();
        return injectable.setInstance(pending);
    }

    /**
     * Registers one injectable under all of its local qualifier aliases.
     *
     * Duplicate local qualifiers are rejected instead of silently replacing existing registrations. DI registrations are explicit; when something is
     * already registered in one scope, overwriting it behind the caller's back would be a dishonest API.
     *
     * @param injectable - The injectable to register.
     *
     * @template Value - The dependency value type.
     * @template Type  - The raw registration type of the injectable itself.
     */
    public register<Value, Type extends Function>(injectable: Injectable<Value, Type>): void {
        const qualifiers = injectable.getQualifiers();
        for (const qualifier of qualifiers) {
            if (this.#injectables.has(qualifier)) {
                throw new InjectionError(`Dependency ${Qualifier.toString(qualifier)} already registered in this scope`);
            }
        }
        for (const qualifier of qualifiers) {
            this.#injectables.set(qualifier as AnyDependencyQualifier, injectable as AnyInjectable);
        }
        this.#ownedInjectables.add(injectable as AnyInjectable);
    }

    /**
     * Removes one locally owned injectable by any of its qualifier aliases.
     *
     * All local aliases of the matched injectable are removed together and the injectable is disposed immediately.
     *
     * @param qualifier - Any local qualifier alias of the injectable to remove.
     * @returns True when an injectable was removed, false when the qualifier was not locally registered.
     */
    public remove(qualifier: AnyDependencyQualifier): boolean {
        const injectable = this.#injectables.get(qualifier);
        if (injectable == null) {
            return false;
        }
        for (const registeredQualifier of injectable.getQualifiers()) {
            this.#injectables.delete(registeredQualifier);
        }
        this.#ownedInjectables.delete(injectable);
        this.#disposeInjectable(injectable);
        return true;
    }

    /**
     * Alias for {@link dispose}.
     */
    public [Symbol.dispose](): void {
        this.dispose();
    }

    /**
     * Disposes the complete registry and all injectables still owned by it.
     *
     * This is called once by the owning scope cleanup.
     */
    public dispose(): void {
        const injectables = [ ...this.#ownedInjectables ];
        this.#injectables.clear();
        this.#ownedInjectables.clear();
        const errors: unknown[] = [];
        for (const injectable of injectables) {
            try {
                this.#disposeInjectable(injectable);
            } catch (error) {
                errors.push(error);
            }
        }
        if (hasErrors(errors)) {
            throwErrors(errors, "Registry cleanup failed");
        }
    }

    /**
     * Disposes the currently cached synchronous instance of one injectable and clears the cache entry.
     *
     * Pending asynchronous instances are only uncached here. If they resolve later, {@link setSingletonInstance} disposes the resolved value because
     * the injectable is no longer owned by this registry.
     *
     * @param injectable - The injectable to dispose.
     */
    #disposeInjectable(injectable: AnyInjectable): void {
        const instance = injectable.getInstance();
        injectable.clearInstance();
        if (instance != null && !(instance instanceof Promise)) {
            this.#disposeValue(instance);
        }
    }

    /**
     * Disposes one concrete value immediately unless it is the owning scope itself.
     *
     * The scope instance is excluded to avoid recursive disposal nonsense when `Scope` itself is cached as a dependency.
     *
     * @param value - The value to dispose.
     *
     * @template Value - The value type to dispose.
     */
    #disposeValue<Value>(value: Value): void {
        if (value !== this.#scope && isDisposable(value)) {
            value[Symbol.dispose]();
        }
    }
}
