import { describe, it, expect, vi } from "vitest";
import { MiddlewarePipeline } from "../middleware/pipeline.js";
import { ToolCallContext, ToolMiddleware } from "../middleware/types.js";
import { LoopDetectionMiddleware } from "../middleware/loopDetection.js";
import { CommandSanitizerMiddleware } from "../middleware/commandSanitizer.js";
import { PreCompletionMiddleware } from "../middleware/preCompletion.js";

// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline Core
// ═══════════════════════════════════════════════════════════════════════════════

describe("MiddlewarePipeline", () => {
  const makeCtx = (overrides?: Partial<ToolCallContext>): ToolCallContext => ({
    toolName: "bash",
    args: { command: "echo hello" },
    callId: "call-1",
    ...overrides,
  });

  // ─── Test #44: Runs before/after hooks in order ───

  it("runs before hooks in registration order and after hooks in reverse", async () => {
    const order: string[] = [];

    const pipeline = new MiddlewarePipeline();
    pipeline.use({
      name: "A",
      before: (ctx) => { order.push("A:before"); return ctx; },
      after: (_ctx, r) => { order.push("A:after"); return r; },
    });
    pipeline.use({
      name: "B",
      before: (ctx) => { order.push("B:before"); return ctx; },
      after: (_ctx, r) => { order.push("B:after"); return r; },
    });

    const executeFn = vi.fn(async () => "result");
    await pipeline.run(makeCtx(), executeFn);

    expect(order).toEqual(["A:before", "B:before", "B:after", "A:after"]);
    expect(executeFn).toHaveBeenCalledOnce();
  });

  // ─── Test #45: Short-circuits when before returns string ───

  it("short-circuits and does NOT execute the tool when before returns a string", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use({
      name: "Blocker",
      before: () => "⚠ Blocked!",
    });

    const executeFn = vi.fn(async () => "should not reach this");
    const result = await pipeline.run(makeCtx(), executeFn);

    expect(result).toBe("⚠ Blocked!");
    expect(executeFn).not.toHaveBeenCalled();
  });

  // ─── Test #46: After hooks can transform the result ───

  it("after hooks can transform the tool result", async () => {
    const pipeline = new MiddlewarePipeline();
    pipeline.use({
      name: "Uppercaser",
      after: (_ctx, result) => result.toUpperCase(),
    });

    const result = await pipeline.run(makeCtx(), async () => "hello");

    expect(result).toBe("HELLO");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LoopDetectionMiddleware
// ═══════════════════════════════════════════════════════════════════════════════

describe("LoopDetectionMiddleware", () => {
  const makeCtx = (cmd = "echo hello"): ToolCallContext => ({
    toolName: "bash",
    args: { command: cmd },
    callId: "call-x",
  });

  // ─── Test #47: Allows first 2 identical calls ───

  it("allows calls below the threshold", () => {
    const mw = new LoopDetectionMiddleware(3);

    expect(mw.before(makeCtx())).toEqual(makeCtx());
    expect(mw.before(makeCtx())).toEqual(makeCtx());
  });

  // ─── Test #48: Blocks on 3rd identical call ───

  it("blocks on the Nth identical consecutive call", () => {
    const mw = new LoopDetectionMiddleware(3);

    mw.before(makeCtx());
    mw.before(makeCtx());
    const result = mw.before(makeCtx());

    expect(typeof result).toBe("string");
    expect(result as string).toMatch(/loop detected/i);
  });

  // ─── Test #49: Resets when args change ───

  it("resets the count when a different call is made", () => {
    const mw = new LoopDetectionMiddleware(3);

    mw.before(makeCtx("echo a"));
    mw.before(makeCtx("echo a"));
    // Different call breaks the streak
    mw.before(makeCtx("echo b"));
    // Back to "echo a" — only 1 in a row now
    const result = mw.before(makeCtx("echo a"));

    expect(typeof result).not.toBe("string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CommandSanitizerMiddleware
// ═══════════════════════════════════════════════════════════════════════════════

describe("CommandSanitizerMiddleware", () => {
  const mw = new CommandSanitizerMiddleware();

  const makeCtx = (cmd: string): ToolCallContext => ({
    toolName: "bash",
    args: { command: cmd },
    callId: "call-x",
  });

  // ─── Test #50: Blocks rm -rf / ───

  it("blocks rm -rf /", () => {
    const result = mw.before(makeCtx("rm -rf /"));
    expect(typeof result).toBe("string");
    expect(result as string).toMatch(/blocked/i);
  });

  // ─── Test #51: Blocks interactive commands ───

  it("blocks interactive commands like vim", () => {
    const result = mw.before(makeCtx("vim src/index.ts"));
    expect(typeof result).toBe("string");
    expect(result as string).toMatch(/interactive/i);
  });

  // ─── Test #52: Allows safe commands ───

  it("allows safe commands through", () => {
    const result = mw.before(makeCtx("npm test"));
    expect(result).toEqual(makeCtx("npm test"));
  });

  // ─── Test #53: Ignores non-bash tools ───

  it("ignores non-bash tool calls entirely", () => {
    const ctx: ToolCallContext = {
      toolName: "read_file",
      args: { path: "/etc/passwd" },
      callId: "call-x",
    };
    expect(mw.before(ctx)).toEqual(ctx);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PreCompletionMiddleware
// ═══════════════════════════════════════════════════════════════════════════════

describe("PreCompletionMiddleware", () => {
  // ─── Test #54: Blocks completion without tests ───

  it("blocks task_complete when no tests have been run", () => {
    const mw = new PreCompletionMiddleware();

    const ctx: ToolCallContext = {
      toolName: "task_complete",
      args: {},
      callId: "call-x",
    };
    const result = mw.before(ctx);

    expect(typeof result).toBe("string");
    expect(result as string).toMatch(/must run tests/i);
  });

  // ─── Test #55: Allows completion after tests ───

  it("allows task_complete after a test command has been run", () => {
    const mw = new PreCompletionMiddleware();

    // Simulate running tests
    const testCtx: ToolCallContext = {
      toolName: "bash",
      args: { command: "npm test" },
      callId: "call-1",
    };
    mw.before(testCtx);

    expect(mw.hasRunTests()).toBe(true);

    // Now try completion
    const completeCtx: ToolCallContext = {
      toolName: "task_complete",
      args: {},
      callId: "call-2",
    };
    const result = mw.before(completeCtx);

    expect(result).toEqual(completeCtx);
  });
});
