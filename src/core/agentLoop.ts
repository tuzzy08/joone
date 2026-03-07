import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage, AIMessage, ToolMessage, AIMessageChunk, HumanMessage } from "@langchain/core/messages";
import { Runnable } from "@langchain/core/runnables";
import { CacheOptimizedPromptBuilder, ContextState } from "./promptBuilder.js";
import { DynamicToolInterface } from "../tools/index.js";
import { MiddlewarePipeline } from "../middleware/pipeline.js";
import { ToolCallContext } from "../middleware/types.js";
import { SessionTracer } from "../tracing/sessionTracer.js";
import { countMessageTokens, extractCacheMetrics } from "./tokenCounter.js";
import { SessionStore } from "./sessionStore.js";
import { retryWithBackoff } from "./retry.js";
import { wrapLLMError, JooneError, ToolExecutionError } from "./errors.js";
import { SystemMessage } from "@langchain/core/messages";
import { ContextGuard, getProviderContextLimit } from "./contextGuard.js";
import { AutoSave } from "./autoSave.js";
import { EventEmitter } from "node:events";
import { AgentEvent, AgentEventEmitter } from "./events.js";

export interface StreamStepOptions {
    /** Called for each text token received from the stream. */
    onToken?: (token: string) => void;
}

export class ExecutionHarness extends EventEmitter implements AgentEventEmitter {
    private llm: Runnable<any, AIMessageChunk> | BaseChatModel;
    private promptBuilder: CacheOptimizedPromptBuilder;
    private availableTools: DynamicToolInterface[];
    private pipeline: MiddlewarePipeline;
    public tracer: SessionTracer;
    private sessionStore: SessionStore;
    public sessionId: string;
    private provider: string;
    private model: string;
    private contextGuard: ContextGuard;
    public autoSave: AutoSave;
    
    /**
     * Initializes the harness with a pre-configured, tool-bound LLM instance.
     * This allows swapping between Anthropic Claude, OpenAI GPT-4, Google Gemini, etc.
     */
    constructor(
        boundLlm: Runnable<any, AIMessageChunk> | BaseChatModel,
        tools: DynamicToolInterface[] = [],
        pipeline?: MiddlewarePipeline,
        tracer?: SessionTracer,
        provider: string = "unknown",
        model: string = "unknown",
        sessionId?: string,
        maxTokens: number = 4096
    ) {
        super();
        this.llm = boundLlm;
        this.promptBuilder = new CacheOptimizedPromptBuilder();
        this.availableTools = tools;
        this.pipeline = pipeline ?? new MiddlewarePipeline();
        this.tracer = tracer ?? new SessionTracer();
        this.sessionStore = new SessionStore();
        this.sessionId = sessionId ?? this.tracer.getSessionId();
        this.provider = provider;
        this.model = model;
        const contextLimit = getProviderContextLimit(this.provider, this.model);
        this.contextGuard = new ContextGuard(this.llm, contextLimit, this.promptBuilder);
        this.autoSave = new AutoSave(this.sessionId, this.sessionStore);
    }

    /**
     * The main execution engine (non-streaming).
     * Takes the context state, builds the cache-optimized prompt, and queries the LLM.
     */
    public async step(state: ContextState): Promise<AIMessage> {
        const start = Date.now();
        
        // ContextGuard: Check capacity before building prompt
        const { state: updatedState, metrics } = await this.contextGuard.ensureCapacity(state);
        state = updatedState; // Reassign state if compacted
        
        const messages = this.promptBuilder.buildPrompt(state);

        try {
            const response = await retryWithBackoff(
                () => this.llm.invoke(messages).catch((e) => { throw wrapLLMError(e, this.provider); }),
                {
                    onRetry: (attempt, error, delay) => {
                        this.tracer.recordError({ message: `LLM retry #${attempt}: ${error.message} (waiting ${delay}ms)` });
                    },
                }
            );

            const promptTokens = countMessageTokens(messages);
            const completionTokens = countMessageTokens([response as AIMessage]);
            const cacheMetrics = extractCacheMetrics(response as AIMessage, this.provider);

            this.tracer.recordLLMCall({
                promptTokens,
                completionTokens,
                cached: cacheMetrics.cachedTokens > 0,
                cachedTokens: cacheMetrics.cachedTokens,
                duration: Date.now() - start
            });

            await this.autoSave.tick({ config: { provider: this.provider, model: this.model }, state });
            return response as AIMessage;
        } catch (error: unknown) {
            // Self-recovery: inject the error hint and let the agent adapt
            if (error instanceof JooneError && error.retryable) {
                this.tracer.recordError({ message: `LLM retries exhausted: ${error.message}` });
                state.conversationHistory.push(new HumanMessage(`<system-alert>\nSystem recovery hint:\n${error.toRecoveryHint()}\n</system-alert>`));
                await this.autoSave.forceSave({ config: { provider: this.provider, model: this.model }, state });
                // Return a synthetic AI message so the turn doesn't crash
                return new AIMessage(error.toRecoveryHint());
            }
            throw error; // Fatal (auth, config) — propagate to TUI
        }
    }

