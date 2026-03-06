import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ConversationCompactor,
  COMPACT_SYSTEM_PROMPT,
  createHandoffPrompt,
  FAST_MODEL_DEFAULTS,
  resolveFastModel,
} from "../../src/core/compactor.js";
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { CacheOptimizedPromptBuilder } from "../../src/core/promptBuilder.js";

// ─── Mock LLM ───────────────────────────────────────────────────────────────────

function createMockLLM(response: string = "## Summary\nMocked summary.") {
  return {
    invoke: vi.fn().mockResolvedValue(new AIMessage(response)),
  };
}

function createFailingLLM() {
  return {
    invoke: vi.fn().mockRejectedValue(new Error("LLM call failed")),
  };
}

// ─── Test History ───────────────────────────────────────────────────────────────

function makeHistory(count: number) {
  const msgs = [];
  for (let i = 0; i < count; i++) {
    if (i % 2 === 0) {
      msgs.push(new HumanMessage(`User message ${i}`));
    } else {
      msgs.push(new AIMessage(`Agent response ${i}`));
    }
  }
  return msgs;
}

// ─── FAST_MODEL_DEFAULTS ────────────────────────────────────────────────────────

describe("FAST_MODEL_DEFAULTS", () => {
  it("maps all major providers to fast models", () => {
    expect(FAST_MODEL_DEFAULTS["anthropic"]).toBe("claude-3-haiku-20240307");
    expect(FAST_MODEL_DEFAULTS["openai"]).toBe("gpt-4o-mini");
    expect(FAST_MODEL_DEFAULTS["google"]).toBe("gemini-2.5-flash");
    expect(FAST_MODEL_DEFAULTS["mistral"]).toBe("mistral-small-latest");
    expect(FAST_MODEL_DEFAULTS["groq"]).toBe("mixtral-8x7b-32768");
    expect(FAST_MODEL_DEFAULTS["deepseek"]).toBe("deepseek-chat");
  });
});

describe("resolveFastModel", () => {
  it("returns override when provided", () => {
    expect(resolveFastModel("anthropic", "claude-sonnet-4", "my-custom-model")).toBe("my-custom-model");
  });

  it("returns provider default when no override", () => {
    expect(resolveFastModel("anthropic", "claude-sonnet-4")).toBe("claude-3-haiku-20240307");
  });

  it("falls back to main model for unknown provider", () => {
    expect(resolveFastModel("unknown-provider", "main-model")).toBe("main-model");
  });
});

// ─── Compact Prompt ─────────────────────────────────────────────────────────────

describe("COMPACT_SYSTEM_PROMPT", () => {
  it("instructs preservation of file paths", () => {
    expect(COMPACT_SYSTEM_PROMPT).toContain("File paths");
  });

  it("instructs preservation of tool calls", () => {
    expect(COMPACT_SYSTEM_PROMPT).toContain("Tool calls");
  });

  it("instructs structured markdown format", () => {
    expect(COMPACT_SYSTEM_PROMPT).toContain("structured markdown");
  });
});

// ─── Handoff Prompt ─────────────────────────────────────────────────────────────

describe("createHandoffPrompt", () => {
  it("includes the timestamp", () => {
    const prompt = createHandoffPrompt("2026-03-06T15:00:00Z");
    expect(prompt).toContain("2026-03-06T15:00:00Z");
  });

  it("includes CONTEXT HANDOFF marker", () => {
    const prompt = createHandoffPrompt("now");
    expect(prompt).toContain("[CONTEXT HANDOFF]");
  });

  it("instructs not to redo work", () => {
    const prompt = createHandoffPrompt("now");
    expect(prompt).toContain("do NOT redo work");
  });
});

// ─── ConversationCompactor ──────────────────────────────────────────────────────

