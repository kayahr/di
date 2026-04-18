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

    it("returns false for missing qualifiers and disposes through Symbol.dispose", () => {
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
        assertEquals(thrown.errors.map(error => error instanceof Error ? error.message : String(error)), [ "first boom", "second boom" ]);
        assertSame(secondDisposed, 1);
        assertSame(thirdDisposed, 1);
    });
});
