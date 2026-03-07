import { exec } from "node:child_process";
import { promisify } from "node:util";
import { DynamicToolInterface, ToolResult } from "./index.js";
import { AgentEventEmitter } from "../core/events.js";

const execAsync = promisify(exec);

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