    /**
     * Streaming execution engine.
     * Streams text tokens via the onToken callback and buffers tool call chunks
     * until the full call is received. Returns a complete AIMessage for history.
     */
    public async streamStep(
        state: ContextState,
        options: StreamStepOptions
    ): Promise<AIMessage> {
        const start = Date.now();
        
        // ContextGuard: Check capacity before building prompt
        const { state: updatedState, metrics } = await this.contextGuard.ensureCapacity(state);
        state = updatedState;
        
        const messages = this.promptBuilder.buildPrompt(state);

        try {
            const result = await retryWithBackoff(
                async () => {
                    let fullContent = "";
                    const toolCallBuffers: Map<number, { id: string; name: string; argsJson: string }> = new Map();

                    let stream: AsyncIterable<any>;
                    try {
                        stream = await (this.llm as any).stream(messages);
                    } catch (e) {
                        throw wrapLLMError(e, this.provider);
                    }

                    for await (const chunk of stream) {
                        if (chunk.content && typeof chunk.content === "string") {
                            fullContent += chunk.content;
                            if (options.onToken) {
                                options.onToken(chunk.content);
                            }
                            this.emit("agent:event", { type: "agent:stream", token: chunk.content });
                        }

                        if (chunk.tool_call_chunks && chunk.tool_call_chunks.length > 0) {
                            for (const tc of chunk.tool_call_chunks) {
                                const idx = tc.index ?? 0;
                                if (!toolCallBuffers.has(idx)) {
                                    toolCallBuffers.set(idx, {
                                        id: tc.id || "",
                                        name: tc.name || "",
                                        argsJson: "",
                                    });
                                }
                                const buf = toolCallBuffers.get(idx)!;
                                if (tc.id) buf.id = tc.id;
                                if (tc.name) buf.name = tc.name;
                                if (tc.args) buf.argsJson += tc.args;
                            }
                        }
                    }

                    const toolCalls = Array.from(toolCallBuffers.values()).map((buf) => ({
                        id: buf.id,
                        name: buf.name,
                        args: (() => {
                            try {
                                return JSON.parse(buf.argsJson || "{}");
                            } catch {
                                return { _parseError: true, rawArgs: buf.argsJson };
                            }
                        })(),
                        type: "tool_call" as const,
                    }));

                    return new AIMessage({
                        content: fullContent,
                        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
                    });
                },
                {
                    onRetry: (attempt, error, delay) => {
                        this.tracer.recordError({ message: `LLM stream retry #${attempt}: ${error.message} (waiting ${delay}ms)` });
                    },
                }
            );

            const promptTokens = countMessageTokens(messages);
            const completionTokens = countMessageTokens([result]);
            const cacheMetrics = extractCacheMetrics(result, this.provider);

            this.tracer.recordLLMCall({
                promptTokens,
                completionTokens,
                cached: cacheMetrics.cachedTokens > 0,
                cachedTokens: cacheMetrics.cachedTokens,
                duration: Date.now() - start
            });

            await this.autoSave.tick({ config: { provider: this.provider, model: this.model }, state });
            return result;
        } catch (error: unknown) {
            // Self-recovery for streaming
            if (error instanceof JooneError && error.retryable) {
                this.tracer.recordError({ message: `LLM stream retries exhausted: ${(error as JooneError).message}` });
                state.conversationHistory.push(new HumanMessage(`<system-alert>\nSystem recovery hint:\n${(error as JooneError).toRecoveryHint()}\n</system-alert>`));
                await this.autoSave.forceSave({ config: { provider: this.provider, model: this.model }, state });
                return new AIMessage((error as JooneError).toRecoveryHint());
            }
            throw error;
        }
    }

