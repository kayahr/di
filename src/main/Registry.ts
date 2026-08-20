/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { type Scope, disposeAsync } from "@kayahr/scope";
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
 * Returns whether the given value exposes an asynchronous disposal callback.
 *
 * @param value - The value to test.
 * @returns True when the value is asynchronously disposable.
 */
function isAsyncDisposable(value: unknown): value is AsyncDisposable {
    return value != null && typeof (value as AsyncDisposable)[Symbol.asyncDispose] === "function";
}

/**
 * Scope-local DI registry owning all injectables registered on one concrete scope.
 */
export class Registry implements AsyncDisposable, Disposable {
    readonly #scope: Scope;
    readonly #injectables = new Map<AnyDependencyQualifier, AnyInjectable>();
    readonly #ownedInjectables = new Set<AnyInjectable>();
    #requiresAsyncDisposal = false;
    #disposed = false;
    #disposePromise: Promise<void> | null = null;

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
     * Returns whether this registry must be disposed asynchronously.
     *
     * @returns True when the registry owns at least one asynchronously disposable singleton instance.
     */
    public requiresAsyncDisposal(): boolean {
        return this.#requiresAsyncDisposal;
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
        this.#ownedInjectables.delete(injectable);
        this.#ownedInjectables.add(injectable);
        if (!(value instanceof Promise)) {
            injectable.setInstance(value);
            this.#registerAsyncDisposal(value);
            return value;
        }
        const pending = (async (): Promise<Value> => {
            try {
                const resolvedValue = await value;
                if (!this.hasInjectable(injectable) || this.#scope.isDisposed()) {
                    await this.#disposeValueAsync(resolvedValue);
                    const dependencyName = qualifier == null
                        ? Qualifier.toStrings(injectable.getQualifiers())
                        : Qualifier.toString(qualifier);
                    throw new InjectionError(`Asynchronous dependency ${dependencyName} was invalidated before creation completed`);
                }
                injectable.setInstance(resolvedValue);
                this.#registerAsyncDisposal(resolvedValue);
                return resolvedValue;
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
        const instance = injectable.getInstance();
        if (instance != null && !(instance instanceof Promise) && isAsyncDisposable(instance)) {
            throw new InjectionError(`Dependency ${Qualifier.toString(qualifier)} requires asynchronous disposal`);
        }
        this.#removeInjectable(injectable);
        this.#disposeInjectable(injectable);
        return true;
    }

    /**
     * Asynchronously removes one locally owned injectable by any of its qualifier aliases.
     *
     * All local aliases of the matched injectable are removed together and the injectable is disposed immediately. Asynchronous disposal is preferred
     * when supported by the cached singleton instance.
     *
     * @param qualifier - Any local qualifier alias of the injectable to remove.
     * @returns Promise resolving to true when an injectable was removed, or false when the qualifier was not locally registered.
     */
    public async removeAsync(qualifier: AnyDependencyQualifier): Promise<boolean> {
        const injectable = this.#injectables.get(qualifier);
        if (injectable == null) {
            return false;
        }
        this.#removeInjectable(injectable);
        await this.#disposeInjectableAsync(injectable);
        return true;
    }

    /** Removes all local qualifier aliases of the given injectable from this registry. */
    #removeInjectable(injectable: AnyInjectable): void {
        for (const registeredQualifier of injectable.getQualifiers()) {
            this.#injectables.delete(registeredQualifier);
        }
        this.#ownedInjectables.delete(injectable);
    }

    /**
     * Alias for {@link dispose}.
     */
    public [Symbol.dispose](): void {
        this.dispose();
    }

    /** Alias for {@link disposeAsync}. */
    public [Symbol.asyncDispose](): Promise<void> {
        return this.disposeAsync();
    }

    /**
     * Disposes the complete registry and all injectables still owned by it.
     *
     * This is called once by the owning scope cleanup.
     */
    public dispose(): void {
        if (this.#disposed) {
            return;
        }
        if (this.#requiresAsyncDisposal) {
            throw new InjectionError("Registry requires asynchronous disposal");
        }
        this.#disposed = true;
        const injectables = [ ...this.#ownedInjectables ].reverse();
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
     * Asynchronously disposes the complete registry and all injectables still owned by it.
     *
     * Asynchronous disposal is preferred when supported by a cached singleton instance. Synchronous disposables are supported as a fallback. Concurrent
     * calls share the same disposal operation.
     *
     * @returns Promise which resolves when registry disposal has completed.
     */
    public disposeAsync(): Promise<void> {
        if (this.#disposePromise != null) {
            return this.#disposePromise;
        }
        if (this.#disposed) {
            return Promise.resolve();
        }
        this.#disposed = true;
        return this.#disposePromise = this.#runAsyncDisposal();
    }

    /** Runs asynchronous disposal of all owned injectables. */
    async #runAsyncDisposal(): Promise<void> {
        const injectables = [ ...this.#ownedInjectables ].reverse();
        this.#injectables.clear();
        this.#ownedInjectables.clear();
        const errors: unknown[] = [];
        for (const injectable of injectables) {
            try {
                await this.#disposeInjectableAsync(injectable);
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
     * Asynchronously disposes the currently cached synchronous instance of one injectable and clears the cache entry.
     *
     * Pending asynchronous instances are only uncached here. If they resolve later, {@link setSingletonInstance} disposes the resolved value because
     * the injectable is no longer owned by this registry.
     *
     * @param injectable - The injectable to dispose.
     */
    async #disposeInjectableAsync(injectable: AnyInjectable): Promise<void> {
        const instance = injectable.getInstance();
        injectable.clearInstance();
        if (instance != null && !(instance instanceof Promise)) {
            await this.#disposeValueAsync(instance);
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

    /** Asynchronously disposes one concrete value unless it is the owning scope itself. */
    async #disposeValueAsync<Value>(value: Value): Promise<void> {
        if (value !== this.#scope && (isAsyncDisposable(value) || isDisposable(value))) {
            await disposeAsync(value);
        }
    }

    /** Marks the owning scope as requiring asynchronous disposal when the given value is asynchronously disposable. */
    #registerAsyncDisposal(value: unknown): void {
        if (value !== this.#scope && !this.#requiresAsyncDisposal && isAsyncDisposable(value)) {
            this.#requiresAsyncDisposal = true;
            void this.#scope.onAsyncDispose(() => this.disposeAsync());
        }
    }
}
