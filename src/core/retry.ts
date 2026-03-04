import { JooneError } from "./errors.js";

export interface RetryOptions {
    /** Maximum number of retry attempts. Default: 3. */
    maxRetries?: number;
    /** Initial delay in milliseconds before the first retry. Default: 1000. */
    initialDelayMs?: number;
    /** Maximum jitter in milliseconds added/subtracted from each delay. Default: 500. */
    maxJitterMs?: number;
    /** Optional callback invoked before each retry. */
    onRetry?: (attempt: number, error: JooneError, delayMs: number) => void;
}

/**
 * Executes an async function with exponential backoff retry logic.
 *
 * - Retries only if the caught error is a `JooneError` with `retryable === true`.
 * - Non-retryable errors are re-thrown immediately.
 * - Raw (non-JooneError) errors are re-thrown immediately.
 * - Delays double with each attempt: 1s → 2s → 4s (+ random jitter).
 *
 * @param fn - The async function to execute.
 * @param opts - Retry configuration.
 * @returns The result of `fn` on success.
 * @throws The last error encountered after all retries are exhausted, or any non-retryable error.
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    opts: RetryOptions = {}
): Promise<T> {
    const {
        maxRetries = 3,
        initialDelayMs = 1000,
        maxJitterMs = 500,
        onRetry,
    } = opts;

    let lastError: JooneError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: unknown) {
            // Only retry JooneErrors that are explicitly marked retryable
            if (error instanceof JooneError && error.retryable) {
                lastError = error;

                if (attempt < maxRetries) {
                    const baseDelay = initialDelayMs * Math.pow(2, attempt);
                    const jitter = Math.floor(Math.random() * maxJitterMs * 2) - maxJitterMs;
                    const delay = Math.max(0, baseDelay + jitter);

                    if (onRetry) {
                        onRetry(attempt + 1, error, delay);
                    }

                    await sleep(delay);
                    continue;
                }
            }

            // Non-retryable or non-JooneError: propagate immediately
            if (!(error instanceof JooneError) || !error.retryable) {
                throw error;
            }
        }
    }

    // All retries exhausted
    throw lastError!;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
