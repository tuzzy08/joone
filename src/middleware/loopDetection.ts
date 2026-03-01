import { ToolCallContext, ToolMiddleware } from "./types.js";

/**
 * Prevents the "Blind Retry" doom loop.
 *
 * Tracks a rolling window of recent tool call signatures. If the same
 * tool + args combination appears N times consecutively, the call is
 * rejected with an instruction to try a different approach.
 *
 * Reference: docs/02_edge_cases_and_mitigations.md — "The Blind Retry Doom Loop"
 */
export class LoopDetectionMiddleware implements ToolMiddleware {
  readonly name = "LoopDetection";

  private history: string[] = [];
  private readonly threshold: number;

  /**
   * @param threshold - Number of identical consecutive calls before blocking (default: 3).
   */
  constructor(threshold = 3) {
    this.threshold = threshold;
  }

  /**
   * Creates a signature string for a tool call (name + sorted args JSON).
   */
  private signature(ctx: ToolCallContext): string {
    return `${ctx.toolName}:${JSON.stringify(ctx.args, Object.keys(ctx.args).sort())}`;
  }

  before(ctx: ToolCallContext): ToolCallContext | string {
    const sig = this.signature(ctx);

    this.history.push(sig);

    // Keep only the last N entries to avoid unbounded growth
    if (this.history.length > this.threshold * 2) {
      this.history = this.history.slice(-this.threshold * 2);
    }

    // Check if the last `threshold` entries are all identical
    const tail = this.history.slice(-this.threshold);
    if (
      tail.length >= this.threshold &&
      tail.every((s) => s === sig)
    ) {
      return (
        `⚠ Loop detected: You have called "${ctx.toolName}" with identical arguments ` +
        `${this.threshold} times consecutively. Stop this approach and try a different strategy.`
      );
    }

    return ctx;
  }

  /**
   * Resets the history. Useful for testing or session boundaries.
   */
  reset(): void {
    this.history = [];
  }
}
