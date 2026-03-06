import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionStore } from "../../src/core/sessionStore.js";
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from "@langchain/core/messages";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const SESSIONS_DIR = path.join(os.homedir(), ".joone", "sessions");

describe("SessionStore", () => {
    let store: SessionStore;
    const testSessionId = `test-session-${Date.now()}`;
    const testFilePath = path.join(SESSIONS_DIR, `${testSessionId}.jsonl`);

    beforeEach(() => {
        store = new SessionStore();
    });

    afterEach(() => {
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    });

    it("should serialize and deserialize a complex conversation history perfectly", async () => {
        const initialState = {
            globalSystemInstructions: "You are a test agent.",
            projectMemory: "Project X",
            sessionContext: "Windows 11",
            conversationHistory: [
                new SystemMessage("Injected dynamic system rules."),
                new HumanMessage("Hello agent!"),
                new AIMessage({
                    content: "Let me use a tool.",
                    tool_calls: [{ id: "call_abc123", name: "bash", args: { command: "ls" }, type: "tool_call" }]
                }),
                new ToolMessage({
                    tool_call_id: "call_abc123",
                    content: "file1.txt\nfile2.txt"
                })
            ]
        };

        // 1. Save it
        await store.saveSession(testSessionId, initialState, "anthropic", "claude-3-opus");

        // Verify file exists
        expect(fs.existsSync(testFilePath)).toBe(true);

        // 2. Load it back
        const loaded = await store.loadSession(testSessionId);

        // Verify Header & Metadata
        expect(loaded.header.sessionId).toBe(testSessionId);
        expect(loaded.header.provider).toBe("anthropic");
        expect(loaded.header.model).toBe("claude-3-opus");
        expect(loaded.header.description).toBe("Hello agent!...");
        
        // Verify State Primitives
        expect(loaded.state.globalSystemInstructions).toBe("You are a test agent.");
        expect(loaded.state.projectMemory).toBe("Project X");
        expect(loaded.state.sessionContext).toBe("Windows 11");

        // Verify LangChain Objects Extracted correctly
        const history = loaded.state.conversationHistory;
        expect(history.length).toBe(4);
        
        expect(history[0]).toBeInstanceOf(HumanMessage);
        expect(history[0].content).toBe("<system-reminder>\nInjected dynamic system rules.\n</system-reminder>");
        
        expect(history[1]).toBeInstanceOf(HumanMessage);
        expect(history[1].content).toBe("Hello agent!");
        
        expect(history[2]).toBeInstanceOf(AIMessage);
        const aiMsg = history[2] as AIMessage;
        expect(aiMsg.content).toBe("Let me use a tool.");
        expect(aiMsg.tool_calls![0].id).toBe("call_abc123");
        expect(aiMsg.tool_calls![0].name).toBe("bash");
        
        expect(history[3]).toBeInstanceOf(ToolMessage);
        expect((history[3] as ToolMessage).tool_call_id).toBe("call_abc123");
        expect(history[3].content).toBe("file1.txt\nfile2.txt");
    });
});
