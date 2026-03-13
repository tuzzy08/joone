import { exec } from "node:child_process";
import { promisify } from "node:util";
import { tool } from "langchain";
import { z } from "zod";

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

export const installHostDependenciesTool = tool(
    async ({ command }: { command: string }) => {
        const trimmedCmd = command.trim();
        const parts = trimmedCmd.split(/\s+/);
        const bin = parts[0];
        const subcmd = parts[1];

        if (!ALLOWED_INSTALLERS[bin] || !ALLOWED_INSTALLERS[bin].has(subcmd)) {
            return `Security Error: Command '${bin} ${subcmd}' is not allowed. Only dependency installation commands (like 'npm install') are permitted by this tool.`;
        }

        if (/[&|;`$]/.test(trimmedCmd)) {
            return `Security Error: Command contains forbidden shell operators (&, |, ;, \`, $).`;
        }
        
        try {
            const { stdout, stderr } = await execAsync(command, { cwd: process.cwd() });
            return `Successfully ran on host:\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
        } catch (error: any) {
            return `Host command failed (exit code ${error.code}):\nSTDOUT:\n${error.stdout}\nSTDERR:\n${error.stderr}\nMESSAGE:\n${error.message}`;
        }
    },
    {
        name: "install_host_dependencies",
        description:
            "Installs dependencies natively on the host OS (e.g. npm install, pip install). Use this carefully to bootstrap projects outside the sandbox. This runs directly on the user's machine.",
        schema: z.object({
            command: z.string().describe("The native installation command (e.g., 'npm install express')"),
        }),
    }
);
