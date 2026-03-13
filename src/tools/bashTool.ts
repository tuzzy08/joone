import { tool } from "langchain";
import { z } from "zod";
import { SandboxManager } from "../sandbox/manager.js";
import { FileSync } from "../sandbox/sync.js";

const BLOCKED_PATTERNS: [RegExp, string][] = [
    // Destructive
    [/rm\s+(-\w*r\w*f\w*|-\w*f\w*r\w*)\s+\/(\*)?(?:\s|$)/, "destructive: rm -rf /"],
    [/mkfs\b/, "destructive: filesystem format"],
    [/\bdd\s+.*of=\/dev\//, "destructive: raw disk write"],
    [/chmod\s+(-\w+\s+)*777\s+\//, "dangerous: chmod 777 on root"],

    // Interactive / hanging
    [/\b(vim|vi|nano|emacs|pico)\b/, "interactive: text editor (hangs the sandbox)"],
    [/\b(less|more)\b/, "interactive: pager (hangs the sandbox)"],
    [/\b(top|htop|glances)\b/, "interactive: process monitor (hangs the sandbox)"],
    [/\bman\s+\w+/, "interactive: man page (hangs the sandbox)"],

    // Network abuse: pipe-to-shell
    [/curl\s+.*\|\s*(sh|bash|zsh)/, "unsafe: pipe remote script to shell"],
    [/wget\s+.*\|\s*(sh|bash|zsh)/, "unsafe: pipe remote script to shell"],
];

let _sandboxManager: SandboxManager | null = null;
let _fileSync: FileSync | null = null;

export function bindSandbox(sandbox: SandboxManager, fileSync: FileSync): void {
    _sandboxManager = sandbox;
    _fileSync = fileSync;
}

export const bashTool = tool(
    async ({ command }: { command: string }) => {
        for (const [pattern, reason] of BLOCKED_PATTERNS) {
            if (pattern.test(command)) {
                return (
                    `⚠ Blocked: Command rejected by sanitizer.\n` +
                    `Reason: ${reason}\n` +
                    `Command: ${command}\n` +
                    `Use a safer alternative or refine your approach.`
                );
            }
        }

        if (!_sandboxManager || !_sandboxManager.isActive()) {
            throw new Error(
                "Sandbox is not active. Cannot execute bash commands without an active sandbox session."
            );
        }

        if (_fileSync && _fileSync.pendingCount() > 0) {
            await _fileSync.syncToSandbox(_sandboxManager);
        }

        const result = await _sandboxManager.exec(command);
        if (result.exitCode !== 0) {
            return `Command failed (exit code ${result.exitCode}):\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`;
        }

        return result.stdout || "(no output)";
    },
    {
        name: "bash",
        description:
            "Runs a shell command inside an isolated sandbox. Use for tests, scripts, or installing dependencies. The host machine is never exposed.",
        schema: z.object({
            command: z.string().describe("The shell command to execute"),
        }),
    }
);
