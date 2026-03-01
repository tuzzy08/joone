import { ToolCallContext, ToolMiddleware } from "./types.js";

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

  private testsRan = false;

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
    // Track test execution via bash commands
    if (ctx.toolName === "bash" && typeof ctx.args.command === "string") {
      for (const pattern of this.testPatterns) {
        if (pattern.test(ctx.args.command)) {
          this.testsRan = true;
          break;
        }
      }
    }

    // Intercept completion attempts
    if (this.completionSignals.has(ctx.toolName)) {
      if (!this.testsRan) {
        return (
          "⚠ You must run tests before completing the task.\n" +
          "Use the bash tool to execute your test suite (e.g., `npm test`, `vitest`, `pytest`).\n" +
          "Once tests pass, you may attempt completion again."
        );
      }
    }

    return ctx;
  }

  /**
   * Returns whether tests have been run in this session.
   */
  hasRunTests(): boolean {
    return this.testsRan;
  }

  /**
   * Resets state. Useful for testing or session boundaries.
   */
  reset(): void {
    this.testsRan = false;
  }
}