    /**
     * Executes tool calls from an AI response, routing through the middleware pipeline.
     * Each call passes through all registered before-hooks, then the tool, then after-hooks.
     */
    public async executeToolCalls(aiMessage: AIMessage, state: ContextState): Promise<(ToolMessage | HumanMessage)[]> {
        const results: (ToolMessage | HumanMessage)[] = [];
        
        if (!aiMessage.tool_calls || aiMessage.tool_calls.length === 0) {
            return results;
        }

        for (const call of aiMessage.tool_calls) {
            // Soft-Fail Edge Case: If the LLM omits the tool_call_id, do not execute the tool.
            // Return a HumanMessage prompting correction instead of a malformed ToolMessage.
            if (!call.id) {
                this.tracer.recordError({ message: `Malformed tool call: Missing ID for ${call.name}`, tool: call.name });
                results.push(new HumanMessage(
                    `You attempted to call the tool '${call.name}', but you did not provide a tool_call_id. ` +
                    `This is a malformed request. Please try again and ensure you provide a valid ID.`
                ));
                continue;
            }

            const safeCallId = call.id;

            // Handle malformed args from streaming parse errors
            if (call.args && call.args._parseError) {
                this.tracer.recordError({ message: `Failed to parse tool arguments`, tool: call.name });
                results.push(new ToolMessage({
                    content: `Error: Failed to parse tool arguments. The JSON provided was malformed:\n${call.args.rawArgs}\nPlease correct the JSON format and try again.`,
                    tool_call_id: safeCallId
                }));
                continue;
            }

            const tool = this.availableTools.find(t => t.name === call.name);
            if (!tool) {
                this.tracer.recordError({ message: `Tool ${call.name} not found`, tool: call.name });
                results.push(new ToolMessage({
                    content: `Error: Tool ${call.name} not found.`,
                    tool_call_id: safeCallId
                }));
                continue;
            }

            const ctx: ToolCallContext = {
                toolName: call.name,
                args: call.args,
                callId: safeCallId,
            };

            const start = Date.now();
            this.emit("agent:event", { type: "tool:start", toolName: call.name, args: JSON.stringify(call.args) });
            try {
                const output = await this.pipeline.run(
                    ctx,
                    async (c) => tool.execute(c.args)
                );
                this.tracer.recordToolCall({
                    name: call.name,
                    args: call.args,
                    result: typeof output === "string" ? output : JSON.stringify(output).substring(0, 100),
                    duration: Date.now() - start,
                    success: true
                });
                
                const stringifiedOutput = typeof output === "string" ? output : JSON.stringify(output);
                this.emit("agent:event", { type: "tool:end", toolName: call.name, result: stringifiedOutput, durationMs: Date.now() - start });
                results.push(new ToolMessage({
                    content: stringifiedOutput,
                    tool_call_id: safeCallId
                }));
            } catch (error: any) {
                const toolError = new ToolExecutionError(error.message, {
                    toolName: call.name,
                    args: call.args,
                    retryable: false,
                    cause: error,
                });
                this.tracer.recordToolCall({
                    name: call.name,
                    args: call.args,
                    duration: Date.now() - start,
                    success: false
                });
                this.tracer.recordError({ message: toolError.message, tool: call.name });
                this.emit("agent:event", { type: "tool:end", toolName: call.name, result: `Error: ${toolError.message}`, durationMs: Date.now() - start });
                results.push(new ToolMessage({
                    content: toolError.toRecoveryHint(),
                    tool_call_id: safeCallId
                }));
            }
        }

        // Add the tool results to the state immediately before saving
        state.conversationHistory.push(...results);
        await this.autoSave.tick({ config: { provider: this.provider, model: this.model }, state });

        return results;
    }
}
