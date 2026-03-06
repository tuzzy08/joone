import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SessionResumer } from "../../src/core/sessionResumer.js";
import { AIMessage, HumanMessage, ToolMessage, SystemMessage } from "@langchain/core/messages";
import { ContextState } from "../../src/core/promptBuilder.js";
import { SessionStatePayload } from "../../src/core/sessionStore.js";
import * as fs from "node:fs";

// Mock the Node FS module so we can simulate mtime drifts
vi.mock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    return {
        ...actual,
        existsSync: vi.fn(),
        statSync: vi.fn(),
    };
});

describe("SessionResumer", () => {
    const resumer = new SessionResumer("/mock/workspace");

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should detect drift on files where mtime > lastSavedAt", () => {
        const state: ContextState = {
            globalSystemInstructions: "",
            projectMemory: "",
            sessionContext: "",
            conversationHistory: [
                new AIMessage({
                    content: "Let me modify file_a.ts and read file_b.ts",
                    tool_calls: [
                        { id: "1", name: "write_file", args: { path: "file_a.ts", content: "..." }, type: "tool_call" },
                        { id: "2", name: "read_file", args: { path: "file_b.ts" }, type: "tool_call" },
                        { id: "3", name: "bash", args: { command: "ls" }, type: "tool_call" } // Not a file target
                    ]
                })
            ]
        };

        const lastSavedAt = 1000;
        
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.statSync).mockImplementation((pathStr) => {
            if (pathStr.toString().includes("file_a.ts")) {
                return { mtimeMs: 2000 } as fs.Stats; // Drifted!
            }
            if (pathStr.toString().includes("file_b.ts")) {
                return { mtimeMs: 500 } as fs.Stats; // Safe
            }
            return { mtimeMs: 0 } as fs.Stats;
        });

        const driftedFiles = resumer.detectFileDrift(state, lastSavedAt);
        expect(driftedFiles).toContain("file_a.ts");
        expect(driftedFiles).not.toContain("file_b.ts");
        expect(driftedFiles.length).toBe(1);
    });

    it("should inject the wakeup prompt into the state", () => {
        const payload: SessionStatePayload = {
            header: {
                sessionId: "123",
                startedAt: 0,
                lastSavedAt: 1000,
                provider: "test",
                model: "test",
                description: ""
            },
            state: {
                globalSystemInstructions: "sys",
                projectMemory: "mem",
                sessionContext: "ctx",
                conversationHistory: [new HumanMessage("hello")]
            }
        };

        vi.mocked(fs.existsSync).mockReturnValue(false); // Simulate no drifted files
        
        const resumedState = resumer.prepareForResume(payload);
        
        const lastMsg = resumedState.conversationHistory[resumedState.conversationHistory.length - 1];
        expect(lastMsg).toBeInstanceOf(HumanMessage);
        
        const content = textContent(lastMsg.content);
        expect(content).toContain("[SYSTEM NOTIFICATION: SESSION RESUMED]");
        expect(content).toContain("No files in your active context appear to have been edited");
    });

    function textContent(c: string | any[]): string {
        if (typeof c === "string") return c;
        return c.map(part => part.text).join("");
    }
});
