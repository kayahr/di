/*
 * Copyright (C) 2025 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

/**
 * Thrown when some dependency injection related operation fails.
 */
export class InjectionError extends Error {
    /** @inheritdoc */
    public override name = "InjectionError";
}
