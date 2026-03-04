import { describe, it, expect } from "vitest";
import { retryWithBackoff } from "../../src/core/retry.js";
import { JooneError, LLMApiError, ToolExecutionError, SandboxError, wrapLLMError } from "../../src/core/errors.js";

// ─── retryWithBackoff ─────────────────────────────────────────────────────────

describe("retryWithBackoff", () => {
    it("should return immediately on success", async () => {
        const result = await retryWithBackoff(async () => "ok");
        expect(result).toBe("ok");
    });

    it("should retry retryable JooneErrors up to maxRetries", async () => {
        let attempts = 0;
        const fn = async () => {
            attempts++;
            if (attempts < 3) {
                throw new JooneError("transient", { category: "network", retryable: true });
            }
            return "recovered";
        };

        const result = await retryWithBackoff(fn, { maxRetries: 3, initialDelayMs: 10, maxJitterMs: 5 });
        expect(result).toBe("recovered");
        expect(attempts).toBe(3);
    });

    it("should throw immediately on non-retryable JooneError", async () => {
        const fn = async () => {
            throw new JooneError("auth failure", { category: "config", retryable: false });
        };

        await expect(retryWithBackoff(fn, { maxRetries: 3, initialDelayMs: 10 }))
            .rejects.toThrow("auth failure");
    });

    it("should throw immediately on raw non-JooneError", async () => {
        const fn = async () => {
            throw new Error("random crash");
        };

        await expect(retryWithBackoff(fn, { maxRetries: 3, initialDelayMs: 10 }))
            .rejects.toThrow("random crash");
    });

    it("should call onRetry callback before each retry", async () => {
        const retries: number[] = [];
        let attempts = 0;

        const fn = async () => {
            attempts++;
            if (attempts <= 2) {
                throw new JooneError("transient", { category: "network", retryable: true });
            }
            return "ok";
        };

        await retryWithBackoff(fn, {
            maxRetries: 3,
            initialDelayMs: 10,
            maxJitterMs: 0,
            onRetry: (attempt) => retries.push(attempt),
        });

        expect(retries).toEqual([1, 2]);
    });

    it("should throw the last error after all retries exhausted", async () => {
        const fn = async () => {
            throw new JooneError("always fails", { category: "llm_api", retryable: true });
        };

        await expect(retryWithBackoff(fn, { maxRetries: 2, initialDelayMs: 10, maxJitterMs: 0 }))
            .rejects.toThrow("always fails");
    });
});

// ─── JooneError hierarchy ────────────────────────────────────────────────────

describe("JooneError hierarchy", () => {
    it("LLMApiError produces a rate-limit recovery hint for 429", () => {
        const err = new LLMApiError("Too Many Requests", {
            statusCode: 429,
            provider: "anthropic",
            retryable: true,
            headers: { "retry-after": "30" },
        });

        expect(err.retryable).toBe(true);
        expect(err.category).toBe("llm_api");
        expect(err.toRecoveryHint()).toContain("RATE LIMITED");
        expect(err.toRecoveryHint()).toContain("30 seconds");
    });

    it("LLMApiError produces a fatal hint for 401", () => {
        const err = new LLMApiError("Unauthorized", {
            statusCode: 401,
            provider: "openai",
            retryable: false,
        });

        expect(err.retryable).toBe(false);
        expect(err.toRecoveryHint()).toContain("AUTH FAILURE");
    });

    it("ToolExecutionError wraps tool metadata", () => {
        const err = new ToolExecutionError("file not found", {
            toolName: "read_file",
            args: { path: "/foo.txt" },
            retryable: false,
        });

        expect(err.toolName).toBe("read_file");
        expect(err.toRecoveryHint()).toContain('read_file');
        expect(err.toRecoveryHint()).toContain("file not found");
    });

    it("SandboxError produces a sandbox-specific hint", () => {
        const err = new SandboxError("container died", {
            sandboxProvider: "e2b",
            retryable: true,
        });

        expect(err.retryable).toBe(true);
        expect(err.toRecoveryHint()).toContain("e2b sandbox");
    });
});

// ─── wrapLLMError ─────────────────────────────────────────────────────────────

describe("wrapLLMError", () => {
    it("marks 429 as retryable", () => {
        const raw = Object.assign(new Error("rate limited"), { status: 429 });
        const wrapped = wrapLLMError(raw, "anthropic");

        expect(wrapped).toBeInstanceOf(LLMApiError);
        expect(wrapped.retryable).toBe(true);
        expect(wrapped.statusCode).toBe(429);
    });

    it("marks 401 as non-retryable", () => {
        const raw = Object.assign(new Error("bad key"), { status: 401 });
        const wrapped = wrapLLMError(raw, "openai");

        expect(wrapped.retryable).toBe(false);
    });

    it("marks ECONNRESET as retryable", () => {
        const raw = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
        const wrapped = wrapLLMError(raw, "google");

        expect(wrapped.retryable).toBe(true);
    });

    it("passes through an existing LLMApiError unchanged", () => {
        const original = new LLMApiError("already wrapped", {
            statusCode: 500,
            provider: "test",
            retryable: true,
        });
        const result = wrapLLMError(original, "ignored");
        expect(result).toBe(original);
    });
});
