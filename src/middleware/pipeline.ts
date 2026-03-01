import { ToolCallContext, ToolMiddleware } from "./types.js";
import { ToolResult } from "../tools/index.js";

/**
 * Executes tool calls through a chain of middleware hooks.
 *
 * Execution flow:
 * 1. Run all `before()` hooks in registration order.
 *    - If any returns a string → short-circuit (tool is NOT executed).
 * 2. Execute the actual tool function.
 * 3. Run all `after()` hooks in reverse registration order.
 *    - Each can transform the result before it enters conversation history.
 */
export class MiddlewarePipeline {
  private middlewares: ToolMiddleware[] = [];

  /**
   * Register a middleware. Middlewares run in the order they are added.
   */
  use(middleware: ToolMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Returns the number of registered middlewares.
   */
  get length(): number {
    return this.middlewares.length;
  }

  /**
   * Execute a tool call through the middleware pipeline.
   *
   * @param ctx - The tool call context (name, args, callId).
   * @param executeFn - The actual tool execution function.
   * @returns The final result string (possibly transformed by after-hooks).
   */
  async run(
    ctx: ToolCallContext,
    executeFn: (ctx: ToolCallContext) => Promise<ToolResult> | ToolResult
  ): Promise<string> {
    // ── Before phase: run hooks in order ──
    let currentCtx = ctx;

    for (const mw of this.middlewares) {
      if (mw.before) {
        const result = await mw.before(currentCtx);

        if (typeof result === "string") {
          // Short-circuit: middleware rejected the call
          return result;
        }

        if (result !== undefined) {
          currentCtx = result;
        }
      }
    }

    // ── Execute the tool ──
    let output: ToolResult = await executeFn(currentCtx);

    // ── After phase: run hooks in reverse order ──
    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const mw = this.middlewares[i];
      if (mw.after) {
        const transformed = await mw.after(currentCtx, output);
        if (transformed !== undefined) {
          output = transformed;
        }
      }    }

    return output.content;
  }
}
