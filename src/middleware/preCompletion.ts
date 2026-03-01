import { ToolCallContext, ToolMiddleware } from "./types.js";
import { ToolResult } from "../tools/index.js";

/**
 * Prevents the agent from marking a task as "done" without running tests.
 *
 * Tracks whether any test command has been executed during the session.
 * If the agent attempts to signal completion without running tests first,
 * the middleware intercepts and forces verification.
 *
 * Reference: docs/02_edge_cases_and_mitigations.md — "The Fake Success Verification"
 */
export class PreCompletionMiddleware implements ToolMiddleware {
  readonly name = "PreCompletion";

  private testsPassed = false;

  /** Patterns in bash commands that count as "running tests". */
  private readonly testPatterns = [
    /\bvitest\b/,
    /\bjest\b/,
    /\bpytest\b/,
    /\bmocha\b/,
    /\bnpm\s+test\b/,
    /\bnpm\s+run\s+test\b/,
    /\byarn\s+test\b/,
    /\bpnpm\s+test\b/,
    /\bgo\s+test\b/,
    /\bcargo\s+test\b/,
  ];

  /** Tool names that signal the agent is trying to complete the task. */
  private readonly completionSignals = new Set([
    "task_complete",
    "attempt_completion",
    "finish_task",
    "submit_result",
  ]);

  before(ctx: ToolCallContext): ToolCallContext | string {
    // When a test command is initiated, assume it hasn't passed yet
    if (ctx.toolName === "bash" && typeof ctx.args.command === "string") {
      for (const pattern of this.testPatterns) {
        if (pattern.test(ctx.args.command)) {
          this.testsPassed = false;
          break;
        }
      }
    }

    // Intercept completion attempts
    if (this.completionSignals.has(ctx.toolName)) {
      if (!this.testsPassed) {
        return (
          "⚠ You must run tests before completing the task, AND they must pass.\n" +
          "Use the bash tool to execute your test suite (e.g., `npm test`, `vitest`, `pytest`).\n" +
          "If tests fail, fix the issues. Once tests pass cleanly, you may attempt completion again."
        );
      }
    }

    return ctx;
  }

  after(ctx: ToolCallContext, result: ToolResult): void {
    if (ctx.toolName === "bash" && typeof ctx.args.command === "string") {
      for (const pattern of this.testPatterns) {
        if (pattern.test(ctx.args.command)) {
          // Robustly check the exact exit code from the tool metadata
          if (result.metadata?.exitCode === 0) {
            this.testsPassed = true;
          } else {
            this.testsPassed = false;
          }
          break;
        }
      }
    }
  }

  /**
   * Returns whether tests have been run and passed in this session.
   */
  hasPassedTests(): boolean {
    return this.testsPassed;
  }

  /**
   * Resets state. Useful for testing or session boundaries.
   */
  reset(): void {
    this.testsPassed = false;
  }
}
