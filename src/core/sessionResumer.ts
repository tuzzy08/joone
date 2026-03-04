import * as fs from "node:fs";
import * as path from "node:path";
import { ContextState } from "./promptBuilder.js";
import { SessionStatePayload } from "./sessionStore.js";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";

export class SessionResumer {
    private workspaceDir: string;

    constructor(workspaceDir: string) {
        this.workspaceDir = workspaceDir;
    }

    /**
     * Prepares a loaded session state for execution by detecting external drift
     * and injecting the Wakeup prompt so the LLM knows it is inside a fresh sandbox.
     */
    public prepareForResume(payload: SessionStatePayload): ContextState {
        const state = { ...payload.state };

        // 1. Detect File Drift
        const driftedFiles = this.detectFileDrift(state, payload.header.lastSavedAt);

        // 2. Formulate the Sandbox Amnesia & Drift Wakeup prompt
        let wakeupPrompt = `[SYSTEM NOTIFICATION: SESSION RESUMED]\n`;
        wakeupPrompt += `You were paused and have just been loaded into a **NEW** execution session. \n`;
        wakeupPrompt += `IMPORTANT CONTEXT:\n`;
        wakeupPrompt += `- The execution Sandbox is completely fresh. Any background processes, dev servers, or in-memory databases you were running previously are GONE. You must restart them if needed.\n`;
        
        if (driftedFiles.length > 0) {
            wakeupPrompt += `- The following files were mutated externally on the host machine while you were offline:\n`;
            for (const file of driftedFiles) {
                wakeupPrompt += `  - \`${file}\`\n`;
            }
            wakeupPrompt += `Before modifying these files using replace_file_content, you MUST re-read them using view_code_item or view_file to understand the external changes.\n`;
        } else {
            wakeupPrompt += `- No files in your active context appear to have been edited on the host while you were paused.\n`;
        }

        // Inject as a System Message at the very end of the history
        // so it acts as an immediate reminder before the next LLM generation.
        state.conversationHistory.push(new SystemMessage(wakeupPrompt));

        return state;
    }

    /**
     * Analyzes the conversation history for any files the agent has interacted with.
     * Checks their `mtime` against the session `lastSavedAt`.
     * If the file on disk is newer, it has drifted.
     */
    public detectFileDrift(state: ContextState, lastSavedAt: number): string[] {
        const interactedFiles = new Set<string>();

        // We deduce file interaction by looking at what tools were called
        for (const msg of state.conversationHistory) {
            if (msg instanceof AIMessage && msg.tool_calls) {
                for (const call of msg.tool_calls) {
                    if (call.name === "read_file" || call.name === "write_file" || call.name === "replace_file_content" || call.name === "multi_replace_file_content" || call.name === "view_file") {
                        let targetPath = "";
                        if (call.args.path) targetPath = call.args.path;
                        if (call.args.AbsolutePath) targetPath = call.args.AbsolutePath;
                        if (call.args.TargetFile) targetPath = call.args.TargetFile;

                        if (targetPath) {
                            interactedFiles.add(targetPath);
                        }
                    }
                }
            }
        }

        const drifted: string[] = [];

        for (const file of interactedFiles) {
            // Because paths might be absolute or relative, attempt resolution
            const absolutePath = path.isAbsolute(file) ? file : path.resolve(this.workspaceDir, file);
            
            if (fs.existsSync(absolutePath)) {
                const stats = fs.statSync(absolutePath);
                // If the file's modification time is STRICTLY greater than the save time, it drifted
                if (stats.mtimeMs > lastSavedAt) {
                    drifted.push(file);
                }
            }
        }

        return drifted;
    }
}
