/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

import { describe, it } from "node:test";

import { assertEquals } from "@kayahr/assert";
import * as exports from "../main/index.ts";
import { InjectionError } from "../main/InjectionError.ts";
import { InjectionToken } from "../main/InjectionToken.ts";
import {
    type FunctionInject,
    type FunctionOptions,
    type FunctionPassThroughParams,
    type InjectableOptions,
    type InjectedFunction,
    Injector,
    type ResolveOptions,
    type ResolvedFunction,
    type TokenOptions,
    injectable,
    injector
} from "../main/Injector.ts";
import { Lifetime } from "../main/Lifetime.ts";
import type { InjectableDecorator, InjectableDecoratorFactory } from "../main/decorator.ts";
import type { NullableQualifier, NullableQualifiers, Qualifier, Qualifiers } from "../main/Qualifier.ts";
import type { Class, Constructor, Factory } from "../main/types.ts";

describe("index", () => {
    it("exports relevant types and functions and nothing more", () => {
        assertEquals({ ...exports }, {
            Injector,
            InjectionToken,
            Lifetime,
            injector,
            injectable,
            InjectionError
        });

        ((): InjectableOptions => (({} as exports.InjectableOptions)))();
        ((): FunctionOptions => (({} as exports.FunctionOptions)))();
        ((): ResolveOptions => (({} as exports.ResolveOptions)))();
        ((): TokenOptions => (({} as exports.TokenOptions)))();
        ((): Class => (({} as exports.Class)))();
        ((): Constructor => (({} as exports.Constructor)))();
        ((): Factory => (({} as exports.Factory)))();
        ((): Qualifier => (({} as exports.Qualifier)))();
        ((): Qualifiers => (({} as exports.Qualifiers)))();
        ((): NullableQualifier => (({} as exports.NullableQualifier)))();
        ((): NullableQualifiers => (({} as exports.NullableQualifiers)))();
        ((): FunctionInject<[ string, number ]> => (({} as exports.FunctionInject<[ string, number ]>)))();
        ((): FunctionPassThroughParams<[ string, number ], [ null, InjectionToken<number> ]> =>
            (({} as exports.FunctionPassThroughParams<[ string, number ], [ null, InjectionToken<number> ]>)))();
        ((): InjectedFunction<[ string, number ], [ null, InjectionToken<number> ], boolean> =>
            (({} as exports.InjectedFunction<[ string, number ], [ null, InjectionToken<number> ], boolean>)))();
        ((): ResolvedFunction<[ string, number ], boolean> => (({} as exports.ResolvedFunction<[ string, number ], boolean>)))();
        ((): InjectableDecorator => (({} as exports.InjectableDecorator)))();
        ((): InjectableDecoratorFactory => (({} as exports.InjectableDecoratorFactory)))();
    });
});
