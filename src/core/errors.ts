/**
 * JooneError — Structured error hierarchy for the Joone agent.
 *
 * Every error in the system carries:
 * - `category`: A machine-readable classification (e.g., "llm_api", "sandbox", "tool").
 * - `retryable`: Whether the operation that caused this error is safe to retry.
 * - `context`: Arbitrary structured metadata for debugging.
 * - `toRecoveryHint()`: A human-readable string the LLM can use to self-correct.
 */

export type ErrorCategory = "llm_api" | "sandbox" | "tool" | "config" | "network" | "unknown";

export class JooneError extends Error {
    public readonly category: ErrorCategory;
    public readonly retryable: boolean;
    public readonly context: Record<string, unknown>;

    constructor(
        message: string,
        opts: {
            category: ErrorCategory;
            retryable: boolean;
            context?: Record<string, unknown>;
            cause?: Error;
        }
    ) {
        super(message);
        this.name = "JooneError";
        this.category = opts.category;
        this.retryable = opts.retryable;
        this.context = opts.context ?? {};
        if (opts.cause) {
            this.cause = opts.cause;
        }
    }

    /**
     * Returns a hint string that can be injected into the LLM's conversation
     * so it can adapt its behavior instead of crashing.
     */
    toRecoveryHint(): string {
        return `[SYSTEM ERROR — ${this.category.toUpperCase()}]: ${this.message}`;
    }
}

// ─── LLM API Errors ─────────────────────────────────────────────────────────────

export class LLMApiError extends JooneError {
    public readonly statusCode: number | undefined;
    public readonly provider: string;

    constructor(
        message: string,
        opts: {
            statusCode?: number;
            provider: string;
            retryable: boolean;
            headers?: Record<string, string>;
            cause?: Error;
        }
    ) {
        super(message, {
            category: "llm_api",
            retryable: opts.retryable,
            context: {
                statusCode: opts.statusCode,
                provider: opts.provider,
                retryAfter: opts.headers?.["retry-after"],
            },
            cause: opts.cause,
        });
        this.name = "LLMApiError";
        this.statusCode = opts.statusCode;
        this.provider = opts.provider;
    }

    toRecoveryHint(): string {
        if (this.statusCode === 429) {
            const retryAfter = this.context.retryAfter;
            return (
                `[SYSTEM ERROR — RATE LIMITED]: The ${this.provider} API returned a 429 rate limit error. ` +
                (retryAfter
                    ? `Retry after ${retryAfter} seconds. `
                    : "Wait a moment before trying again. ") +
                "Consider simplifying your request or reducing the number of tool calls per turn."
            );
        }
        if (this.statusCode === 401 || this.statusCode === 403) {
            return (
                `[SYSTEM ERROR — AUTH FAILURE]: The ${this.provider} API rejected the credentials (HTTP ${this.statusCode}). ` +
                "This is a fatal configuration error. Ask the user to verify their API key."
            );
        }
        return (
            `[SYSTEM ERROR — LLM API]: The ${this.provider} API returned an error` +
            (this.statusCode ? ` (HTTP ${this.statusCode})` : "") +
            `. ${this.message}`
        );
    }
}

// ─── Sandbox Errors ──────────────────────────────────────────────────────────────

export class SandboxError extends JooneError {
    public readonly sandboxProvider: string;

    constructor(
        message: string,
        opts: {
            sandboxProvider: string;
            retryable: boolean;
            cause?: Error;
        }
    ) {
        super(message, {
            category: "sandbox",
            retryable: opts.retryable,
            context: { sandboxProvider: opts.sandboxProvider },
            cause: opts.cause,
        });
        this.name = "SandboxError";
        this.sandboxProvider = opts.sandboxProvider;
    }

    toRecoveryHint(): string {
        return (
            `[SYSTEM ERROR — SANDBOX]: The ${this.sandboxProvider} sandbox encountered an error: ${this.message}. ` +
            "The sandbox may have been recycled. Try running the command again."
        );
    }
}

// ─── Tool Execution Errors ───────────────────────────────────────────────────────

export class ToolExecutionError extends JooneError {
    public readonly toolName: string;

    constructor(
        message: string,
        opts: {
            toolName: string;
            args?: Record<string, unknown>;
            retryable: boolean;
            cause?: Error;
        }
    ) {
        super(message, {
            category: "tool",
            retryable: opts.retryable,
            context: { toolName: opts.toolName, args: opts.args },
            cause: opts.cause,
        });
        this.name = "ToolExecutionError";
        this.toolName = opts.toolName;
    }

    toRecoveryHint(): string {
        return (
            `[SYSTEM ERROR — TOOL]: The tool "${this.toolName}" failed: ${this.message}. ` +
            "Try a different approach or check the arguments you passed."
        );
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);
const RETRYABLE_ERROR_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"]);
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404]);

/**
 * Wraps a raw provider error into a structured `LLMApiError`.
 * Inspects the error for HTTP status codes, network error codes, etc.
 */
export function wrapLLMError(error: unknown, provider: string): LLMApiError {
    if (error instanceof LLMApiError) return error;

    const err = error instanceof Error ? error : new Error(String(error));
    const statusCode = (err as any).status ?? (err as any).statusCode ?? (err as any).response?.status;
    const headers = (err as any).response?.headers ?? {};
    const code = (err as any).code as string | undefined;

    let retryable = false;
    if (typeof statusCode === "number") {
        retryable = RETRYABLE_STATUS_CODES.has(statusCode);
    } else if (code && RETRYABLE_ERROR_CODES.has(code)) {
        retryable = true;
    }

    // Non-retryable overrides
    if (typeof statusCode === "number" && NON_RETRYABLE_STATUS_CODES.has(statusCode)) {
        retryable = false;
    }

    return new LLMApiError(err.message, {
        statusCode,
        provider,
        retryable,
        headers,
        cause: err,
    });
}
