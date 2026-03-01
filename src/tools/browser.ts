import { SandboxManager } from "../sandbox/manager.js";
import { LazyInstaller } from "../sandbox/bootstrap.js";
import { DynamicToolInterface, ToolResult } from "./index.js";

// ─── Sandbox + Installer references ─────────────────────────────────────────

let _sandboxManager: SandboxManager | null = null;
let _installer: LazyInstaller | null = null;

export function bindBrowserSandbox(
  sandbox: SandboxManager,
  installer: LazyInstaller
): void {
  _sandboxManager = sandbox;
  _installer = installer;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Escapes a string so it can be safely used as an argument in a Bash shell command.
 * It wraps the string in single quotes and safely escapes internal single quotes.
 */
function escapeBashArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// ─── BrowserTool ────────────────────────────────────────────────────────────────

/**
 * Web Browser Tool — wraps Vercel Labs' `agent-browser` CLI.
 *
 * Provides compact accessibility-tree output optimized for LLMs
 * (low token usage vs raw HTML). Runs inside the E2B sandbox.
 *
 * Supported actions:
 * - navigate: Go to a URL
 * - snapshot: Get the accessibility tree (compact text representation)
 * - click: Click an element by ref
 * - type: Type text into a form field by ref
 * - screenshot: Capture a screenshot
 * - scroll: Scroll the page up or down
 */
export const BrowserTool: DynamicToolInterface = {
  name: "browser",
  description:
    "Interact with web pages using a headless browser. Actions: navigate, snapshot, click, type, screenshot, scroll. " +
    "Returns compact accessibility-tree text output optimized for AI consumption.",
  schema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["navigate", "snapshot", "click", "type", "screenshot", "scroll"],
        description: "The browser action to perform",
      },
      url: {
        type: "string",
        description: "URL to navigate to (required for 'navigate')",
      },
      ref: {
        type: "string",
        description:
          "Element reference from the accessibility tree (required for 'click' and 'type')",
      },
      text: {
        type: "string",
        description: "Text to type (required for 'type')",
      },
      direction: {
        type: "string",
        enum: ["up", "down"],
        description: "Scroll direction for 'scroll' action (optional, defaults to 'down')",
      },    },
    required: ["action"],
  },
  execute: async (args: {
    action: string;
    url?: string;
    ref?: string;
    text?: string;
    direction?: string;
  }): Promise<ToolResult> => {
    if (!_sandboxManager || !_sandboxManager.isActive()) {
      return { content: "Sandbox is not active. Cannot use browser tool.", isError: true };
    }

    // Build the CLI command
    let command: string;

    switch (args.action) {
      case "navigate":
        if (!args.url) return { content: "Error: 'url' is required for navigate action.", isError: true };
        command = `agent-browser navigate ${escapeBashArg(args.url)} 2>&1`;
        break;

      case "snapshot":
        command = "agent-browser snapshot 2>&1";
        break;

      case "click":
        if (!args.ref) return { content: "Error: 'ref' is required for click action.", isError: true };
        command = `agent-browser click ${escapeBashArg(args.ref)} 2>&1`;
        break;

      case "type":
        if (!args.ref) return { content: "Error: 'ref' is required for type action.", isError: true };
        if (!args.text) return { content: "Error: 'text' is required for type action.", isError: true };
        command = `agent-browser type ${escapeBashArg(args.ref)} ${escapeBashArg(args.text)} 2>&1`;
        break;

      case "screenshot":
        command = "agent-browser screenshot 2>&1";
        break;

      case "scroll":
        const dir = args.direction || "down";
        command = `agent-browser scroll ${escapeBashArg(dir)} 2>&1`;
        break;

      default:
        return { content: `Error: Unknown action "${args.action}". Use: navigate, snapshot, click, type, screenshot, scroll.`, isError: true };
    }

    const result = await _sandboxManager.exec(command);

    if (result.exitCode !== 0) {
      return {
        content: `Browser action failed (exit code ${result.exitCode}):\n${result.stdout}\n${result.stderr}`,
        metadata: { exitCode: result.exitCode },
        isError: true
      };
    }

    return { content: result.stdout || "(no output)", metadata: { exitCode: result.exitCode }, isError: false };
  },
};
