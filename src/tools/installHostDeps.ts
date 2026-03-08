import { exec } from "node:child_process";
import { promisify } from "node:util";
import { DynamicToolInterface, ToolResult } from "./index.js";
import { AgentEventEmitter } from "../core/events.js";

const execAsync = promisify(exec);

const ALLOWED_INSTALLERS: Record<string, Set<string>> = {
    npm: new Set(["install", "i", "ci", "add"]),
    yarn: new Set(["add", "install"]),
    pnpm: new Set(["add", "install", "i"]),
    pip: new Set(["install"]),
    pip3: new Set(["install"]),
    cargo: new Set(["add", "install"]),
    poetry: new Set(["add", "install"]),
    gem: new Set(["install"]),
    composer: new Set(["require", "install"]),
    go: new Set(["get", "install"]),
    bun: new Set(["add", "install"]),
};

export const InstallHostDependenciesTool: DynamicToolInterface = {
    name: "install_host_dependencies",
    description:
        "Installs dependencies natively on the host OS (e.g. npm install, pip install). Use this carefully to bootstrap projects outside the sandbox. This runs directly on the user's machine.",
    schema: {
        type: "object",
        properties: {
            command: {
                type: "string",
                description: "The native installation command (e.g., 'npm install express')",
            },
        },
        required: ["command"],
    },
    execute: async (args: { command: string }, emitter?: AgentEventEmitter): Promise<ToolResult> => {
        if (emitter) {
            emitter.emit("agent:event", { type: "system:script_exec", command: args.command, location: "host" });
        }

        const trimmedCmd = args.command.trim();
        const parts = trimmedCmd.split(/\s+/);
        const bin = parts[0];
        const subcmd = parts[1];

        if (!ALLOWED_INSTALLERS[bin] || !ALLOWED_INSTALLERS[bin].has(subcmd)) {
            return {
                content: `Security Error: Command '${bin} ${subcmd}' is not allowed. Only dependency installation commands (like 'npm install') are permitted by this tool.`,
                isError: true,
            };
        }

        if (/[&|;`$]/.test(trimmedCmd)) {
            return {
                content: `Security Error: Command contains forbidden shell operators (&, |, ;, \`, $).`,
                isError: true,
            };
        }
        
        try {
            const { stdout, stderr } = await execAsync(args.command, { cwd: process.cwd() });
            return {
                content: `Successfully ran on host:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
                isError: false,
            };
        } catch (error: any) {
             return {
                content: `Host command failed (exit code ${error.code}):\nSTDOUT:\n${error.stdout}\nSTDERR:\n${error.stderr}\nMESSAGE:\n${error.message}`,
                metadata: { exitCode: error.code },
                isError: true
            };
        }
    },
};
