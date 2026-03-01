import { SandboxManager } from "../sandbox/manager.js";
import { LazyInstaller } from "../sandbox/bootstrap.js";
import { DynamicToolInterface, ToolResult } from "./index.js";

// ─── Sandbox + Installer references (set at session start) ──────────────────

let _sandboxManager: SandboxManager | null = null;
let _installer: LazyInstaller | null = null;

/**
 * Binds the security tools to the sandbox and installer.
 * Must be called at session start.
 */
export function bindSecuritySandbox(
  sandbox: SandboxManager,
  installer: LazyInstaller
): void {
  _sandboxManager = sandbox;
  _installer = installer;
}

// ─── Security Helpers ───────────────────────────────────────────────────────────

/**
 * Escapes a string so it can be safely used as an argument in a Bash shell command.
 */
function escapeBashArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Validates a file path to prevent directory traversal out of the workspace.
 */
function isSafePath(pathStr: string): boolean {
  if (!pathStr || pathStr.trim() === "") return false;
  if (pathStr.includes("..") || pathStr.startsWith("/")) return false;
  return true;
}

// ─── SecurityScanTool ───────────────────────────────────────────────────────────

/**
 * Scans code for security vulnerabilities using the Gemini CLI Security Extension.
 *
 * Execution flow:
 * 1. LazyInstaller ensures Gemini CLI + security extension are in the sandbox.
 * 2. Runs `gemini -x security:analyze` in the sandbox.
 * 3. Returns the generated security report.
 *
 * If Gemini CLI installation fails, returns a descriptive fallback message
 * suggesting manual review or alternative tools.
 */
export const SecurityScanTool: DynamicToolInterface = {
  name: "security_scan",
  description:
    "Scans code changes for security vulnerabilities using the Gemini CLI Security Extension. " +
    "Analyzes the current branch diff for common vulnerabilities and generates a security report.",
  schema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        enum: ["changes", "file", "deps"],
        description:
          'What to scan: "changes" (branch diff), "file" (specific file), "deps" (dependencies only)',
      },
      path: {
        type: "string",
        description:
          "File path for single-file scan (required when target is 'file')",
      },
    },
    required: ["target"],
  },
  execute: async (args: { target: string; path?: string }): Promise<ToolResult> => {
    if (!_sandboxManager || !_sandboxManager.isActive()) {
      return { content: "Sandbox is not active. Cannot run security scan.", isError: true };
    }
    if (!_installer) {
      return { content: "LazyInstaller not initialized. Call bindSecuritySandbox() first.", isError: true };
    }

    // Ensure Gemini CLI is available
    const cliReady = await _installer.ensureGeminiCli(_sandboxManager);

    if (!cliReady) {
      return {
        content: (
          "⚠ Gemini CLI could not be installed in the sandbox.\n" +
          "Suggestions:\n" +
          '  - Use `dep_scan` tool for dependency vulnerability scanning (uses npm audit)\n' +
          "  - Manually review code for OWASP Top 10 vulnerabilities\n" +
          "  - Set sandboxTemplate to a pre-baked template with Gemini CLI installed"
        ),
        isError: true
      };
    }

    // Build the command based on target
    let command: string;
    switch (args.target) {
      case "changes":
        command = "cd /workspace && gemini -x security:analyze 2>&1";
        break;
      case "file":
        if (!args.path) {
          return { content: "Error: 'path' is required when target is 'file'.", isError: true };
        }
        if (!isSafePath(args.path)) {
          return { content: "Error: Invalid file path. Path must be relative and cannot contain traversal characters ('..').", isError: true };
        }
        command = `cd /workspace && gemini -x security:analyze --file ${escapeBashArg(args.path)} 2>&1`;
        break;
      case "deps":
        command = "cd /workspace && gemini -x security:analyze --deps-only 2>&1";
        break;
      default:
        return { content: `Error: Unknown target "${args.target}". Use "changes", "file", or "deps".`, isError: true };
    }

    const result = await _sandboxManager.exec(command);

    if (result.exitCode !== 0) {
      return {
        content: `Security scan failed (exit code ${result.exitCode}):\n${result.stdout}\n${result.stderr}`,
        metadata: { exitCode: result.exitCode },
        isError: true
      };
    }

    return {
      content: result.stdout || "Security scan completed — no issues found.",
      metadata: { exitCode: result.exitCode },
      isError: false
    };
  },
};

// ─── DepScanTool ────────────────────────────────────────────────────────────────

/**
 * Scans project dependencies for known vulnerabilities.
 *
 * Execution flow:
 * 1. Try OSV-Scanner (more comprehensive, covers multiple ecosystems).
 * 2. Fall back to `npm audit --json` (always available in Node sandboxes).
 */
export const DepScanTool: DynamicToolInterface = {
  name: "dep_scan",
  description:
    "Scans project dependencies for known vulnerabilities (CVEs). " +
    "Uses OSV-Scanner when available, falls back to npm audit.",
  schema: {
    type: "object",
    properties: {
      format: {
        type: "string",
        enum: ["summary", "json"],
        description: 'Output format: "summary" (human readable) or "json" (raw)',
      },
    },
  },
  execute: async (args?: { format?: string }): Promise<ToolResult> => {
    if (!_sandboxManager || !_sandboxManager.isActive()) {
      return { content: "Sandbox is not active. Cannot run dependency scan.", isError: true };
    }
    if (!_installer) {
      return { content: "LazyInstaller not initialized.", isError: true };
    }

    const format = args?.format ?? "summary";

    // Try OSV-Scanner first
    const osvReady = await _installer.ensureOsvScanner(_sandboxManager);

    if (osvReady) {
      const osvCmd =
        format === "json"
          ? "cd /workspace && osv-scanner --json . 2>&1"
          : "cd /workspace && osv-scanner . 2>&1";

      const result = await _sandboxManager.exec(osvCmd);

      if (result.exitCode === 0) {
        return {
          content: result.stdout || "No known vulnerabilities found in dependencies.",
          metadata: { exitCode: result.exitCode },
          isError: false
        };
      }

      // Exit code 1 from OSV-Scanner means vulnerabilities found — still valid output
      if (result.exitCode === 1 && result.stdout) {
        return {
          content: result.stdout,
          metadata: { exitCode: result.exitCode },
          isError: false
        };
      }

      // If we reach here, OSV-Scanner failed for another reason (e.g. exit > 1)
      console.warn(`⚠ OSV-Scanner failed (exit code ${result.exitCode}). Falling back to npm audit.\nDetails: ${result.stdout}\n${result.stderr}`);
    }

    // Fallback: npm audit
    const auditCmd =
      format === "json"
        ? "cd /workspace && npm audit --json 2>&1"
        : "cd /workspace && npm audit 2>&1";

    const auditResult = await _sandboxManager.exec(auditCmd);

    // npm audit returns 1 when vulnerabilities are found — that's valid output
    return {
      content: auditResult.stdout || "No known vulnerabilities found in dependencies.",
      metadata: { exitCode: auditResult.exitCode },
      isError: false
    };
  },
};
