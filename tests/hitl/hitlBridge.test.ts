import { describe, it, expect, vi, beforeEach } from "vitest";
import { HITLBridge } from "../../src/hitl/bridge.js";
import { PermissionMiddleware } from "../../src/middleware/permission.js";

describe("HITLBridge", () => {
    beforeEach(() => {
        HITLBridge.resetInstance();
    });

    it("resolves askUser when the TUI calls resolveAnswer", async () => {
        const bridge = HITLBridge.getInstance(1000);

        // Simulate TUI responding to a question
        bridge.on("question", (q) => {
            setTimeout(() => bridge.resolveAnswer(q.id, "TypeScript"), 50);
        });

        const answer = await bridge.askUser("What language?");
        expect(answer).toBe("TypeScript");
    });

    it("auto-resolves askUser on timeout with no-response message", async () => {
        const bridge = HITLBridge.getInstance(100); // 100ms timeout for test speed

        const answer = await bridge.askUser("Are you there?");
        expect(answer).toContain("No response");
    });

    it("resolves requestPermission to true on 'y' answer", async () => {
        const bridge = HITLBridge.getInstance(1000);

        bridge.on("permission", (p) => {
            setTimeout(() => bridge.resolveAnswer(p.id, "y"), 50);
        });

        const approved = await bridge.requestPermission("bash", { command: "rm -rf /" });
        expect(approved).toBe(true);
    });

    it("resolves requestPermission to false on 'n' answer", async () => {
        const bridge = HITLBridge.getInstance(1000);

        bridge.on("permission", (p) => {
            setTimeout(() => bridge.resolveAnswer(p.id, "n"), 50);
        });

        const approved = await bridge.requestPermission("bash", { command: "ls" });
        expect(approved).toBe(false);
    });

    it("auto-denies requestPermission on timeout", async () => {
        const bridge = HITLBridge.getInstance(100);

        const approved = await bridge.requestPermission("bash", { command: "ls" });
        expect(approved).toBe(false);
    });
});

describe("PermissionMiddleware", () => {
    it("passes through all tools in 'auto' mode", async () => {
        const mw = new PermissionMiddleware("auto");
        const ctx = { toolName: "bash", args: { command: "ls" }, callId: "1" };

        const result = await mw.before!(ctx);
        expect(result).toEqual(ctx); // Unchanged
    });

    it("allows safe tools in 'ask_dangerous' mode without asking", async () => {
        const mw = new PermissionMiddleware("ask_dangerous");
        const ctx = { toolName: "read_file", args: { path: "/foo" }, callId: "2" };

        const result = await mw.before!(ctx);
        expect(result).toEqual(ctx);
    });

    it("blocks dangerous tools in 'ask_dangerous' mode when denied", async () => {
        HITLBridge.resetInstance();
        const bridge = HITLBridge.getInstance(100); // Auto-deny on timeout

        const mw = new PermissionMiddleware("ask_dangerous");
        const ctx = { toolName: "bash", args: { command: "rm -rf /" }, callId: "3" };

        const result = await mw.before!(ctx);
        // Should return short-circuit string (denial)
        expect(typeof result).toBe("string");
        expect(result as string).toContain("Permission denied");
    });

    it("allows dangerous tools in 'ask_dangerous' mode when approved", async () => {
        HITLBridge.resetInstance();
        const bridge = HITLBridge.getInstance(5000);

        bridge.on("permission", (p) => {
            setTimeout(() => bridge.resolveAnswer(p.id, "yes"), 50);
        });

        const mw = new PermissionMiddleware("ask_dangerous");
        const ctx = { toolName: "bash", args: { command: "ls" }, callId: "4" };

        const result = await mw.before!(ctx);
        expect(result).toEqual(ctx); // Approved, return context
    });

    it("blocks non-safe tools in 'ask_all' mode when denied", async () => {
        HITLBridge.resetInstance();
        const bridge = HITLBridge.getInstance(100);

        const mw = new PermissionMiddleware("ask_all");
        const ctx = { toolName: "run_tests", args: {}, callId: "5" };

        const result = await mw.before!(ctx);
        expect(typeof result).toBe("string");
        expect(result as string).toContain("Permission denied");
    });
});
