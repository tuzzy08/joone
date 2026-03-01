import * as fs from "node:fs";
import * as path from "node:path";
import { SandboxManager } from "../sandbox/manager.js";
import { FileSync } from "../sandbox/sync.js";

export interface DynamicToolInterface {
    name: string;
    description: string;
    schema: Record<string, any>;
    execute: (args: any) => Promise<string> | string;
}

// ─── Configuration ──────────────────────────────────────────────────────────────

/** Maximum file size (in bytes) the agent is allowed to read into context. */
const MAX_FILE_SIZE_BYTES = 512 * 1024; // 512 KB

/** Maximum number of lines to return if file exceeds line limit. */
const MAX_FILE_LINES = 2000;

// ─── Sandbox reference (set at session start) ───────────────────────────────────

let _sandboxManager: SandboxManager | null = null;
let _fileSync: FileSync | null = null;

/**
 * Binds the tools to a SandboxManager and FileSync instance.
 * Must be called at session start before any tool executions.
 */
export function bindSandbox(sandbox: SandboxManager, fileSync: FileSync): void {
    _sandboxManager = sandbox;
    _fileSync = fileSync;
}

// ─── BashTool ───────────────────────────────────────────────────────────────────
// Executes shell commands inside the E2B sandbox.
// The ToolRouter routes this to SANDBOX — the host machine is never exposed.

export const BashTool: DynamicToolInterface = {
    name: "bash",
    description:
        "Runs a shell command inside an isolated sandbox. Use for tests, scripts, or installing dependencies. The host machine is never exposed.",
    schema: {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "The shell command to execute",
            },
        },
        required: ["command"],
    },
    execute: async (args: { command: string }) => {
        if (!_sandboxManager || !_sandboxManager.isActive()) {
            throw new Error(
                "Sandbox is not active. Cannot execute bash commands without an active sandbox session."
            );
        }

        // Sync any dirty files from host → sandbox before executing
        if (_fileSync && _fileSync.pendingCount() > 0) {
            await _fileSync.syncToSandbox(_sandboxManager);
        }

        const result = await _sandboxManager.exec(args.command);

        if (result.exitCode !== 0) {
            return `Command failed (exit code ${result.exitCode}):\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`;
        }

        return result.stdout || "(no output)";
    },
};

// ─── ReadFileTool ───────────────────────────────────────────────────────────────
// Reads files from the HOST filesystem (so the user's real project is visible).
// Includes a built-in file size guardrail to prevent sending huge files to the LLM.

export const ReadFileTool: DynamicToolInterface = {
    name: "read_file",
    description:
        "Reads a file from the host filesystem. Includes a file size guardrail — files over 512KB are truncated to prevent context overflow.",
    schema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Absolute or relative path to the file",
            },
            startLine: {
                type: "number",
                description: "Optional 1-indexed start line for partial reads",
            },
            endLine: {
                type: "number",
                description: "Optional 1-indexed end line for partial reads",
            },
        },
        required: ["path"],
    },
    execute: async (args: { path: string; startLine?: number; endLine?: number }) => {
        const filePath = path.resolve(args.path);

        // ── Check existence ──
        if (!fs.existsSync(filePath)) {
            return `Error: File not found — ${filePath}`;
        }

        // ── File Size Guardrail ──
        const stat = fs.statSync(filePath);
        if (stat.size > MAX_FILE_SIZE_BYTES) {
            return (
                `Error: File is too large (${(stat.size / 1024).toFixed(0)} KB). ` +
                `Maximum allowed is ${MAX_FILE_SIZE_BYTES / 1024} KB. ` +
                `Use startLine/endLine to read a specific range, or use bash to run 'head' or 'grep'.`
            );
        }

        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");

        // ── Line range slicing ──
        if (args.startLine || args.endLine) {
            const start = Math.max(1, args.startLine ?? 1) - 1;
            const end = Math.min(lines.length, args.endLine ?? lines.length);
            const sliced = lines.slice(start, end);
            return sliced.map((line, i) => `${start + i + 1}: ${line}`).join("\n");
        }

        // ── Line count guardrail ──
        if (lines.length > MAX_FILE_LINES) {
            const truncated = lines.slice(0, MAX_FILE_LINES);
            return (
                truncated.map((line, i) => `${i + 1}: ${line}`).join("\n") +
                `\n\n--- Truncated at ${MAX_FILE_LINES} lines (total: ${lines.length}) ---`
            );
        }

        return content;
    },
};

// ─── WriteFileTool ──────────────────────────────────────────────────────────────
// Writes files to the HOST filesystem (so the user sees changes in their IDE).
// Marks written files as dirty so FileSync uploads them before sandbox execution.

export const WriteFileTool: DynamicToolInterface = {
    name: "write_file",
    description:
        "Writes content to a file on the host filesystem. The user will see changes in their IDE immediately. The file is automatically synced to the sandbox before the next command execution.",
    schema: {
        type: "object",
        properties: {
            path: {
                type: "string",
                description: "Absolute or relative path to the file",
            },
            content: {
                type: "string",
                description: "The full file content to write",
            },
        },
        required: ["path", "content"],
    },
    execute: async (args: { path: string; content: string }) => {
        const filePath = path.resolve(args.path);

        // Create parent directories if needed
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, args.content, "utf-8");

        // Mark file as dirty for next sandbox sync
        if (_fileSync) {
            _fileSync.markDirty(filePath);
        }

        return `File written: ${filePath}`;
    },
};

// ─── Core Tool Set ──────────────────────────────────────────────────────────────

export const CORE_TOOLS: DynamicToolInterface[] = [
    BashTool,
    ReadFileTool,
    WriteFileTool,
];
