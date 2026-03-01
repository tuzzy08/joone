import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { TraceEvent, TraceSummary, SessionTrace } from "./types.js";

/**
 * SessionTracer — records events during an agent session and computes metrics.
 *
 * Usage:
 *   const tracer = new SessionTracer();
 *   tracer.recordLLMCall({ promptTokens: 500, completionTokens: 100, cached: true, duration: 800 });
 *   tracer.recordToolCall({ name: "bash", args: { command: "ls" }, result: "...", duration: 50 });
 *   tracer.recordError({ message: "Timeout", tool: "bash" });
 *   const summary = tracer.getSummary();
 *   tracer.save(); // writes to ~/.joone/traces/{sessionId}.json
 */
export class SessionTracer {
  private sessionId: string;
  private startedAt: number;
  private events: TraceEvent[] = [];

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? crypto.randomUUID();
    this.startedAt = Date.now();
  }

  // ─── Recording Methods ──────────────────────────────────────────────────────

  /**
   * Record an LLM call with token usage and cache information.
   */
  recordLLMCall(data: {
    promptTokens: number;
    completionTokens: number;
    cached: boolean;
    duration: number;
    model?: string;
  }): void {
    this.events.push({
      type: "llm_call",
      timestamp: Date.now(),
      duration: data.duration,
      data,
    });
  }

  /**
   * Record a tool execution.
   */
  recordToolCall(data: {
    name: string;
    args: Record<string, any>;
    result?: string;
    duration: number;
    success: boolean;
  }): void {
    this.events.push({
      type: "tool_call",
      timestamp: Date.now(),
      duration: data.duration,
      data,
    });
  }

  /**
   * Record an error.
   */
  recordError(data: {
    message: string;
    tool?: string;
    stack?: string;
  }): void {
    this.events.push({
      type: "error",
      timestamp: Date.now(),
      data,
    });
  }

  /**
   * Record a context compaction event.
   */
  recordCompaction(data: {
    tokensBefore: number;
    tokensAfter: number;
    messagesSummarized: number;
  }): void {
    this.events.push({
      type: "compaction",
      timestamp: Date.now(),
      data,
    });
  }

  // ─── Summary Computation ────────────────────────────────────────────────────

  /**
   * Compute aggregated metrics from all recorded events.
   */
  getSummary(): TraceSummary {
    let promptTokens = 0;
    let completionTokens = 0;
    let cachedPromptTokens = 0;
    let toolCallCount = 0;
    let errorCount = 0;
    let turnCount = 0;

    for (const event of this.events) {
      switch (event.type) {
        case "llm_call":
          promptTokens += event.data.promptTokens || 0;
          completionTokens += event.data.completionTokens || 0;
          if (event.data.cached) {
            cachedPromptTokens += event.data.promptTokens || 0;
          }
          turnCount++;
          break;
        case "tool_call":
          toolCallCount++;
          break;
        case "error":
          errorCount++;
          break;
      }
    }

    const totalTokens = promptTokens + completionTokens;
    const cacheHitRate = promptTokens > 0 ? cachedPromptTokens / promptTokens : 0;

    // Rough cost estimate: ~$3/1M input tokens, ~$15/1M output tokens (Claude Sonnet pricing)
    const totalCost =
      (promptTokens / 1_000_000) * 3 + (completionTokens / 1_000_000) * 15;

    const totalDuration = Date.now() - this.startedAt;

    return {
      totalTokens,
      promptTokens,
      completionTokens,
      totalCost,
      cacheHitRate,
      toolCallCount,
      errorCount,
      totalDuration,
      turnCount,
    };
  }

  // ─── Export & Persistence ───────────────────────────────────────────────────

  /**
   * Returns the full session trace as a serializable object.
   */
  export(): SessionTrace {
    return {
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      events: this.events,
      summary: this.getSummary(),
    };
  }

  /**
   * Saves the session trace to ~/.joone/traces/{sessionId}.json.
   */
  save(dir?: string): string {
    const tracesDir = dir ?? path.join(os.homedir(), ".joone", "traces");

    if (!fs.existsSync(tracesDir)) {
      fs.mkdirSync(tracesDir, { recursive: true });
    }

    // Sanitize sessionId to prevent path traversal
    const safeSessionId = path.basename(this.sessionId);
    const filePath = path.join(tracesDir, `${safeSessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.export(), null, 2));

    return filePath;
  }
  /**
   * Loads a session trace from a JSON file.
   */
  static load(filePath: string): SessionTrace {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as SessionTrace;
  }

  // ─── Accessors ─────────────────────────────────────────────────────────────

  getSessionId(): string {
    return this.sessionId;
  }

  getEvents(): readonly TraceEvent[] {
    return this.events;
  }

  getEventCount(): number {
    return this.events.length;
  }
}
