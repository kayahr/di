/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { describe, it } from "node:test";

import { assertSame } from "@kayahr/assert";
import { InjectionToken } from "../main/InjectionToken.ts";

describe("InjectionToken", () => {
    it("renders debug output with and without descriptions", () => {
        assertSame(new InjectionToken<number>().toString(), "InjectionToken");
        assertSame(new InjectionToken<number>(null).toString(), "InjectionToken");
        assertSame(new InjectionToken<number>("number").toString(), "InjectionToken(number)");
    });
});
