/**
 * Middleware types for the tool execution pipeline.
 *
 * Each middleware can hook into both the "before" and "after" phases
 * of a tool call. The pipeline chains them in order.
 */

/**
 * Context object passed through the middleware chain for each tool call.
 */
export interface ToolCallContext {
  /** Name of the tool being called (e.g., "bash", "read_file"). */
  toolName: string;
  /** Arguments passed to the tool. */
  args: Record<string, any>;
  /** Unique ID of this tool call (from the LLM response). */
  callId: string;
}

/**
 * A middleware that can intercept tool calls before and after execution.
 *
 * - `before()`: Runs before the tool executes. Return the (possibly modified)
 *   context to continue, or a `string` to short-circuit with an error/warning.
 * - `after()`: Runs after the tool executes. Can transform the result before
 *   it enters the conversation history.
 */
export interface ToolMiddleware {
  /** Human-readable name for logging and debugging. */
  name: string;

  /**
   * Pre-execution hook.
   * @returns ToolCallContext to continue, or a string to reject the call.
   */
  before?(ctx: ToolCallContext): Promise<ToolCallContext | string> | ToolCallContext | string;

  /**
   * Post-execution hook.
   * @returns The (possibly transformed) tool result string.
   */
  after?(ctx: ToolCallContext, result: string): Promise<string> | string;
}
