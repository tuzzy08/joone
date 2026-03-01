import { SandboxManager } from "../sandbox/manager.js";
import { LazyInstaller } from "../sandbox/bootstrap.js";
import { DynamicToolInterface } from "./index.js";

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
  execute: async (args: { target: string; path?: string }) => {
    if (!_sandboxManager || !_sandboxManager.isActive()) {
      throw new Error("Sandbox is not active. Cannot run security scan.");
    }
    if (!_installer) {
      throw new Error("LazyInstaller not initialized. Call bindSecuritySandbox() first.");
    }

    // Ensure Gemini CLI is available
    const cliReady = await _installer.ensureGeminiCli(_sandboxManager);

    if (!cliReady) {
      return (
        "⚠ Gemini CLI could not be installed in the sandbox.\n" +
        "Suggestions:\n" +
        '  - Use `dep_scan` tool for dependency vulnerability scanning (uses npm audit)\n' +
        "  - Manually review code for OWASP Top 10 vulnerabilities\n" +
        "  - Set sandboxTemplate to a pre-baked template with Gemini CLI installed"
      );
    }

    // Build the command based on target
    let command: string;
    switch (args.target) {
      case "changes":
        command = "cd /workspace && gemini -x security:analyze 2>&1";
        break;
      case "file":
        if (!args.path) {
          return "Error: 'path' is required when target is 'file'.";
        }
        command = `cd /workspace && gemini -x security:analyze --file "${args.path}" 2>&1`;
        break;
      case "deps":
        command = "cd /workspace && gemini -x security:analyze --deps-only 2>&1";
        break;
      default:
        return `Error: Unknown target "${args.target}". Use "changes", "file", or "deps".`;
    }

    const result = await _sandboxManager.exec(command);

    if (result.exitCode !== 0) {
      return `Security scan failed (exit code ${result.exitCode}):\n${result.stdout}\n${result.stderr}`;
    }

    return result.stdout || "Security scan completed — no issues found.";
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
  execute: async (args?: { format?: string }) => {
    if (!_sandboxManager || !_sandboxManager.isActive()) {
      throw new Error("Sandbox is not active. Cannot run dependency scan.");
    }
    if (!_installer) {
      throw new Error("LazyInstaller not initialized.");
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
        return result.stdout || "No known vulnerabilities found in dependencies.";
      }

      // Exit code 1 from OSV-Scanner means vulnerabilities found — still valid output
      if (result.stdout) {
        return result.stdout;
      }
    }

    // Fallback: npm audit
    const auditCmd =
      format === "json"
        ? "cd /workspace && npm audit --json 2>&1"
        : "cd /workspace && npm audit 2>&1";

    const auditResult = await _sandboxManager.exec(auditCmd);

    // npm audit returns 1 when vulnerabilities are found — that's valid output
    return auditResult.stdout || "No known vulnerabilities found in dependencies.";
  },
};