describe("ConversationCompactor", () => {
  let compactor: ConversationCompactor;

  beforeEach(() => {
    compactor = new ConversationCompactor();
  });

  it("skips compaction when history is shorter than keepLastN", async () => {
    const history = makeHistory(4);
    const llm = createMockLLM();

    const result = await compactor.compact(history, llm as any, { keepLastN: 8 });

    expect(result.evictedCount).toBe(0);
    expect(result.compactedHistory).toEqual(history);
    expect(result.llmUsed).toBe(false);
    expect(llm.invoke).not.toHaveBeenCalled();
  });

  it("compacts with LLM and preserves recent messages", async () => {
    const history = makeHistory(20);
    const llm = createMockLLM("## Files Modified\n- test.ts\n## Current State\nIn progress.");

    const result = await compactor.compact(history, llm as any, { keepLastN: 8 });

    expect(result.evictedCount).toBe(12);
    expect(result.llmUsed).toBe(true);
    expect(llm.invoke).toHaveBeenCalledTimes(1);

    // Should have: summary + handoff + 8 recent messages = 10 total
    expect(result.compactedHistory.length).toBe(10);

    // First message should be the compacted summary
    const summaryMsg = result.compactedHistory[0];
    expect(summaryMsg._getType()).toBe("system");
    expect(typeof summaryMsg.content === "string" && summaryMsg.content).toContain("COMPACTED CONVERSATION SUMMARY");

    // Second message should be the handoff
    const handoffMsg = result.compactedHistory[1];
    expect(handoffMsg._getType()).toBe("system");
    expect(typeof handoffMsg.content === "string" && handoffMsg.content).toContain("CONTEXT HANDOFF");

    // Remaining should be the last 8 messages from original history
    const recent = result.compactedHistory.slice(2);
    expect(recent).toEqual(history.slice(-8));
  });

  it("invokes LLM with compact prompt and evicted messages", async () => {
    const history = makeHistory(12);
    const llm = createMockLLM();

    await compactor.compact(history, llm as any, { keepLastN: 4 });

    const invokeCall = llm.invoke.mock.calls[0][0];
    expect(invokeCall.length).toBe(2); // System + Human

    const systemMsg = invokeCall[0];
    const humanMsg = invokeCall[1];

    // System msg should contain compact prompt
    expect(typeof systemMsg.content === "string" && systemMsg.content).toContain("conversation summarizer");

    // Human msg should contain evicted messages in readable format
    expect(typeof humanMsg.content === "string" && humanMsg.content).toContain("User message 0");
  });

  it("falls back to string-based compaction when LLM fails", async () => {
    const history = makeHistory(20);
    const llm = createFailingLLM();

    const result = await compactor.compact(history, llm as any, { keepLastN: 8 });

    expect(result.evictedCount).toBe(12);
    expect(result.llmUsed).toBe(false);

    // Should still have summary + handoff + 8 recent = 10 messages
    expect(result.compactedHistory.length).toBe(10);

    // Summary should mention fallback
    const summaryMsg = result.compactedHistory[0];
    expect(typeof summaryMsg.content === "string" && summaryMsg.content).toContain("Fallback Compaction");
  });

  it("handles token reduction properly", async () => {
    // Use a large history to ensure meaningful token reduction
    const history = makeHistory(40);
    const llm = createMockLLM("Short summary.");

    const result = await compactor.compact(history, llm as any, { keepLastN: 8 });

    // The compacted history (summary + handoff + 8 recent) should use fewer tokens
    // than the original 40 messages
    expect(result.tokensAfter).toBeLessThan(result.tokensBefore);
    expect(result.evictedCount).toBe(32);
  });
});

// ─── Integration with PromptBuilder ─────────────────────────────────────────────

describe("CacheOptimizedPromptBuilder.compactHistoryWithLLM", () => {
  it("delegates to ConversationCompactor", async () => {
    const builder = new CacheOptimizedPromptBuilder();
    const history = makeHistory(20);
    const llm = createMockLLM();

    const result = await builder.compactHistoryWithLLM(history, llm as any, 8);

    expect(result.evictedCount).toBe(12);
    expect(result.llmUsed).toBe(true);
    expect(result.compactedHistory.length).toBe(10);
  });
});
