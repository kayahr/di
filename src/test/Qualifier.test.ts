/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { describe, it } from "node:test";

import { assertSame } from "@kayahr/assert";
import { InjectionToken } from "../main/InjectionToken.ts";
import { Qualifier } from "../main/Qualifier.ts";

describe("Qualifier", () => {
    it("renders anonymous functions clearly", () => {
        const anonymous = [ () => 23 ][0];

        assertSame(Qualifier.toString(anonymous), "<anonymous function>");
    });

    it("renders empty and multi-qualifier diagnostic labels", () => {
        const token1 = new InjectionToken<number>("value-1");
        const token2 = new InjectionToken<number>("value-2");

        assertSame(Qualifier.toStrings([]), "<unknown dependency>");
        assertSame(Qualifier.toStrings([ token1, token2 ]),
            "one of [InjectionToken(value-1), InjectionToken(value-2)]");
    });
});
