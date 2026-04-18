/*
 * Copyright (C) 2025 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

/**
 * Class type which even works for classes with a private constructor. If you have a public constructor consider using {@link Constructor} instead.
 *
 * @template Instance - The class instance type.
 */
export type Class<Instance = unknown> = Function & {
    /** The class prototype. */
    prototype: Instance;
};

/**
 * Public constructor type.
 *
 * @template Instance - The class instance type.
 * @template Params   - The constructor parameter types.
 */
export type Constructor<Instance = unknown, Params extends unknown[] = any[]> =
    (new (...args: Params) => Instance) & Class<Instance>;

/**
 * Factory function type.
 *
 * @template Result - The type of the created value (synchronous or asynchronous).
 * @template Params - The factory function parameter types.
 */
export type Factory<Result = unknown, Params extends unknown[] = unknown[]> = (...args: Params) => Result | Promise<Result>;

/**
 * Type of a class decorator.
 *
 * @template Instance - The type of the decorated class instance.
 * @template Params   - The constructor parameter types.
 */
export type ClassDecorator<Instance = unknown, Params extends unknown[] = unknown[]> =
    (target: Constructor<Instance, Params>, context: ClassDecoratorContext<Constructor<Instance, Params>>) => void;

/**
 * Type of a static factory method decorator.
 *
 * @template Instance - The type of the decorated class instance.
 * @template Params   - The factory function parameter types.
 */
export type ClassMethodDecorator<Instance = unknown, Params extends unknown[] = unknown[]> =
    (target: Factory<Instance, Params>, context: ClassMethodDecoratorContext<Class<Instance>, Factory<Instance, Params>>) => void;
