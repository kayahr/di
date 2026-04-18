/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { beforeEach, describe, it } from "node:test";

import { assertDefined, assertInstanceOf, assertNotSame, assertSame, assertThrowWithMessage } from "@kayahr/assert";
import { Scope, ScopeError, createScope, resetRootScope } from "@kayahr/scope";
import { InjectionToken } from "../main/InjectionToken.ts";
import { Injector, injectable, injector } from "../main/index.ts";
import { Lifetime } from "../main/Lifetime.ts";

class DepA { public a = 1; }
class DepB { public b = 2; }

describe("decorator", () => {
    beforeEach(() => {
        resetRootScope();
    });

    it("registers decorated classes in the default injector", () => {
        @injectable
        class Test {
            public value = 53;
        }

        const test = injector.getSync(Test);
        assertSame(injector.getSync(Test), test);
        assertSame(test.value, 53);
    });

    it("supports explicit decorator scopes", () => {
        const child = createScope();

        class Test {
            public readonly scope: Scope;

            public constructor(scope: Scope) {
                this.scope = scope;
            }
        }

        @injectable({ scope: child, inject: [ Scope ] })
        class ScopedTest extends Test {}
        assertSame(injector.has(ScopedTest, { scope: child }), true);
        assertSame(injector.getSync(ScopedTest, { scope: child }).scope, child);

        child.dispose();
        assertSame(injector.has(ScopedTest), false);
        assertThrowWithMessage(() => injector.has(ScopedTest, { scope: child }), ScopeError, "Scope is disposed");
    });

    it("supports @appInjector.injectable on custom injectors", () => {
        const appInjector = new Injector();

        @appInjector.injectable
        class AppService {
            public value = 42;
        }

        assertSame(appInjector.has(AppService), true);
        assertSame(injector.has(AppService), false);
        assertSame(appInjector.getSync(AppService).value, 42);
    });

    it("supports decorated type, token, and transient dependencies", () => {
        const depAToken = new InjectionToken<DepA>("dep-a");

        @injectable({ inject: [ depAToken, DepB ], lifetime: Lifetime.TRANSIENT })
        class Test {
            public readonly depA: DepA;
            public readonly depB: DepB;

            public constructor(
                depA: DepA,
                depB: DepB
            ) {
                this.depA = depA;
                this.depB = depB;
            }
        }

        injector.setClass(DepA, { token: depAToken });
        injector.setClass(DepB);

        const first = injector.getSync(Test);
        const second = injector.getSync(Test);

        assertNotSame(first, second);
        assertInstanceOf(first.depA, DepA);
        assertInstanceOf(first.depB, DepB);
    });

    it("supports decorated factory methods", async () => {
        class AsyncDep {
            public readonly value: number;

            private constructor(value: number) {
                this.value = value;
            }

            @injectable
            public static async create(): Promise<AsyncDep> {
                return Promise.resolve(new this(23));
            }
        }

        const dep = await injector.getAsync(AsyncDep);
        assertSame(dep.value, 23);
        assertSame(injector.getSync(AsyncDep), dep);
    });

    it("supports decorated factory methods with options", () => {
        const valueToken = new InjectionToken<number>("value");
        injector.setValue(23, valueToken);

        class Dep {
            public readonly value: number;

            private constructor(value: number) {
                this.value = value;
            }

            @injectable({ inject: [ valueToken ], lifetime: Lifetime.TRANSIENT })
            public static create(value: number): Dep {
                return new this(value);
            }
        }

        const first = injector.getSync(Dep);
        const second = injector.getSync(Dep);

        assertNotSame(first, second);
        assertSame(first.value, 23);
        assertSame(second.value, 23);
    });

    it("supports decorated token dependencies in child scopes", () => {
        const userToken = new InjectionToken<string>("user");
        const child = createScope();
        injector.setValue("alice", userToken, { scope: child });

        class Test {
            public readonly user: string;

            public constructor(user: string) {
                this.user = user;
            }
        }

        @injectable({ scope: child, inject: [ userToken ] })
        class ScopedTest extends Test {}
        assertSame(injector.getSync(ScopedTest, { scope: child }).user, "alice");

        assertSame(injector.has(ScopedTest), false);
        assertSame(injector.has(ScopedTest, { scope: child }), true);
    });

    it("rejects invalid decorator typings at compile time", () => {
        // @ts-expect-error Must not compile because inject array is empty
        @injectable({ inject: [] })
        class Test1 {
            public constructor(a: DepA, b: DepB) {
                void a;
                void b;
            }
        }

        // @ts-expect-error Must not compile because inject option is missing
        @injectable({})
        class Test2 {
            public constructor(a: DepA, b: DepB) {
                void a;
                void b;
            }
        }

        // @ts-expect-error Must not compile because null inject is not allowed for singletons
        @injectable({ inject: [ DepA, null ] })
        class Test3 {
            public constructor(a: DepA, b: DepB) {
                void a;
                void b;
            }
        }

        const stringToken = new InjectionToken<string>("wrong");

        // @ts-expect-error Must not compile because token type does not match decorated class type
        @injectable({ token: stringToken })
        class Test4 {
            public constructor(a: DepA) {
                void a;
            }
        }

        assertDefined([ Test1, Test2, Test3, Test4 ]);
    });
});
