/**
 * Core tracing data types for session instrumentation.
 */

/**
 * A single traced event during agent execution.
 */
export interface TraceEvent {
  /** Event category. */
  type: "llm_call" | "tool_call" | "error" | "compaction";
  /** Unix timestamp (ms) when the event started. */
  timestamp: number;
  /** Duration in milliseconds (if applicable). */
  duration?: number;
  /** Event-specific payload. */
  data: Record<string, any>;
}

/**
 * Aggregated metrics for a complete session.
 */
export interface TraceSummary {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  /** Estimated cost in USD. */
  totalCost: number;
  /** Cache hit rate: 0-1 (ratio of cached prompt tokens to total prompt tokens). */
  cacheHitRate: number;
  /** Number of tool calls made during the session. */
  toolCallCount: number;
  /** Number of errors encountered. */
  errorCount: number;
  /** Total session duration in ms. */
  totalDuration: number;
  /** Number of LLM turns. */
  turnCount: number;
}

/**
 * Full trace for a single agent session, suitable for persistence and analysis.
 */
export interface SessionTrace {
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  events: TraceEvent[];
  summary: TraceSummary;
}
