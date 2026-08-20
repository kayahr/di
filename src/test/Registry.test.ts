/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { describe, it } from "node:test";

import { assertEquals, assertInstanceOf, assertSame, assertThrowWithMessage } from "@kayahr/assert";
import { createScope } from "@kayahr/scope";
import { Injectable } from "../main/Injectable.ts";
import { InjectionError } from "../main/InjectionError.ts";
import { InjectionToken } from "../main/InjectionToken.ts";
import { Registry } from "../main/Registry.ts";

describe("Registry", () => {
    it("registers explicit provided types and tokens", () => {
        abstract class Base {}
        class Test extends Base {}

        const token = new InjectionToken<Base>("impl");
        const registry = new Registry(createScope());
        const injectable = new Injectable({ type: Test, factory: () => new Test(), params: [], token, provide: Base });

        registry.register(injectable);

        assertSame(registry.get(Test), injectable);
        assertSame(registry.get(Base), injectable);
        assertSame(registry.get(token), injectable);
    });

    it("registers raw provided types when no token is present", () => {
        abstract class Base {}
        class Test extends Base {}

        const registry = new Registry(createScope());
        const injectable = new Injectable({ type: Test, factory: () => new Test(), params: [], provide: Base });

        registry.register(injectable);

        assertSame(registry.get(Test), injectable);
        assertSame(registry.get(Base), injectable);
    });

    it("rejects duplicate local qualifiers instead of replacing registrations", () => {
        class Test {}

        const token = new InjectionToken<Test>("test");
        const registry = new Registry(createScope());

        registry.register(new Injectable({ type: Test, factory: () => new Test(), params: [], token }));

        assertThrowWithMessage(
            () => registry.register(new Injectable({ type: Test, factory: () => new Test(), params: [], token })),
            InjectionError,
            "Dependency <Test> already registered in this scope"
        );
    });

    it("returns false for missing qualifiers and disposes through Symbol.dispose", async () => {
        let disposed = 0;

        class Test {
            public [Symbol.dispose](): void {
                disposed++;
            }
        }

        const registry = new Registry(createScope());
        const injectable = new Injectable({ type: Test, factory: () => new Test() });
        injectable.setInstance(new Test());

        assertSame(registry.remove(Test), false);

        registry.register(injectable);
        registry[Symbol.dispose]();
        registry[Symbol.dispose]();
        await registry.disposeAsync();

        assertSame(disposed, 1);
    });

    it("removes all qualifiers of one injectable", () => {
        abstract class Base {}
        class Test extends Base {}

        const token = new InjectionToken<Base>("impl");
        const registry = new Registry(createScope());
        const injectable = new Injectable({ type: Test, factory: () => new Test(), params: [], token, provide: Base });

        registry.register(injectable);

        assertSame(registry.remove(token), true);
        assertSame(registry.get(Test), undefined);
        assertSame(registry.get(Base), undefined);
        assertSame(registry.get(token), undefined);
    });

    it("disposes all owned injectables and aggregates disposal errors", () => {
        let secondDisposed = 0;
        let thirdDisposed = 0;
        let thrown: unknown = null;

        class First {
            public [Symbol.dispose](): void {
                throw new Error("first boom");
            }
        }

        class Second {
            public [Symbol.dispose](): void {
                secondDisposed++;
                throw new Error("second boom");
            }
        }

        class Third {
            public [Symbol.dispose](): void {
                thirdDisposed++;
            }
        }

        const registry = new Registry(createScope());

        const first = new Injectable({ type: First, factory: () => new First() });
        first.setInstance(new First());
        registry.register(first);

        const second = new Injectable({ type: Second, factory: () => new Second() });
        second.setInstance(new Second());
        registry.register(second);

        const third = new Injectable({ type: Third, factory: () => new Third() });
        third.setInstance(new Third());
        registry.register(third);

        try {
            registry.dispose();
        } catch (error) {
            thrown = error;
        }

        assertInstanceOf(thrown, AggregateError);
        assertSame(thrown.message, "Registry cleanup failed");
        assertEquals(thrown.errors.map(error => error instanceof Error ? error.message : String(error)), [ "second boom", "first boom" ]);
        assertSame(secondDisposed, 1);
        assertSame(thirdDisposed, 1);
    });

    it("requires asynchronous disposal for asynchronous instances and shares one disposal operation", async () => {
        const seen: string[] = [];
        let finish!: () => void;
        const finished = new Promise<void>(resolve => {
            finish = resolve;
        });

        class Test {
            public async [Symbol.asyncDispose](): Promise<void> {
                seen.push("start");
                await finished;
                seen.push("end");
            }
        }

        const scope = createScope();
        const registry = new Registry(scope);
        const injectable = new Injectable({ type: Test, factory: () => new Test() });
        registry.register(injectable);
        registry.setSingletonInstance(injectable, new Test());

        assertThrowWithMessage(() => registry.dispose(), InjectionError, "Registry requires asynchronous disposal");
        assertSame(registry.get(Test), injectable);

        const first = registry.disposeAsync();
        const second = registry[Symbol.asyncDispose]();

        assertSame(first, second);
        assertEquals(seen, [ "start" ]);
        finish();
        await first;

        assertEquals(seen, [ "start", "end" ]);
        assertSame(registry.disposeAsync(), first);
        registry.dispose();
        await scope.disposeAsync();
    });

    it("asynchronously disposes synchronous and asynchronous instances sequentially and aggregates failures", async () => {
        const seen: string[] = [];
        let thrown: unknown = null;

        class First {
            public async [Symbol.asyncDispose](): Promise<void> {
                seen.push("first start");
                await Promise.resolve();
                seen.push("first end");
                throw new Error("first boom");
            }
        }

        class Second {
            public [Symbol.dispose](): void {
                seen.push("second");
                throw new Error("second boom");
            }
        }

        class Third {
            public [Symbol.asyncDispose](): Promise<void> {
                seen.push("third async");
                return Promise.resolve();
            }

            public [Symbol.dispose](): void {
                seen.push("wrong third sync");
            }
        }

        const scope = createScope();
        const registry = new Registry(scope);
        for (const [ type, value ] of [ [ First, new First() ], [ Second, new Second() ], [ Third, new Third() ] ] as const) {
            const injectable = new Injectable({ type, factory: () => value });
            registry.register(injectable);
            registry.setSingletonInstance(injectable, value);
        }

        try {
            await registry.disposeAsync();
        } catch (error) {
            thrown = error;
        }

        assertInstanceOf(thrown, AggregateError);
        assertSame(thrown.message, "Registry cleanup failed");
        assertEquals(thrown.errors.map(error => error instanceof Error ? error.message : String(error)), [ "second boom", "first boom" ]);
        assertEquals(seen, [ "third async", "second", "first start", "first end" ]);
        await assertThrowWithMessage(() => scope.disposeAsync(), AggregateError, "Scope cleanup failed");
    });

    it("asynchronously removes all qualifiers and prefers asynchronous disposal", async () => {
        abstract class Base {}
        class Test extends Base {
            public readonly seen: string[] = [];

            public [Symbol.asyncDispose](): Promise<void> {
                this.seen.push("async");
                return Promise.resolve();
            }

            public [Symbol.dispose](): void {
                this.seen.push("sync");
            }
        }

        const token = new InjectionToken<Base>("impl");
        const scope = createScope();
        const registry = new Registry(scope);
        const injectable = new Injectable({ type: Test, factory: () => new Test(), token, provide: Base });
        const instance = new Test();
        registry.register(injectable);
        registry.setSingletonInstance(injectable, instance);

        assertThrowWithMessage(() => registry.remove(token), InjectionError,
            "Dependency InjectionToken(impl) requires asynchronous disposal");
        assertSame(registry.get(Test), injectable);
        assertSame(await registry.removeAsync(new InjectionToken("missing")), false);
        assertSame(await registry.removeAsync(token), true);
        assertSame(registry.get(Test), undefined);
        assertSame(registry.get(Base), undefined);
        assertSame(registry.get(token), undefined);
        assertEquals(instance.seen, [ "async" ]);
        await scope.disposeAsync();
    });

    it("does not dispose the owning scope when it is stored as a value", () => {
        const scope = createScope();
        const registry = new Registry(scope);
        const injectable = new Injectable({ type: Object, factory: () => scope });
        registry.register(injectable);
        registry.setSingletonInstance(injectable, scope);

        registry.dispose();

        assertSame(scope.isDisposed(), false);
        scope.dispose();
    });
});
