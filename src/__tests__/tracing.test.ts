import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SessionTracer } from "../tracing/sessionTracer.js";
import {
  enableLangSmith,
  disableLangSmith,
  isLangSmithEnabled,
} from "../tracing/langsmith.js";
import { TraceAnalyzer } from "../tracing/analyzer.js";
import type { SessionTrace } from "../tracing/types.js";

// ═══════════════════════════════════════════════════════════════════════════════
// 6a: SessionTracer
// ═══════════════════════════════════════════════════════════════════════════════

describe("SessionTracer", () => {
  // ─── Test #83: Records LLM calls and computes totals ───

  it("records LLM calls and computes token totals", () => {
    const tracer = new SessionTracer("test-session-1");

    tracer.recordLLMCall({ promptTokens: 500, completionTokens: 100, cached: false, duration: 800 });
    tracer.recordLLMCall({ promptTokens: 400, completionTokens: 150, cached: true, duration: 600 });

    const summary = tracer.getSummary();

    expect(summary.promptTokens).toBe(900);
    expect(summary.completionTokens).toBe(250);
    expect(summary.totalTokens).toBe(1150);
    expect(summary.turnCount).toBe(2);
  });

  // ─── Test #84: Records tool calls and counts them ───

  it("records tool calls and counts them", () => {
    const tracer = new SessionTracer("test-session-2");

    tracer.recordToolCall({ name: "bash", args: { command: "ls" }, duration: 50, success: true });
    tracer.recordToolCall({ name: "write_file", args: { path: "a.ts" }, duration: 30, success: true });
    tracer.recordToolCall({ name: "bash", args: { command: "npm test" }, duration: 200, success: false });

    const summary = tracer.getSummary();

    expect(summary.toolCallCount).toBe(3);
  });

  // ─── Test #85: Computes cache hit rate correctly ───

  it("computes cache hit rate correctly", () => {
    const tracer = new SessionTracer("test-session-3");

    // 3 calls: 2 cached, 1 not
    tracer.recordLLMCall({ promptTokens: 100, completionTokens: 50, cached: true, duration: 100 });
    tracer.recordLLMCall({ promptTokens: 100, completionTokens: 50, cached: true, duration: 100 });
    tracer.recordLLMCall({ promptTokens: 100, completionTokens: 50, cached: false, duration: 100 });

    const summary = tracer.getSummary();

    // 200 cached out of 300 total prompt tokens = 66.7%
    expect(summary.cacheHitRate).toBeCloseTo(0.667, 2);
  });

  // ─── Test #86: export() returns valid SessionTrace ───

  it("export() returns a valid SessionTrace", () => {
    const tracer = new SessionTracer("export-test");

    tracer.recordLLMCall({ promptTokens: 100, completionTokens: 50, cached: true, duration: 200 });
    tracer.recordError({ message: "Timeout", tool: "bash" });

    const trace = tracer.export();

    expect(trace.sessionId).toBe("export-test");
    expect(trace.startedAt).toBeGreaterThan(0);
    expect(trace.endedAt).toBeGreaterThanOrEqual(trace.startedAt);
    expect(trace.events).toHaveLength(2);
    expect(trace.summary.turnCount).toBe(1);
    expect(trace.summary.errorCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6b: LangSmith Integration
// ═══════════════════════════════════════════════════════════════════════════════

describe("LangSmith Integration", () => {
  afterEach(() => {
    disableLangSmith();
  });

  // ─── Test #87: enableLangSmith sets correct env vars ───

  it("sets the correct environment variables", () => {
    enableLangSmith({ apiKey: "test-key-123", project: "my-project" });

    expect(process.env.LANGCHAIN_TRACING_V2).toBe("true");
    expect(process.env.LANGCHAIN_API_KEY).toBe("test-key-123");
    expect(process.env.LANGCHAIN_PROJECT).toBe("my-project");
    expect(isLangSmithEnabled()).toBe(true);
  });

  // ─── Test #88: disableLangSmith clears env vars ───

  it("disableLangSmith clears the environment variables", () => {
    enableLangSmith({ apiKey: "test-key" });
    disableLangSmith();

    expect(process.env.LANGCHAIN_TRACING_V2).toBeUndefined();
    expect(isLangSmithEnabled()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6c: TraceAnalyzer
// ═══════════════════════════════════════════════════════════════════════════════

describe("TraceAnalyzer", () => {
  const createTrace = (overrides?: Partial<SessionTrace>): SessionTrace => ({
    sessionId: "test",
    startedAt: Date.now() - 10000,
    endedAt: Date.now(),
    events: [],
    summary: {
      totalTokens: 1000,
      promptTokens: 700,
      completionTokens: 300,
      totalCost: 0.006,
      cacheHitRate: 0.8,
      toolCallCount: 5,
      errorCount: 0,
      totalDuration: 10000,
      turnCount: 5,
    },
    ...overrides,
  });
  // ─── Test #89: Detects loop patterns ───

  it("detects doom-loop patterns in tool calls", () => {
    const trace = createTrace({
      events: [
        { type: "tool_call", timestamp: 1, data: { name: "bash", args: { command: "ls" } } },
        { type: "tool_call", timestamp: 2, data: { name: "bash", args: { command: "ls" } } },
        { type: "tool_call", timestamp: 3, data: { name: "bash", args: { command: "ls" } } },
      ],
    });

    const analyzer = new TraceAnalyzer(trace);
    const report = analyzer.analyze();

    const loopIssues = report.issues.filter((i) => i.category === "loop");
    expect(loopIssues.length).toBeGreaterThan(0);
    expect(loopIssues[0].severity).toBe("critical");
  });

  // ─── Test #90: Detects cost hotspots ───

  it("flags turns consuming >20% of total tokens", () => {
    const trace = createTrace({
      summary: {
        ...createTrace().summary,
        totalTokens: 1000,
      },
      events: [
        { type: "llm_call", timestamp: 1, data: { promptTokens: 300, completionTokens: 100, cached: false } },
        { type: "llm_call", timestamp: 2, data: { promptTokens: 100, completionTokens: 50, cached: true } },
      ],
    });

    const analyzer = new TraceAnalyzer(trace);
    const report = analyzer.analyze();

    const costIssues = report.issues.filter((i) => i.category === "cost");
    expect(costIssues.length).toBeGreaterThan(0);
  });

  // ─── Test #91: Warns on low cache hit rate ───

  it("warns when cache hit rate is below 70%", () => {
    const trace = createTrace({
      summary: {
        ...createTrace().summary,
        cacheHitRate: 0.5,
        turnCount: 5,
      },
    });

    const analyzer = new TraceAnalyzer(trace);
    const report = analyzer.analyze();

    const cacheIssues = report.issues.filter((i) => i.category === "cache");
    expect(cacheIssues.length).toBe(1);
    expect(cacheIssues[0].message).toContain("50.0%");
  });
});
