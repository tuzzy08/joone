import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";
import { 
    BaseMessage, 
    HumanMessage, 
    AIMessage, 
    SystemMessage, 
    ToolMessage 
} from "@langchain/core/messages";
import { ContextState } from "./promptBuilder.js";

// Ensure the sessions directory exists
const SESSIONS_DIR = path.join(os.homedir(), ".joone", "sessions");

export interface SessionHeader {
    sessionId: string;
    startedAt: number;
    lastSavedAt: number;
    provider: string;
    model: string;
    description: string;
}

export interface SessionStatePayload {
    header: SessionHeader;
    state: ContextState;
}

/**
 * Serializes and deserializes agent conversation history to streaming JSONL files.
 */
export class SessionStore {
    constructor() {
        if (!fs.existsSync(SESSIONS_DIR)) {
            fs.mkdirSync(SESSIONS_DIR, { recursive: true, mode: 0o700 });
        }
    }

    /**
     * Serializes a LangChain BaseMessage instance into a raw JSON object.
     */
    private serializeMessage(msg: BaseMessage): any {
        const base = {
            type: msg._getType(),
            content: msg.content,
        };

        if (msg instanceof AIMessage && msg.tool_calls && msg.tool_calls.length > 0) {
            (base as any).tool_calls = msg.tool_calls;
        }

        if (msg instanceof ToolMessage) {
            (base as any).tool_call_id = msg.tool_call_id;
        }

        return base;
    }

    /**
     * Rehydrates a raw JSON object back into a LangChain BaseMessage class instance.
     */
    private deserializeMessage(raw: any): BaseMessage {
        switch (raw.type) {
            case "human":
                return new HumanMessage(raw.content);
            case "ai":
                return new AIMessage({
                    content: raw.content,
                    tool_calls: raw.tool_calls || undefined,
                });
            case "system":
                // Remap old saved SystemMessages to HumanMessages to prevent provider index errors
                return new HumanMessage(`<system-reminder>\n${raw.content}\n</system-reminder>`);
            case "tool":
                return new ToolMessage({
                    content: raw.content,
                    tool_call_id: raw.tool_call_id,
                });
            default:
                throw new Error(`Unknown message type in session history: ${raw.type}`);
        }
    }

    /**
     * Saves the entire session state cleanly to a .jsonl file, overwriting the previous save.
     * We don't append to avoid partial mid-turn corruption. Since we compact the context,
     * the file size remains extremely small.
     */
    public async saveSession(
        sessionId: string, 
        state: ContextState, 
        provider: string, 
        model: string
    ): Promise<void> {
        const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
        
        let description = "Empty session";
        if (state.conversationHistory.length > 0) {
            const firstMsg = state.conversationHistory.find(m => m instanceof HumanMessage);
            if (firstMsg && typeof firstMsg.content === "string") {
                description = firstMsg.content.substring(0, 100).replace(/\n/g, " ") + "...";
            }
        }

        const header: SessionHeader = {
            sessionId,
            startedAt: fs.existsSync(filePath) ? (await this.loadHeader(sessionId))?.startedAt || Date.now() : Date.now(),
            lastSavedAt: Date.now(),
            provider,
            model,
            description,
        };

        const writeStream = fs.createWriteStream(filePath, { encoding: "utf8" });

        // Line 1: Header + System State
        const payload = {
            header,
            globalSystemInstructions: state.globalSystemInstructions,
            projectMemory: state.projectMemory,
            sessionContext: state.sessionContext,
        };
        writeStream.write(JSON.stringify({ __type: "header", ...payload }) + "\n");

        // Line 2+: conversationHistory messages
        for (const msg of state.conversationHistory) {
            writeStream.write(JSON.stringify(this.serializeMessage(msg)) + "\n");
        }

        await new Promise((resolve) => writeStream.end(resolve));
    }

    /**
     * Loads the session state from disk.
     */
    public async loadSession(sessionId: string): Promise<SessionStatePayload> {
        const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
        if (!fs.existsSync(filePath)) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        const readStream = fs.createReadStream(filePath, { encoding: "utf8" });
        const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });

        let headerData: any = null;
        const conversationHistory: BaseMessage[] = [];

        for await (const line of rl) {
            if (!line.trim()) continue;
            const parsed = JSON.parse(line);

            if (parsed.__type === "header") {
                headerData = parsed;
            } else {
                conversationHistory.push(this.deserializeMessage(parsed));
            }
        }

        if (!headerData) {
            throw new Error(`Malformed session file: Missing header block in ${sessionId}.jsonl`);
        }

        return {
            header: headerData.header,
            state: {
                globalSystemInstructions: headerData.globalSystemInstructions,
                projectMemory: headerData.projectMemory,
                sessionContext: headerData.sessionContext,
                conversationHistory,
            }
        };
    }

    /**
     * Only reads the first line of the given session file to quickly extract the header.
     */
    private async loadHeader(sessionId: string): Promise<SessionHeader | null> {
        const filePath = path.join(SESSIONS_DIR, `${sessionId}.jsonl`);
        if (!fs.existsSync(filePath)) return null;

        const readStream = fs.createReadStream(filePath, { encoding: "utf8" });
        const rl = readline.createInterface({ input: readStream, crlfDelay: Infinity });

        for await (const line of rl) {
            if (!line.trim()) continue;
            const parsed = JSON.parse(line);
            if (parsed.__type === "header") {
                readStream.close();
                return parsed.header as SessionHeader;
            }
        }
        return null;
    }

    /**
     * Lists all saved sessions, sorted by most recently saved.
     */
    public async listSessions(): Promise<SessionHeader[]> {
        if (!fs.existsSync(SESSIONS_DIR)) return [];

        const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".jsonl"));
        const sessions: SessionHeader[] = [];

        for (const file of files) {
            const sessionId = file.replace(".jsonl", "");
            const header = await this.loadHeader(sessionId);
            if (header) {
                sessions.push(header);
            }
        }

        return sessions.sort((a, b) => b.lastSavedAt - a.lastSavedAt);
    }
}
