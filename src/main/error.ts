/*
 * Copyright (C) 2026 Klaus Reimer
 * SPDX-License-Identifier: MIT
 */

/**
 * Normalizes thrown values to {@link Error} instances.
 *
 * @param error - The thrown value.
 * @returns The normalized error.
 */
function toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

/**
 * Returns whether the collected failures array is non-empty.
 *
 * Use this before calling {@link throwErrors} when it is not already guaranteed that at least one failure exists.
 *
 * @param errors - The collected failures to test.
 * @returns True when at least one failure was collected.
 */
export function hasErrors(errors: readonly unknown[]): errors is readonly [unknown, ...unknown[]] {
    return errors.length > 0;
}

/**
 * Throws the given collected failures normalized to {@link Error}.
 *
 * Nested {@link AggregateError} instances are flattened recursively before deciding whether to throw one normalized error directly or
 * a new aggregate error.
 *
 * If it is not already guaranteed that at least one failure exists then call {@link hasErrors} first.
 *
 * @param errors            - The collected failures to throw.
 * @param aggregateMessage  - Message for aggregate failures.
 * @throws {@link !Error} - The single normalized failure when exactly one error was collected.
 * @throws {@link !AggregateError} - The normalized failures when multiple errors were collected.
 */
export function throwErrors(errors: readonly [unknown, ...unknown[]], aggregateMessage: string): never {
    const normalizedErrors = flattenErrors(errors);
    if (normalizedErrors.length === 1) {
        throw normalizedErrors[0];
    }
    throw new AggregateError(normalizedErrors, aggregateMessage);
}

/**
 * Flattens nested aggregate errors and normalizes all failures to {@link Error}.
 *
 * @param errors - The collected failures to flatten and normalize.
 * @returns The flattened normalized errors.
 */
function flattenErrors(errors: readonly unknown[]): Error[] {
    const flattenedErrors: Error[] = [];
    for (const error of errors) {
        if (error instanceof AggregateError) {
            flattenedErrors.push(...flattenErrors(error.errors));
        } else {
            flattenedErrors.push(toError(error));
        }
    }
    return flattenedErrors;
}
