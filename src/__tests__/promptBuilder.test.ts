import { describe, it, expect } from "vitest";
import {
  CacheOptimizedPromptBuilder,
  ContextState,
} from "../core/promptBuilder.js";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
} from "@langchain/core/messages";

describe("CacheOptimizedPromptBuilder", () => {
  // ─── Behavior 1: Static prefix ordering ───
  // The most critical behavior: the first 3 messages must ALWAYS be
  // SystemMessages in the order: global → project → session.
  // This is the foundation of prompt cache validity.

  it("builds prompt with static prefix in strict order: global, project, session", () => {
    const builder = new CacheOptimizedPromptBuilder();
    const state: ContextState = {
      globalSystemInstructions: "You are a coding assistant.",
      projectMemory: "Use TypeScript.",
      sessionContext: "OS: Windows",
      conversationHistory: [],
    };

    const messages = builder.buildPrompt(state);

    // Exactly 3 static messages when history is empty
    expect(messages).toHaveLength(3);

    // All 3 must be system-type messages
    expect(messages[0]._getType()).toBe("system");
    expect(messages[1]._getType()).toBe("system");
    expect(messages[2]._getType()).toBe("system");

    // Order must be: global → project → session
    expect(messages[0].content).toContain("You are a coding assistant.");
    expect(messages[1].content).toContain("Use TypeScript.");
    expect(messages[2].content).toContain("OS: Windows");
  });

  // ─── Behavior 2: Conversation history appended AFTER the static prefix ───
  // Dynamic messages must never appear before the static prefix.

  it("appends conversation history after the static prefix", () => {
    const builder = new CacheOptimizedPromptBuilder();
    const state: ContextState = {
      globalSystemInstructions: "System prompt.",
      projectMemory: "Project rules.",
      sessionContext: "Session info.",
      conversationHistory: [
        new HumanMessage("Hello"),
        new AIMessage("Hi there!"),
      ],
    };

    const messages = builder.buildPrompt(state);

    // 3 static + 2 conversation = 5
    expect(messages).toHaveLength(5);

    // First 3 are system messages (static prefix)
    expect(messages[0]._getType()).toBe("system");
    expect(messages[1]._getType()).toBe("system");
    expect(messages[2]._getType()).toBe("system");

    // Last 2 are conversation messages
    expect(messages[3]._getType()).toBe("human");
    expect(messages[4]._getType()).toBe("ai");
    expect(messages[3].content).toBe("Hello");
    expect(messages[4].content).toBe("Hi there!");
  });

  // ─── Behavior 3: Static prefix is identical across calls ───
  // If we call buildPrompt twice with the same state (but more history),
  // the first 3 messages must be byte-identical to preserve the cache.

  it("produces identical static prefix across multiple calls with growing history", () => {
    const builder = new CacheOptimizedPromptBuilder();
    const state: ContextState = {
      globalSystemInstructions: "Be helpful.",
      projectMemory: "Use strict types.",
      sessionContext: "Env: Node",
      conversationHistory: [],
    };

    const firstCall = builder.buildPrompt(state);

    // Simulate a conversation turn
    state.conversationHistory.push(new HumanMessage("What is 2+2?"));
    state.conversationHistory.push(new AIMessage("4"));

    const secondCall = builder.buildPrompt(state);

    // Static prefix (first 3 messages) must be identical
    expect(secondCall[0].content).toBe(firstCall[0].content);
    expect(secondCall[1].content).toBe(firstCall[1].content);
    expect(secondCall[2].content).toBe(firstCall[2].content);
  });

  // ─── Behavior 4: System reminder is injected as a HumanMessage ───

  it("injects a system reminder as a HumanMessage with <system-reminder> tags", () => {
    const builder = new CacheOptimizedPromptBuilder();
    const history = [new HumanMessage("Start task")];

    const updated = builder.injectSystemReminder(
      history,
      "File auth.ts was deleted."
    );

    // Original history is not mutated
    expect(history).toHaveLength(1);

    // Updated history has the reminder appended
    expect(updated).toHaveLength(2);
    expect(updated[1]._getType()).toBe("human");
    expect(updated[1].content).toContain("<system-reminder>");
    expect(updated[1].content).toContain("File auth.ts was deleted.");
    expect(updated[1].content).toContain("</system-reminder>");
  });

  // ─── Behavior 5: Compaction preserves recent messages with summary ───

  it("compacts history into summary + preserved recent messages", () => {
    const builder = new CacheOptimizedPromptBuilder();
    const longHistory = [
      new HumanMessage("Step 1"),
      new AIMessage("Done 1"),
      new HumanMessage("Step 2"),
      new AIMessage("Done 2"),
    ];

    const compacted = builder.compactHistory(
      longHistory,
      "Completed steps 1 and 2."
    );

    // Default keepLastN=6, history has 4 → summary + all 4 preserved
    expect(compacted).toHaveLength(5);
    expect(compacted[0]._getType()).toBe("system");
    expect(compacted[0].content).toContain("Completed steps 1 and 2.");
    // Recent messages are preserved after the summary
    expect(compacted[1].content).toBe("Step 1");
  });
});
