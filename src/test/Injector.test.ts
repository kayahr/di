/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { beforeEach, describe, it } from "node:test";

import { assertInstanceOf, assertNotSame, assertSame, assertThrowWithMessage } from "@kayahr/assert";
import { Scope, ScopeError, createScope, getRootScope, resetRootScope } from "@kayahr/scope";
import { InjectionError } from "../main/InjectionError.ts";
import { InjectionToken } from "../main/InjectionToken.ts";
import { Injector } from "../main/Injector.ts";
import { Lifetime } from "../main/Lifetime.ts";

const divide = (dividend: number, divisor: number) => dividend / divisor;

describe("Injector", () => {
    let injector: Injector;

    beforeEach(() => {
        resetRootScope();
        injector = new Injector();
    });

    it("resolves singletons from the shared root scope by default", () => {
        class Test {
            public value = 53;
        }

        injector.setClass(Test);

        const test = injector.getSync(Test);
        assertSame(injector.getSync(Test), test);
        assertSame(test.value, 53);
        assertSame(injector.has(Test), true);
    });

    it("keeps injector registries isolated even on the same scope tree", () => {
        class Test {}

        const otherInjector = new Injector();
        injector.setClass(Test);

        assertSame(injector.has(Test), true);
        assertSame(otherInjector.has(Test), false);
        assertThrowWithMessage(() => otherInjector.getSync(Test), InjectionError, "Dependency <Test> not found");
    });

    it("supports multiple token-qualified dependencies", () => {
        abstract class Base {
            public abstract value(): number;
        }
        class Impl1 extends Base {
            public value(): number {
                return 1;
            }
        }
        class Impl2 extends Base {
            public value(): number {
                return 2;
            }
        }
        class Test {
            public readonly impl1: Base;
            public readonly impl2: Base;

            public constructor(
                impl1: Base,
                impl2: Base
            ) {
                this.impl1 = impl1;
                this.impl2 = impl2;
            }
        }

        const impl1Token = new InjectionToken<Base>("impl-1");
        const impl2Token = new InjectionToken<Base>("impl-2");
        injector.setClass(Impl1, { token: impl1Token });
        injector.setClass(Impl2, { token: impl2Token });
        injector.setClass(Test, { inject: [ impl1Token, impl2Token ] });

        const test = injector.getSync(Test);
        assertSame(test.impl1.value(), 1);
        assertSame(test.impl2.value(), 2);
    });

    it("does not register providers under Object implicitly", () => {
        class Test {}

        injector.setClass(Test);

        assertSame(injector.has(Object), false);
        assertThrowWithMessage(() => injector.getSync(Object), InjectionError, "Dependency <Object> not found");
    });

    it("does not register base classes implicitly and allows sibling subclasses", () => {
        class Base {}
        class Sub1 extends Base {}
        class Sub2 extends Base {}

        injector.setClass(Sub1);
        injector.setClass(Sub2);

        assertInstanceOf(injector.getSync(Sub1), Sub1);
        assertInstanceOf(injector.getSync(Sub2), Sub2);
        assertSame(injector.has(Base), false);
        assertThrowWithMessage(() => injector.getSync(Base), InjectionError, "Dependency <Base> not found");
    });

    it("rejects duplicate explicit provided qualifiers in one scope", () => {
        class Base {}
        class Sub1 extends Base {}
        class Sub2 extends Base {}

        injector.setClass(Sub1, { provide: Base });

        assertThrowWithMessage(() => injector.setClass(Sub2, { provide: Base }), InjectionError, "Dependency <Base> already registered in this scope");
    });

    it("rejects unrelated provided qualifiers", () => {
        class Base {}
        class Unrelated {}
        class Test extends Base {}

        assertThrowWithMessage(() => injector.setClass(Test, { provide: Unrelated }), InjectionError,
            "Provided type <Unrelated> is not assignable from <Test>");
    });

    it("supports transient classes with pass-through parameters", () => {
        class Service {
            public id = 7;
        }
        class Component {
            public readonly name: string;
            public readonly service: Service;
            public readonly count: number;

            public constructor(
                name: string,
                service: Service,
                count: number
            ) {
                this.name = name;
                this.service = service;
                this.count = count;
            }
        }

        injector.setClass(Service);
        injector.setClass(Component, { inject: [ null, Service, null ], lifetime: Lifetime.TRANSIENT });

        const first = injector.getSync(Component, { args: [ "foo", 2 ] });
        const second = injector.getSync(Component, { args: [ "bar", 3 ] });

        assertNotSame(first, second);
        assertSame(first.name, "foo");
        assertSame(first.count, 2);
        assertSame(first.service, injector.getSync(Service));
        assertSame(second.name, "bar");
        assertSame(second.count, 3);
    });

    it("supports function dependencies with pass-through parameters", () => {
        const divisorToken = new InjectionToken<number>("divisor");
        injector.setValue(10, divisorToken);
        injector.setFunction(divide, [ null, divisorToken ]);

        const fn = injector.getSync(divide);

        assertSame(fn(100), 10);
        assertSame(injector.getSync(divide), fn);
        assertThrowWithMessage(() => fn(), InjectionError, "Pass-through parameter 1 not found for dependency <divide>");
    });

    it("supports token-qualified function dependencies", () => {
        const divisorToken = new InjectionToken<number>("divisor");
        const divideToken = new InjectionToken<(dividend: number) => number>("divide");
        injector.setValue(10, divisorToken);
        injector.setFunction(divide, [ null, divisorToken ], { token: divideToken });

        const fn = injector.getSync(divideToken);

        assertSame(fn(100), 10);
        assertThrowWithMessage(() => (fn as unknown as () => number)(), InjectionError,
            "Pass-through parameter 1 not found for dependency InjectionToken(divide)");
    });

    it("supports has and remove with raw function qualifiers", () => {
        const divisorToken = new InjectionToken<number>("divisor");
        const divideToken = new InjectionToken<(dividend: number) => number>("divide");
        injector.setValue(10, divisorToken);
        injector.setFunction(divide, [ null, divisorToken ], { token: divideToken });

        assertSame(injector.has(divide), true);
        assertSame(injector.has(divideToken), true);
        assertSame(injector.remove(divide), true);
        assertSame(injector.has(divide), false);
        assertSame(injector.has(divideToken), false);
        assertThrowWithMessage(() => injector.getSync(divide), InjectionError, "Dependency <divide> not found");
        assertThrowWithMessage(() => injector.getSync(divideToken), InjectionError, "Dependency InjectionToken(divide) not found");
    });

    it("reports the actual resolved function token in pass-through parameter diagnostics", () => {
        const divisorToken = new InjectionToken<number>("divisor");
        const divideToken1 = new InjectionToken<(dividend: number) => number>("divide-1");
        const divideToken2 = new InjectionToken<(dividend: number) => number>("divide-2");
        injector.setValue(10, divisorToken);
        injector.setFunction(divide, [ null, divisorToken ], { token: [ divideToken1, divideToken2 ] });

        const fn = injector.getSync(divideToken2);

        assertSame(fn(100), 10);
        assertThrowWithMessage(() => (fn as unknown as () => number)(), InjectionError,
            "Pass-through parameter 1 not found for dependency InjectionToken(divide-2)");
    });

    it("reports the raw function qualifier when a tokenized function is resolved by function", () => {
        const divisorToken = new InjectionToken<number>("divisor");
        const divideToken = new InjectionToken<(dividend: number) => number>("divide");
        injector.setValue(10, divisorToken);
        injector.setFunction(divide, [ null, divisorToken ], { token: divideToken });

        const fn = injector.getSync(divide);

        assertSame(fn(100), 10);
        assertThrowWithMessage(() => (fn as unknown as () => number)(), InjectionError,
            "Pass-through parameter 1 not found for dependency <divide>");
    });

    it("uses a readable fallback name for anonymous function dependencies", () => {
        const divisorToken = new InjectionToken<number>("divisor");
        const anonymous = [ (dividend: number, divisor: number) => dividend / divisor ][0];
        injector.setValue(10, divisorToken);
        injector.setFunction(anonymous, [ null, divisorToken ]);

        const fn = injector.getSync(anonymous);

        assertSame(fn(100), 10);
        assertThrowWithMessage(() => (fn as unknown as () => number)(), InjectionError,
            "Pass-through parameter 1 not found for dependency <anonymous function>");
    });

    it("treats empty function token arrays like no public token aliases", () => {
        const divisorToken = new InjectionToken<number>("divisor");
        const anonymous = [ (dividend: number, divisor: number) => dividend / divisor ][0];
        injector.setValue(10, divisorToken);
        injector.setFunction(anonymous, [ null, divisorToken ], { token: [] });

        const fn = injector.getSync(anonymous);

        assertSame(fn(100), 10);
        assertThrowWithMessage(() => (fn as unknown as () => number)(), InjectionError,
            "Pass-through parameter 1 not found for dependency <anonymous function>");
    });

    it("uses a readable fallback name for anonymous functions in generic qualifier errors", () => {
        const anonymous = [ () => 23 ][0];

        assertThrowWithMessage(() => injector.getSync(anonymous), InjectionError, "Dependency <anonymous function> not found");
    });

    it("supports transient function dependencies so child-scope overrides apply", () => {
        const userToken = new InjectionToken<string>("user");

        function getUser(user: string): string {
            return user;
        }

        injector.setFunction(getUser, [ userToken ], { lifetime: Lifetime.TRANSIENT });

        const child = createScope();
        injector.setValue("child", userToken, { scope: child });

        const first = injector.getSync(getUser, { scope: child });
        const second = injector.getSync(getUser, { scope: child });

        assertSame(first(), "child");
        assertSame(second(), "child");
        assertNotSame(first, second);
    });

    it("supports manual static factory methods using the class as receiver", () => {
        class Test {
            public readonly value: number;

            protected constructor(value: number) {
                this.value = value;
            }

            public static create(): Test {
                return new this(23);
            }
        }

        injector.setFactory(Test, Test.create);

        assertSame(injector.getSync(Test).value, 23);
    });

    it("snapshots inject arrays on registration", () => {
        abstract class BaseService {
            public abstract readonly name: string;
        }
        class ServiceA extends BaseService {
            public readonly name = "A";
        }
        class ServiceB extends BaseService {
            public readonly name = "B";
        }
        class Component {
            public readonly service: BaseService;

            public constructor(service: BaseService) {
                this.service = service;
            }
        }

        injector.setClass(ServiceA);
        injector.setClass(ServiceB);

        const classInject: [ typeof BaseService ] = [ ServiceA ];
        injector.setClass(Component, { inject: classInject, lifetime: Lifetime.TRANSIENT });
        classInject[0] = ServiceB;

        assertSame(injector.getSync(Component).service.name, "A");

        const tokenA = new InjectionToken<number>("A");
        const tokenB = new InjectionToken<number>("B");
        injector.setValue(10, tokenA);
        injector.setValue(20, tokenB);

        const functionInject: [ null, InjectionToken<number> ] = [ null, tokenA ];
        injector.setFunction(divide, functionInject);
        functionInject[1] = tokenB;

        assertSame(injector.getSync(divide)(100), 10);
    });

    it("registers values only under their tokens", () => {
        const valueToken = new InjectionToken<number>("value");

        injector.setValue(123, valueToken);

        assertSame(injector.getSync(valueToken), 123);
        assertSame(injector.has(Number), false);
        assertThrowWithMessage(() => injector.getSync(Number), InjectionError, "Dependency <Number> not found");
    });

    it("normalizes asynchronous value registrations to synchronous values once resolved", async () => {
        const valueToken = new InjectionToken<number>("value");

        injector.setValue(Promise.resolve(123), valueToken);

        assertSame(await injector.getAsync(valueToken), 123);
        assertSame(injector.getSync(valueToken), 123);
    });

    it("keeps rejected asynchronous value registrations cached as rejected promises", async () => {
        const valueToken = new InjectionToken<number>("value");
        const promise: Promise<number> = Promise.reject(new Error("boom"));

        void promise.catch(() => undefined);
        injector.setValue(promise, valueToken);

        await assertThrowWithMessage(() => injector.getAsync(valueToken), Error, "boom");
        await assertThrowWithMessage(() => injector.getAsync(valueToken), Error, "boom");
    });

    it("reports token context when asynchronous value registrations are invalidated", async () => {
        const valueToken = new InjectionToken<number>("value");
        let resolveValue!: (value: number) => void;

        injector.setValue(new Promise<number>(resolve => {
            resolveValue = resolve;
        }), valueToken);

        const promise = injector.getAsync(valueToken);
        assertSame(injector.remove(valueToken), true);
        resolveValue(23);

        await assertThrowWithMessage(() => promise, InjectionError,
            "Asynchronous dependency InjectionToken(value) was invalidated before creation completed");
    });

    it("reports all token aliases when asynchronous multi-token value registrations are invalidated", async () => {
        const valueToken1 = new InjectionToken<number>("value-1");
        const valueToken2 = new InjectionToken<number>("value-2");
        let resolveValue!: (value: number) => void;

        injector.setValue(new Promise<number>(resolve => {
            resolveValue = resolve;
        }), [ valueToken1, valueToken2 ]);

        const promise = injector.getAsync(valueToken2);
        assertSame(injector.remove(valueToken1), true);
        resolveValue(23);

        await assertThrowWithMessage(() => promise, InjectionError,
            "Asynchronous dependency one of [InjectionToken(value-1), InjectionToken(value-2)] was invalidated before creation completed");
    });

    it("prefers child-scope providers over root providers", () => {
        const nameToken = new InjectionToken<string>("name");
        injector.setValue("root", nameToken);
        const child = createScope();

        injector.setValue("child", nameToken, { scope: child });
        assertSame(injector.getSync(nameToken, { scope: child }), "child");
        assertSame(injector.has(nameToken, { scope: child }), true);

        assertSame(injector.getSync(nameToken), "root");
        assertSame(injector.has(nameToken), true);
    });

    it("injects the owner scope instead of the current child scope", () => {
        class Test {
            public readonly scope: Scope;

            public constructor(scope: Scope) {
                this.scope = scope;
            }
        }

        const parent = createScope();
        const child = createScope(parent);

        injector.setClass(Test, { scope: parent, inject: [ Scope ] });
        const test = injector.getSync(Test, { scope: child });

        assertSame(test.scope, parent);
    });

    it("resolves Scope and Injector directly from the current resolution scope", () => {
        assertSame(injector.getSync(Injector), injector);
        assertSame(injector.getSync(Scope), getRootScope());
        assertSame(injector.has(Injector), true);
        assertSame(injector.has(Scope), true);

        const child = createScope();
        assertSame(injector.getSync(Injector, { scope: child }), injector);
        assertSame(injector.getSync(Scope, { scope: child }), child);
        assertSame(injector.has(Injector, { scope: child }), true);
        assertSame(injector.has(Scope, { scope: child }), true);
    });

    it("returns false when removing built-in or unknown qualifiers", () => {
        class Test {}

        assertSame(injector.remove(Injector), false);
        assertSame(injector.remove(Scope), false);
        assertSame(injector.remove(Test), false);
        assertSame(injector.remove(new InjectionToken<number>("unknown")), false);
    });

    it("rejects explicit disposed scopes consistently", () => {
        const child = createScope();
        const valueToken = new InjectionToken<number>("value");

        child.dispose();

        assertThrowWithMessage(() => injector.getSync(Scope, { scope: child }), ScopeError, "Scope is disposed");
        assertThrowWithMessage(() => injector.getSync(Injector, { scope: child }), ScopeError, "Scope is disposed");
        assertThrowWithMessage(() => injector.has(valueToken, { scope: child }), ScopeError, "Scope is disposed");
        assertThrowWithMessage(() => injector.remove(valueToken, { scope: child }), ScopeError, "Scope is disposed");
        assertThrowWithMessage(() => injector.setValue(1, valueToken, { scope: child }), ScopeError, "Scope is disposed");
    });

    it("does not let root-owned providers capture child-local token values", () => {
        const userToken = new InjectionToken<string>("user");

        class Test {
            public readonly user: string;

            public constructor(user: string) {
                this.user = user;
            }
        }

        injector.setClass(Test, { inject: [ userToken ] });
        const child = createScope();
        injector.setValue("child", userToken, { scope: child });

        assertThrowWithMessage(() => injector.getSync(Test, { scope: child }), InjectionError, "Dependency InjectionToken(user) not found");

        injector.setClass(Test, { scope: child, inject: [ userToken ] });
        assertSame(injector.getSync(Test, { scope: child }).user, "child");
    });

    it("lets root-owned transient providers resolve child-local token values", () => {
        const userToken = new InjectionToken<string>("user");

        class Test {
            public readonly user: string;

            public constructor(user: string) {
                this.user = user;
            }
        }

        injector.setClass(Test, { inject: [ userToken ], lifetime: Lifetime.TRANSIENT });
        const child = createScope();
        injector.setValue("child", userToken, { scope: child });

        assertSame(injector.getSync(Test, { scope: child }).user, "child");
    });

    it("disposes singleton instances with their owning scope", () => {
        let disposed = 0;

        class Test {
            public [Symbol.dispose](): void {
                disposed++;
            }
        }

        const child = createScope();
        injector.setClass(Test, { scope: child });
        injector.getSync(Test, { scope: child });

        child.dispose();

        assertSame(disposed, 1);
    });

    it("disposes registered values with their owning scope even without resolving them", () => {
        let disposed = 0;

        class Test {
            public [Symbol.dispose](): void {
                disposed++;
            }
        }

        const child = createScope();
        const testToken = new InjectionToken<Test>("test");

        injector.setValue(new Test(), testToken, { scope: child });
        child.dispose();

        assertSame(disposed, 1);
    });

    it("rejects duplicate local registrations instead of replacing them", () => {
        const valueToken = new InjectionToken("value");

        class Test {}

        injector.setClass(Test);
        assertThrowWithMessage(() => injector.setClass(Test), InjectionError, "Dependency <Test> already registered in this scope");

        injector.setValue(23, valueToken);
        assertThrowWithMessage(() => injector.setValue(42, valueToken), InjectionError, "Dependency InjectionToken(value) already registered in this scope");
    });

    it("disposes removed singleton instances immediately", () => {
        let disposed = 0;

        class Test {
            public [Symbol.dispose](): void {
                disposed++;
            }
        }

        injector.setClass(Test);
        injector.getSync(Test);

        assertSame(injector.remove(Test), true);
        assertSame(disposed, 1);
    });

    it("disposes removed asynchronous singleton instances once they resolve", async () => {
        let resolveFirst!: (value: AsyncTest) => void;
        let firstDisposed = 0;

        class AsyncTest {
            readonly #onDispose: () => void;

            public constructor(onDispose: () => void) {
                this.#onDispose = onDispose;
            }

            public [Symbol.dispose](): void {
                this.#onDispose();
            }
        }

        injector.setFactory(AsyncTest, async () => new Promise<AsyncTest>(resolve => {
            resolveFirst = resolve;
        }));
        const firstPromise = injector.getAsync(AsyncTest);

        assertSame(injector.remove(AsyncTest), true);
        resolveFirst(new AsyncTest(() => {
            firstDisposed++;
        }));

        await assertThrowWithMessage(() => firstPromise, InjectionError,
            "Asynchronous dependency <AsyncTest> was invalidated before creation completed");
        assertSame(firstDisposed, 1);
    });

    it("disposes asynchronously resolved singletons when the owner scope is already gone", async () => {
        let disposed = 0;

        class Test {
            public [Symbol.dispose](): void {
                disposed++;
            }
        }

        const child = createScope();
        injector.setFactory(Test, async () => Promise.resolve(new Test()), { scope: child });
        const promise = injector.getAsync(Test, { scope: child });

        child.dispose();
        await assertThrowWithMessage(() => promise, InjectionError,
            "Asynchronous dependency <Test> was invalidated before creation completed");

        assertSame(disposed, 1);
    });

    it("reports asynchronous dependencies when resolved synchronously", () => {
        class Test {
            public static async create(): Promise<Test> {
                return Promise.resolve(new Test());
            }
        }

        injector.setFactory(Test, Test.create);

        assertThrowWithMessage(() => injector.getSync(Test), InjectionError, "Asynchronous dependency <Test> can not be resolved synchronously");
    });

    it("removes providers only from the specified scope", () => {
        const valueToken = new InjectionToken<number>("value");
        injector.setValue(1, valueToken);
        const child = createScope();
        injector.setValue(2, valueToken, { scope: child });

        assertSame(injector.remove(valueToken, { scope: child }), true);
        assertSame(injector.getSync(valueToken, { scope: child }), 1);

        assertSame(injector.getSync(valueToken), 1);
    });

    it("removes all aliases of one local provider registration", () => {
        abstract class Base {}
        class Impl extends Base {}
        const implToken = new InjectionToken<Base>("impl");
        const child = createScope();

        injector.setClass(Impl, { scope: child, token: implToken, provide: [ Base ] });

        assertSame(injector.remove(implToken, { scope: child }), true);
        assertThrowWithMessage(() => injector.getSync(Impl, { scope: child }), InjectionError, "Dependency <Impl> not found");
        assertThrowWithMessage(() => injector.getSync(Base, { scope: child }), InjectionError, "Dependency <Base> not found");
        assertThrowWithMessage(() => injector.getSync(implToken, { scope: child }), InjectionError, "Dependency InjectionToken(impl) not found");
    });

    it("supports asynchronous dependency graphs", async () => {
        class AsyncDep {
            public readonly value: number;

            private constructor(value: number) {
                this.value = value;
            }

            public static async create(): Promise<AsyncDep> {
                return Promise.resolve(new AsyncDep(23));
            }
        }
        class Test {
            public readonly dep: AsyncDep;

            public constructor(dep: AsyncDep) {
                this.dep = dep;
            }
        }

        injector.setFactory(AsyncDep, AsyncDep.create);
        injector.setClass(Test, { inject: [ AsyncDep ] });

        const result = injector.get(Test);
        assertInstanceOf(result, Promise);
        const test = await result;
        assertSame(test.dep.value, 23);
        assertSame(injector.getSync(Test), test);
    });

    it("retries failed asynchronous singleton factories", async () => {
        let attempts = 0;

        class Test {
            public static async create(): Promise<Test> {
                attempts++;
                if (attempts === 1) {
                    throw new Error("boom");
                }
                return new Test();
            }
        }

        injector.setFactory(Test, Test.create);

        await assertThrowWithMessage(() => injector.getAsync(Test), Error, "boom");
        assertInstanceOf(await injector.getAsync(Test), Test);
        assertSame(attempts, 2);
    });

    it("rejects invalid token typings at compile time", () => {
        const numberToken = new InjectionToken<number>("number");
        const stringToken = new InjectionToken<string>("string");
        const divideToken = new InjectionToken<(dividend: number) => number>("divide");
        const wrongDivideToken = new InjectionToken<typeof divide>("wrong-divide");

        class Test {}
        class FactoryTest {}

        void (() => {
            // @ts-expect-error Value registrations must specify a token
            injector.setValue("missing-token");
            // @ts-expect-error Value registrations must not use an empty token array
            injector.setValue(1, []);
            // @ts-expect-error Must not compile because token type does not match value type
            injector.setValue("wrong", numberToken);
            // @ts-expect-error Must not compile because token type does not match class type
            injector.setClass(Test, { token: stringToken });
            // @ts-expect-error Must not compile because token type does not match factory result type
            injector.setFactory(FactoryTest, () => new FactoryTest(), { token: stringToken });
            // @ts-expect-error Must not compile because token type does not match resolved function signature
            injector.setFunction(divide, [ null, numberToken ], { token: wrongDivideToken });
        });

        injector.setValue(2, numberToken);
        injector.setFunction(divide, [ null, numberToken ], { token: divideToken });

        const resolvedDivide = injector.getSync(divide);
        void ((fn: typeof resolvedDivide) => {
            fn();
            fn(10);
            fn(10, 2);

            // @ts-expect-error Must not compile because resolved raw function qualifiers must still preserve parameter types
            fn("wrong");
        });
    });

    it("rejects missing value tokens at runtime", () => {
        assertThrowWithMessage(() => (injector as unknown as { setValue(value: unknown, token?: unknown, options?: unknown): void }).setValue("missing-token"),
            InjectionError, "Value registrations require an injection token");
    });
});
