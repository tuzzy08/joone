/**
 * Where a tool executes — on the host machine or in the sandbox.
 */
export enum ToolTarget {
  /** Run on the host (Node.js process). User sees changes in IDE. */
  HOST = "host",
  /** Run inside the E2B sandbox. Commands are isolated. */
  SANDBOX = "sandbox",
}

/**
 * Tools that execute on the host machine (no code execution risk).
 */
const HOST_TOOLS = new Set([
  "write_file",
  "read_file",
  "search_tools",
  "activate_tool",
  "list_files",
  "search_files",
  "web_search",
  "search_skills",
  "load_skill",
  "spawn_agent",
  "check_agent",
]);

/**
 * Tools that execute inside the sandboxed environment.
 */
const SANDBOX_TOOLS = new Set([
  "bash",
  "run_tests",
  "install_deps",
  "run_command",
  "python",
  "security_scan",
  "dep_scan",
  "browser",
]);

/**
 * Routes tool calls to either the host machine or the E2B sandbox.
 *
 * Design principle: File I/O runs on the host so the user sees changes
 * in their IDE in real-time. Code execution runs in the sandbox for safety.
 *
 * Unknown tools default to SANDBOX (safe-by-default).
 */
export class ToolRouter {
  /**
   * Determines where a tool should execute.
   *
   * @param toolName The name of the tool being invoked.
   * @returns ToolTarget.HOST or ToolTarget.SANDBOX
   */
  getTarget(toolName: string): ToolTarget {
    if (HOST_TOOLS.has(toolName)) {
      return ToolTarget.HOST;
    }
    // Default: sandbox (safe-by-default — never execute unknown tools on host)
    return ToolTarget.SANDBOX;
  }

  /**
   * Returns true if the tool should run on the host.
   */
  isHostTool(toolName: string): boolean {
    return this.getTarget(toolName) === ToolTarget.HOST;
  }

  /**
   * Returns true if the tool should run in the sandbox.
   */
  isSandboxTool(toolName: string): boolean {
    return this.getTarget(toolName) === ToolTarget.SANDBOX;
  }
}
