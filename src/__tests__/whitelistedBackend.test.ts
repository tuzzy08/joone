import { describe, it, expect } from "vitest";
import { WhitelistedLocalShellBackend } from "../sandbox/whitelistedBackend.js";

describe("WhitelistedLocalShellBackend", () => {
    it("allows safe commands", async () => {
        const backend = new WhitelistedLocalShellBackend({ rootDir: process.cwd() });

        const result = await backend.execute("echo hello");
        expect(result.output).toMatch(/hello/i);
        expect(result.exitCode).toBe(0); // Works on Windows native echo
    });

    it("blocks dangerous commands", async () => {
        const backend = new WhitelistedLocalShellBackend({ rootDir: process.cwd() });
        
        const result = await backend.execute("rm -rf /");
        expect(result.exitCode).toBe(1);
        expect(result.output).toMatch(/Security Error/i);
        expect(result.output).toMatch(/not allowed/i);
    });
});
