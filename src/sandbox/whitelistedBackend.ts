import { LocalShellBackend } from "deepagents";
import { tool } from "langchain";
import { z } from "zod";

const ALLOWED_BINARIES = new Set(["npm", "npx", "node", "ls", "dir", "echo", "cat", "git"]);

export class WhitelistedLocalShellBackend extends LocalShellBackend {
    constructor(config?: any) {
        super(config);
    }

    async execute(command: string) {
        const trimmed = command.trim();
        const binary = trimmed.split(/\s+/)[0];

        if (!ALLOWED_BINARIES.has(binary)) {
            return {
                output: `Security Error: Command '${binary}' is not allowed. Only [${Array.from(ALLOWED_BINARIES).join(", ")}] are permitted.`,
                exitCode: 1,
                truncated: false
            };
        }

        if (/[&|;`$]/.test(trimmed)) {
            return {
                output: `Security Error: Command contains forbidden shell operators (&, |, ;, \`, $).`,
                exitCode: 1,
                truncated: false
            };
        }

        return super.execute(command);
    }
}
