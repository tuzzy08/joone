import { SandboxManager } from "../sandbox/manager.js";
import { LazyInstaller } from "../sandbox/bootstrap.js";
import { DynamicToolInterface } from "./index.js";

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
        description: "Scroll direction (required for 'scroll')",
      },
    },
    required: ["action"],
  },
  execute: async (args: {
    action: string;
    url?: string;
    ref?: string;
    text?: string;
    direction?: string;
  }) => {
    if (!_sandboxManager || !_sandboxManager.isActive()) {
      throw new Error("Sandbox is not active. Cannot use browser tool.");
    }

    // Build the CLI command
    let command: string;

    switch (args.action) {
      case "navigate":
        if (!args.url) return "Error: 'url' is required for navigate action.";
        command = `agent-browser navigate "${args.url}" 2>&1`;
        break;

      case "snapshot":
        command = "agent-browser snapshot 2>&1";
        break;

      case "click":
        if (!args.ref) return "Error: 'ref' is required for click action.";
        command = `agent-browser click "${args.ref}" 2>&1`;
        break;

      case "type":
        if (!args.ref) return "Error: 'ref' is required for type action.";
        if (!args.text) return "Error: 'text' is required for type action.";
        command = `agent-browser type "${args.ref}" "${args.text}" 2>&1`;
        break;

      case "screenshot":
        command = "agent-browser screenshot 2>&1";
        break;

      case "scroll":
        const dir = args.direction || "down";
        command = `agent-browser scroll ${dir} 2>&1`;
        break;

      default:
        return `Error: Unknown action "${args.action}". Use: navigate, snapshot, click, type, screenshot, scroll.`;
    }

    const result = await _sandboxManager.exec(command);

    if (result.exitCode !== 0) {
      return `Browser action failed (exit code ${result.exitCode}):\n${result.stdout}\n${result.stderr}`;
    }

    return result.stdout || "(no output)";
  },
};
