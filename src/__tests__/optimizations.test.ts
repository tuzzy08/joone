import { describe, it, expect, beforeEach } from "vitest";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import {
  SearchToolsTool,
  ActivateToolTool,
  activateTool,
  getActivatedTools,
  resetActivatedTools,
} from "../tools/registry.js";
import {
  estimateTokens,
  countMessageTokens,
  isNearCapacity,
} from "../core/tokenCounter.js";
import { CacheOptimizedPromptBuilder } from "../core/promptBuilder.js";
import {
  ReasoningRouter,
  ReasoningLevel,
} from "../core/reasoningRouter.js";

// ═══════════════════════════════════════════════════════════════════════════════
// 5a: Enhanced Tool Registry
// ═══════════════════════════════════════════════════════════════════════════════

describe("Enhanced Tool Registry", () => {
  beforeEach(() => {
    resetActivatedTools();
  });

  // ─── Test #56: Fuzzy search matches by description keyword ───

  it("fuzzy search matches tools by description keyword", async () => {
    const result = await SearchToolsTool.execute({ query: "commit" });

    expect(result).toContain("git_commit");
  });

  // ─── Test #57: Fuzzy search matches by name ───

  it("fuzzy search matches tools by name", async () => {
    const result = await SearchToolsTool.execute({ query: "grep" });

    expect(result).toContain("grep_search");
  });

  // ─── Test #58: activateTool adds tool to the active set ───

  it("activateTool adds a tool to the active set", () => {
    expect(getActivatedTools()).toHaveLength(0);

    const tool = activateTool("git_commit");

    expect(tool).toBeDefined();
    expect(tool!.name).toBe("git_commit");
    expect(getActivatedTools()).toHaveLength(1);
  });

  // ─── Test #59: ActivateToolTool returns schema on activation ───

  it("ActivateToolTool returns the schema on successful activation", async () => {
    const result = await ActivateToolTool.execute({ name: "git_diff" });

    expect(result).toContain("activated");
    expect(result).toContain("Schema");
    expect(getActivatedTools()).toHaveLength(1);
  });

  // ─── Test #60: ActivateToolTool returns error for unknown tool ───

  it("ActivateToolTool returns error for unknown tool", async () => {
    const result = await ActivateToolTool.execute({ name: "nonexistent" });

    expect(result).toMatch(/not found/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5b: Token Counter & Context Compaction
// ═══════════════════════════════════════════════════════════════════════════════

describe("Token Counter", () => {
  // ─── Test #61: Estimates tokens for short string ───

  it("estimates tokens using ~4 chars per token", () => {
    const tokens = estimateTokens("Hello world!"); // 12 chars → 3 tokens
    expect(tokens).toBe(3);
  });

  // ─── Test #62: Counts tokens across messages ───

  it("counts tokens across multiple messages", () => {
    const messages = [
      new HumanMessage("Hello"),     // 5 chars → 2 tokens + 4 overhead = 6
      new AIMessage("Hi there"),     // 8 chars → 2 tokens + 4 overhead = 6
    ];
    const total = countMessageTokens(messages);

    expect(total).toBeGreaterThan(0);
    expect(total).toBe(12); // (2+4) + (2+4)
  });

  // ─── Test #63: isNearCapacity detects threshold ───

  it("returns true when messages exceed 80% of capacity", () => {
    // Create a big message ~320 chars → ~80 tokens
    const bigMsg = new HumanMessage("x".repeat(320));
    const messages = [bigMsg];

    // maxTokens=100, threshold=0.8 → trigger at 80 tokens
    // 320/4=80 + 4 overhead = 84 > 80
    expect(isNearCapacity(messages, 100, 0.8)).toBe(true);
  });

  // ─── Test #64: isNearCapacity returns false below threshold ───

  it("returns false when well below capacity", () => {
    const messages = [new HumanMessage("short")];

    expect(isNearCapacity(messages, 100000, 0.8)).toBe(false);
  });
});

describe("Context Compaction", () => {
  // ─── Test #65: compactHistory preserves last N messages ───

  it("preserves the last N messages and prepends summary", () => {
    const builder = new CacheOptimizedPromptBuilder();
    const history = [
      new HumanMessage("msg 1"),
      new AIMessage("response 1"),
      new HumanMessage("msg 2"),
      new AIMessage("response 2"),
      new HumanMessage("msg 3"),
      new AIMessage("response 3"),
    ];

    const compacted = builder.compactHistory(history, "Summary of turns 1-2.", 4);

    // Should have: 1 summary + 4 preserved
    expect(compacted).toHaveLength(5);
    expect((compacted[0] as AIMessage).content).toContain("compacted");
    expect((compacted[0] as AIMessage).content).toContain("Summary of turns 1-2.");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5c: Reasoning Sandwich
// ═══════════════════════════════════════════════════════════════════════════════

describe("ReasoningRouter", () => {
  // ─── Test #66: First turns are HIGH (planning) ───

  it("returns HIGH for the first turn (planning phase)", () => {
    const router = new ReasoningRouter();

    const level = router.getLevel(false, false);

    expect(level).toBe(ReasoningLevel.HIGH);
  });

  // ─── Test #67: Tool-heavy turns are MEDIUM ───

  it("returns MEDIUM for tool-heavy turns after planning", () => {
    const router = new ReasoningRouter({ planningTurns: 1 });

    router.getLevel(false, false); // turn 1: HIGH (planning)
    const level = router.getLevel(true, false); // turn 2: tool call

    expect(level).toBe(ReasoningLevel.MEDIUM);
  });

  // ─── Test #68: Post-error turns are HIGH (recovery) ───

  it("returns HIGH for recovery after an error", () => {
    const router = new ReasoningRouter({ planningTurns: 1 });

    router.getLevel(false, false); // turn 1: planning
    router.getLevel(true, false);  // turn 2: tool call (MEDIUM)
    const level = router.getLevel(false, true); // turn 3: error!

    expect(level).toBe(ReasoningLevel.HIGH);
  });

  // ─── Test #69: Temperature mapping ───

  it("maps reasoning levels to correct temperatures", () => {
    const router = new ReasoningRouter({ highTemp: 0, mediumTemp: 0.3 });

    expect(router.getTemperature(ReasoningLevel.HIGH)).toBe(0);
    expect(router.getTemperature(ReasoningLevel.MEDIUM)).toBe(0.3);
  });
});
