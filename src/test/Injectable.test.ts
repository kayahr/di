/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { describe, it } from "node:test";

import { assertSame, assertThrowWithMessage } from "@kayahr/assert";
import { Injectable } from "../main/Injectable.ts";
import { InjectionError } from "../main/InjectionError.ts";
import { InjectionToken } from "../main/InjectionToken.ts";

describe("Injectable", () => {
    it("reports whether a factory exists", () => {
        class Test {}

        assertSame(new Injectable({ type: Test, factory: () => new Test() }).hasFactory(), true);
        assertSame(new Injectable({ type: Test, factory: null }).hasFactory(), false);
    });

    it("rejects creating instances for eager value registrations without a factory", () => {
        class Test {}

        const injectable = new Injectable({ type: Test, factory: null });

        assertThrowWithMessage(() => injectable.create([], Test), InjectionError, "Factory not set");
    });

    it("sets and replaces cached instances", async () => {
        class Test {}

        const injectable = new Injectable({ type: Test, factory: () => new Test() });
        const pending = Promise.resolve(new Test());
        const resolved = new Test();

        assertSame(injectable.setInstance(pending), pending);
        assertSame(injectable.getInstance(), pending);
        assertSame(injectable.setInstance(resolved), resolved);
        assertSame(injectable.getInstance(), resolved);
    });

    it("copies params, token arrays, and provide arrays", () => {
        abstract class Base1 {}
        abstract class Base2 {}
        class Test extends Base1 {}

        const params: Array<null | typeof Test> = [ null ];
        const token1 = new InjectionToken<Test>("one");
        const token2 = new InjectionToken<Test>("two");
        const token = [ token1 ];
        const provide = [ Base1 ];
        const injectable = new Injectable({
            type: Test,
            factory: () => new Test(),
            params,
            token,
            provide
        });

        params.push(Test);
        token.push(token2);
        provide.push(Base2);

        assertSame(injectable.getParams().length, 1);
        assertSame(injectable.getParams()[0], null);
        assertSame(injectable.getQualifiers().length, 3);
        assertSame(injectable.getQualifiers()[0], Test);
        assertSame(injectable.getQualifiers()[1], Base1);
        assertSame(injectable.getQualifiers()[2], token1);
    });
});
