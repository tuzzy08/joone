import { EventEmitter } from "node:events";
import { AgentEventEmitter } from "./events.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage, AIMessage, ToolMessage, AIMessageChunk, HumanMessage } from "@langchain/core/messages";
import { Runnable } from "@langchain/core/runnables";
import { ContextState } from "./promptBuilder.js";
import { SessionTracer } from "../tracing/sessionTracer.js";
import { countMessageTokens, extractCacheMetrics } from "./tokenCounter.js";
import { SessionStore } from "./sessionStore.js";
import { wrapLLMError, JooneError, ToolExecutionError } from "./errors.js";
import { SystemMessage } from "@langchain/core/messages";
import { AutoSave } from "./autoSave.js";
import { createDeepAgent } from "deepagents";
import { WhitelistedLocalShellBackend } from "../sandbox/whitelistedBackend.js";
import { StructuredTool, createMiddleware } from "langchain";
import { createLoopDetectionMiddleware } from "../middleware/loopDetection.js";
import { Command } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph";
import * as path from "node:path";
import * as os from "node:os";

export interface StreamStepOptions {
    /** Called for each text token received from the stream. */
    onToken?: (token: string) => void;
}

export class ExecutionHarness extends EventEmitter implements AgentEventEmitter {
    private agent: any;
    public tracer: SessionTracer;
    private sessionStore: SessionStore;
    public sessionId: string;
    private provider: string;
    private model: string;
    public autoSave: AutoSave;
    
    constructor(
        boundLlm: Runnable<any, AIMessageChunk> | BaseChatModel,
        tools: StructuredTool[] = [],
        tracer?: SessionTracer,
        provider: string = "unknown",
        model: string = "unknown",
        sessionId?: string,
        maxTokens: number = 4096,
        permissionMode: string = "auto",
        executionMode: "host" | "sandbox" = "host"
    ) {
        super();
        this.tracer = tracer ?? new SessionTracer();
        this.sessionStore = new SessionStore();
        this.sessionId = sessionId ?? this.tracer.getSessionId();
        this.provider = provider;
        this.model = model;
        this.autoSave = new AutoSave(this.sessionId, this.sessionStore);

        const checkpointer = new MemorySaver();
        
        let interruptOn = undefined;
        if (permissionMode === "ask_dangerous") {
            interruptOn = { "bash": true, "write_file": true, "install_host_dependencies": true };
        } else if (permissionMode === "ask_all") {
            // Note: Ask user question tool expects to run normally
            interruptOn = tools.reduce((acc, t) => {
                if (t.name !== "ask_user_question") {
                    acc[t.name] = true;
                }
                return acc;
            }, {} as Record<string, boolean>);
        }

        const injectSystemMessage = createMiddleware({
            name: "InjectSystemMessage",
            beforeAgent: async (request: any, handler: any) => {
                const { state } = request;
                const sysContent = `${state.globalSystemInstructions}\n\nProject Memory:\n${state.projectMemory}\n\nSession Context:\n${state.sessionContext}`;
                return handler({
                    ...request,
                    systemMessage: new SystemMessage(sysContent),
                });
            }
        });

        const backend = executionMode === "sandbox" 
            ? new WhitelistedLocalShellBackend({ rootDir: process.cwd(), virtualMode: true }) // TODO: CloudSandboxBackend
            : new WhitelistedLocalShellBackend({ rootDir: process.cwd(), virtualMode: false });

        this.agent = createDeepAgent({
            model: boundLlm as any,
            tools: tools as any[],
            backend,
            systemPrompt: "", // Injected via middleware
            middleware: [injectSystemMessage, createLoopDetectionMiddleware(3)],
            checkpointer,
            interruptOn,
        });
    }

    /**
     * Executes the agent loop autonomously, yielding events instead of 
     * requiring App.tsx to manually loop.
     */
    public async *run(state: ContextState, resumeCommand?: Command): AsyncGenerator<any> {
        const streamOptions = {
            configurable: { thread_id: this.sessionId },
            streamMode: "values" as const
        };

        const config = resumeCommand ? resumeCommand : state;

        // If resuming an interrupt, we pass a Command object.
        // Otherwise, we pass the state.
        const stream = await this.agent.streamEvents(config, {
            ...streamOptions,
            version: "v2"
        });

        for await (const event of stream) {
            // Let the UI know about tool execution and token generation
            if (event.event === "on_chat_model_stream") {
                if (event.data?.chunk?.content) {
                    this.emit("agent:event", {
                        type: "agent:stream",
                        token: event.data.chunk.content
                    });
                }
            }
            
            yield event;
        }

        await this.autoSave.tick({ config: { provider: this.provider, model: this.model }, state });
    }
}
