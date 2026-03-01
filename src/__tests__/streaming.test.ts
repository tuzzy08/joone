import { describe, it, expect, vi } from "vitest";
import { AIMessageChunk } from "@langchain/core/messages";
import { ExecutionHarness } from "../core/agentLoop.js";
import { ContextState } from "../core/promptBuilder.js";

/**
 * Creates a mock LLM that yields predefined chunks when .stream() is called.
 * This avoids real API calls while testing streaming behavior.
 */
function createMockStreamingLlm(chunks: AIMessageChunk[]) {
  return {
    invoke: vi.fn(),
    stream: vi.fn().mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        for (const chunk of chunks) {
          yield chunk;
        }
      },
    }),
  };
}

describe("ExecutionHarness Streaming", () => {
  const baseState: ContextState = {
    globalSystemInstructions: "You are a helpful assistant.",
    projectMemory: "",
    sessionContext: "",
    conversationHistory: [],
  };

  // ─── RED Test #8: streamStep emits text chunks to a callback ───

  it("emits text content chunks to an onToken callback", async () => {
    const chunks = [
      new AIMessageChunk({ content: "Hello" }),
      new AIMessageChunk({ content: " world" }),
      new AIMessageChunk({ content: "!" }),
    ];
    const mockLlm = createMockStreamingLlm(chunks);
    const harness = new ExecutionHarness(mockLlm as any);

    const receivedTokens: string[] = [];
    const result = await harness.streamStep(baseState, {
      onToken: (token: string) => receivedTokens.push(token),
    });

    // Callback should have received each text chunk
    expect(receivedTokens).toEqual(["Hello", " world", "!"]);

    // The returned message should contain the full concatenated content
    expect(result.content).toBe("Hello world!");
  });

  // ─── RED Test #9: streamStep buffers tool calls and returns complete AIMessage ───

  it("buffers tool call chunks and returns a complete AIMessage with tool_calls", async () => {
    const chunks = [
      new AIMessageChunk({
        content: "",
        tool_call_chunks: [
          { name: "read_file", args: '{"path": "', index: 0, id: "tc_1", type: "tool_call_chunk" },
        ],
      }),
      new AIMessageChunk({
        content: "",
        tool_call_chunks: [
          { name: undefined, args: 'src/index.ts"}', index: 0, id: undefined, type: "tool_call_chunk" },
        ],
      }),
    ];
    const mockLlm = createMockStreamingLlm(chunks);
    const harness = new ExecutionHarness(mockLlm as any);

    const result = await harness.streamStep(baseState, {});

    // The result should have tool_calls populated
    expect(result.tool_calls).toBeDefined();
    expect(result.tool_calls!.length).toBe(1);
    expect(result.tool_calls![0].name).toBe("read_file");
    expect(result.tool_calls![0].args).toEqual({ path: "src/index.ts" });
  });
});
