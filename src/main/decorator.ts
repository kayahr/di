/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import type { InjectableOptions, Injector } from "./Injector.ts";
import type { Lifetime } from "./Lifetime.ts";
import type { NullableQualifiers, Qualifiers } from "./Qualifier.ts";
import type { Class, ClassDecorator, ClassMethodDecorator, Constructor, Factory } from "./types.ts";

/** Target type for injectable decorators. */
export type InjectableTarget<Value = unknown, Params extends unknown[] = unknown[]> = Class<Value> | Factory<Value, Params>;

/** Decorator type of an injectable decorator factory. */
export type InjectableDecorator<Value = unknown, Params extends unknown[] = unknown[]> =
    ClassDecorator<Value, Params> & ClassMethodDecorator<Value, Params>;

/**  Decorator context type for injectable decorators. */
export type InjectableDecoratorContext<Value = unknown, Params extends unknown[] = unknown[]> =
    ClassMethodDecoratorContext<Class<Value>, Factory<Value, Params>> | ClassDecoratorContext<Constructor<Value, Params>>;

/** Injectable decorator factory type. */
export interface InjectableDecoratorFactory {
    /**
     * Creates a decorator for a class or static factory method without explicit injected parameters.
     *
     * @param options - Optional registration options.
     * @returns The decorator.
     *
     * @template Value - The created dependency type.
     */
    <Value>(options?: InjectableOptions<[], Value>): InjectableDecorator<Value, []>;

    /**
     * Creates a decorator for a class or static factory method with fully injected parameters.
     *
     * @param options - Registration options including the injected parameters.
     * @returns The decorator.
     *
     * @template Value  - The created dependency type.
     * @template Params - The parameter types.
     */
    <Value, Params extends unknown[]>(options: InjectableOptions<Qualifiers<Params>, Value>
        & { inject: Qualifiers<Params> }): InjectableDecorator<Value, Params>;

    /**
     * Creates a decorator for a transient class or static factory method whose parameters may use `null` pass-through placeholders.
     *
     * @param options - Registration options including the injected parameters and transient lifetime.
     * @returns The decorator.
     *
     * @template Value  - The created dependency type.
     * @template Params - The parameter types.
     */
    <Value, Params extends unknown[]>(options: InjectableOptions<NullableQualifiers<Params>, Value>
        & { inject: NullableQualifiers<Params>, lifetime: typeof Lifetime.TRANSIENT }): InjectableDecorator<Value, Params>;

    /**
     * Handles decorator runtime invocation without explicit options.
     *
     * The actual registration is deferred via `context.addInitializer(...)` so the final class constructor is available as `this`.
     *
     * @param target  - The decorated class or static factory method.
     * @param context - The decorator context.
     */
    <Value>(target: Constructor<Value, []> | Factory<Value, []>, context: InjectableDecoratorContext<Value, []>): void;
}

/**
 * Handles decorator usage without explicit options.
 *
 * The actual injector registration is deferred via `context.addInitializer(...)` so the final class constructor is available as `this`,
 * which matters for subclasses and static factory methods.
 *
 * @param injector - The injector receiving the registration.
 * @param target   - The decorated class or static factory method.
 * @param context  - The decorator context.
 *
 * @template Value - The created dependency type.
 */
function injectableWithoutOptions<Value>(injector: Injector, target: InjectableTarget<Value, []>,
        context: InjectableDecoratorContext<Value, []>): void {
    if (context.kind === "class") {
        context.addInitializer(function () {
            injector.setClass(this);
        });
    } else {
        context.addInitializer(function () {
            injector.setFactory(this, target as Factory);
        });
    }
}

/**
 * Creates a decorator handling usage with explicit options.
 *
 * Just like the option-less path, the registration is deferred via `context.addInitializer(...)` so the final class constructor is used
 * as the registration type.
 *
 * @param injector - The injector receiving the registration.
 * @param options  - The explicit decorator options.
 * @returns The decorator function.
 *
 * @template Value  - The created dependency type.
 * @template Params - The parameter types.
 */
function injectableWithOptions<Value, Params extends unknown[]>(injector: Injector, options: InjectableOptions<Qualifiers<Params>, Value>
        & { inject: Qualifiers<Params> }): InjectableDecorator<Value, Params> {
    return (target: InjectableTarget<Value, Params>, context: InjectableDecoratorContext<Value, Params>) => {
        if (context.kind === "class") {
            context.addInitializer(function () {
                injector.setClass(this, options);
            });
        } else {
            context.addInitializer(function () {
                injector.setFactory(this, target as Factory<Value, Params>, options);
            });
        }
    };
}

/**
 * Creates an `injectable` decorator bound to the given injector.
 *
 * @param injector - The injector to register decorated dependencies with.
 * @returns The decorator factory.
 */
export function createInjectableDecorator(injector: Injector): InjectableDecoratorFactory {
    /**
     * Runtime implementation handling both decorator call forms:
     * `@injectable` and `@injectable(options)`.
     *
     * @param args - Either decorator runtime arguments or one options object.
     * @returns A decorator when called with options, otherwise nothing.
     */
    function injectable(...args: unknown[]): InjectableDecorator | void {
        if (args[0] instanceof Function) {
            injectableWithoutOptions(injector, args[0] as InjectableTarget<unknown, []>, args[1] as InjectableDecoratorContext<unknown, []>);
            return;
        }
        return injectableWithOptions(injector, args[0] as InjectableOptions<Qualifiers> & { inject: Qualifiers });
    }
    return injectable as InjectableDecoratorFactory;
}
