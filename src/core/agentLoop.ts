import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage, AIMessage, ToolMessage, AIMessageChunk } from "@langchain/core/messages";
import { Runnable } from "@langchain/core/runnables";
import { CacheOptimizedPromptBuilder, ContextState } from "./promptBuilder.js";
import { DynamicToolInterface } from "../tools/index.js";
import { MiddlewarePipeline } from "../middleware/pipeline.js";
import { ToolCallContext } from "../middleware/types.js";
import { SessionTracer } from "../tracing/sessionTracer.js";
import { countMessageTokens } from "./tokenCounter.js";

export interface StreamStepOptions {
    /** Called for each text token received from the stream. */
    onToken?: (token: string) => void;
}

export class ExecutionHarness {
    private llm: Runnable<any, AIMessageChunk> | BaseChatModel;
    private promptBuilder: CacheOptimizedPromptBuilder;
    private availableTools: DynamicToolInterface[];
    private pipeline: MiddlewarePipeline;
    public tracer: SessionTracer;
    
    /**
     * Initializes the harness with a pre-configured, tool-bound LLM instance.
     * This allows swapping between Anthropic Claude, OpenAI GPT-4, Google Gemini, etc.
     */
    constructor(
        boundLlm: Runnable<any, AIMessageChunk> | BaseChatModel,
        tools: DynamicToolInterface[] = [],
        pipeline?: MiddlewarePipeline,
        tracer?: SessionTracer
    ) {
        this.llm = boundLlm;
        this.promptBuilder = new CacheOptimizedPromptBuilder();
        this.availableTools = tools;
        this.pipeline = pipeline ?? new MiddlewarePipeline();
        this.tracer = tracer ?? new SessionTracer();
    }

    /**
     * The main execution engine (non-streaming).
     * Takes the context state, builds the cache-optimized prompt, and queries the LLM.
     */
    public async step(state: ContextState): Promise<AIMessage> {
        const start = Date.now();
        const messages = this.promptBuilder.buildPrompt(state);
        const response = await this.llm.invoke(messages);
        
        const promptTokens = countMessageTokens(messages);
        const completionTokens = countMessageTokens([response as AIMessage]);
        
        this.tracer.recordLLMCall({
            promptTokens,
            completionTokens,
            cached: false,
            duration: Date.now() - start
        });
        
        return response as AIMessage;
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
        const messages = this.promptBuilder.buildPrompt(state);

        let fullContent = "";
        const toolCallBuffers: Map<number, { id: string; name: string; argsJson: string }> = new Map();

        const stream = await (this.llm as any).stream(messages);

        for await (const chunk of stream) {
            if (chunk.content && typeof chunk.content === "string") {
                fullContent += chunk.content;
                if (options.onToken) {
                    options.onToken(chunk.content);
                }
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
            args: JSON.parse(buf.argsJson || "{}"),
            type: "tool_call" as const,
        }));

        const result = new AIMessage({
            content: fullContent,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        const promptTokens = countMessageTokens(messages);
        const completionTokens = countMessageTokens([result]);
        
        this.tracer.recordLLMCall({
            promptTokens,
            completionTokens,
            cached: false,
            duration: Date.now() - start
        });

        return result;
    }

    /**
     * Executes tool calls from an AI response, routing through the middleware pipeline.
     * Each call passes through all registered before-hooks, then the tool, then after-hooks.
     */
    public async executeToolCalls(aiMessage: AIMessage): Promise<ToolMessage[]> {
        const results: ToolMessage[] = [];
        
        if (!aiMessage.tool_calls || aiMessage.tool_calls.length === 0) {
            return results;
        }

        for (const call of aiMessage.tool_calls) {
            const tool = this.availableTools.find(t => t.name === call.name);
            if (!tool) {
                this.tracer.recordError({ message: `Tool ${call.name} not found`, tool: call.name });
                results.push(new ToolMessage({
                    content: `Error: Tool ${call.name} not found.`,
                    tool_call_id: call.id as string
                }));
                continue;
            }

            const ctx: ToolCallContext = {
                toolName: call.name,
                args: call.args,
                callId: call.id as string,
            };

            const start = Date.now();
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
                results.push(new ToolMessage({
                    content: output,
                    tool_call_id: call.id as string
                }));
            } catch (error: any) {
                this.tracer.recordToolCall({
                    name: call.name,
                    args: call.args,
                    duration: Date.now() - start,
                    success: false
                });
                this.tracer.recordError({ message: error.message, tool: call.name });
                results.push(new ToolMessage({
                    content: `Error executing tool: ${error.message}`,
                    tool_call_id: call.id as string
                }));
            }
        }

        return results;
    }
}
