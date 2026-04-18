/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

/**
 * The supported dependency lifetimes.
 */
export const Lifetime = {
    /** One shared instance per owning scope. */
    SINGLETON: 0,

    /** A new instance is created on every resolve. */
    TRANSIENT: 1
} as const;

/**
 * The enum type of supported dependency lifetimes.
 */
export type Lifetime = typeof Lifetime[keyof typeof Lifetime];
