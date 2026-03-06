/**
 * Conversation Compactor
 *
 * Replaces the simple string-based compaction with an LLM-powered summary.
 * Uses a dedicated compact prompt to produce a high-quality structured summary,
 * then injects a handoff prompt to orient the agent after compaction.
 *
 * Architecture:
 * 1. Evicted messages (all except keepLastN) are sent to a dedicated LLM call
 * 2. The LLM produces a structured markdown summary preserving critical context
 * 3. A handoff prompt is injected after the summary to guide the agent
 * 4. Falls back to string-based compaction if the LLM call fails
 */

import { BaseMessage, SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Runnable } from "@langchain/core/runnables";
import { countMessageTokens, estimateTokens } from "./tokenCounter.js";

// ─── Compact Prompt ─────────────────────────────────────────────────────────────

export const COMPACT_SYSTEM_PROMPT = `You are a conversation summarizer. Your task is to produce a structured reference document from the conversation below.

PRESERVE ALL of the following (do NOT omit):
- File paths created, edited, or deleted
- Tool calls made and their outcomes (success or failure)
- Key decisions made and the rationale behind them
- Current task state — what has been completed and what remains
- Errors encountered and how they were resolved
- Code snippets or configurations that are critical to the ongoing task

FORMAT as structured markdown with clear sections:
## Files Modified
## Decisions Made
## Current State
## Errors & Resolutions

Be thorough but concise. Do NOT include conversational filler or pleasantries.`;

// ─── Handoff Prompt ─────────────────────────────────────────────────────────────

export function createHandoffPrompt(compactionTimestamp: string): string {
  return `[CONTEXT HANDOFF] Your earlier conversation has been compacted into the summary above.
You are the same agent continuing the same task. Key points:
- The summary preserves all file paths, decisions, tool outcomes, and errors
- If you need details not included in the summary, re-read the relevant files using read_file
- Continue from where the conversation left off — do NOT redo work described in the summary
- Compacted at: ${compactionTimestamp}`;
}

// ─── Fast Model Defaults ────────────────────────────────────────────────────────

/**
 * Maps each provider to its cheapest/fastest model for use in compaction
 * and sub-agent tasks. Users can override via config.compactModel.
 */
export const FAST_MODEL_DEFAULTS: Record<string, string> = {
  anthropic: "claude-3-haiku-20240307",
  openai: "gpt-4o-mini",
  google: "gemini-2.5-flash",
  mistral: "mistral-small-latest",
  groq: "mixtral-8x7b-32768",
  deepseek: "deepseek-chat",
  fireworks: "accounts/fireworks/models/llama-v3p1-70b-instruct",
  together: "meta-llama/Llama-3.1-70B-Instruct-Turbo",
  ollama: "mistral",
};

/**
 * Resolves the model to use for compaction/sub-agents.
 * Priority: explicit override > FAST_MODEL_DEFAULTS > main model (fallback)
 */
export function resolveFastModel(
  provider: string,
  mainModel: string,
  override?: string
): string {
  if (override) return override;
  return FAST_MODEL_DEFAULTS[provider] ?? mainModel;
}

// ─── Compactor Options ──────────────────────────────────────────────────────────

export interface CompactorOptions {
  /** Number of recent messages to preserve (default: 8) */
  keepLastN?: number;
  /** Max tokens for the summary output (default: 2000) */
  maxSummaryTokens?: number;
}

// ─── Compaction Result ──────────────────────────────────────────────────────────

export interface CompactionResult {
  /** The new compacted conversation history */
  compactedHistory: BaseMessage[];
  /** Number of messages evicted */
  evictedCount: number;
  /** Token count before compaction */
  tokensBefore: number;
  /** Token count after compaction */
  tokensAfter: number;
  /** Whether the LLM was used (true) or fallback was used (false) */
  llmUsed: boolean;
}

// ─── ConversationCompactor ──────────────────────────────────────────────────────

export class ConversationCompactor {

  /**
   * Compact a conversation history using an LLM to generate a structured summary.
   *
   * @param history — The full conversation history
   * @param llm — The LLM to use for summarization (should be a fast/cheap model)
   * @param options — Compaction options
   * @returns CompactionResult with the new compacted history
   */
  async compact(
    history: BaseMessage[],
    llm: Runnable | BaseChatModel,
    options: CompactorOptions = {}
  ): Promise<CompactionResult> {
    const keepLastN = options.keepLastN ?? 8;
    const maxSummaryTokens = options.maxSummaryTokens ?? 2000;

    if (history.length <= keepLastN) {
      return {
        compactedHistory: history,
        evictedCount: 0,
        tokensBefore: countMessageTokens(history),
        tokensAfter: countMessageTokens(history),
        llmUsed: false,
      };
    }

    const tokensBefore = countMessageTokens(history);
    const evictedMessages = history.slice(0, history.length - keepLastN);
    const recentMessages = history.slice(-keepLastN);
    const evictedCount = evictedMessages.length;

    // Try LLM-powered compaction
    try {
      const summaryText = await this.generateLLMSummary(
        evictedMessages,
        llm,
        maxSummaryTokens
      );

      const summaryMessage = new SystemMessage(
        `[COMPACTED CONVERSATION SUMMARY]\n${summaryText}`
      );

      const handoffMessage = new SystemMessage(
        createHandoffPrompt(new Date().toISOString())
      );

      const compactedHistory = [summaryMessage, handoffMessage, ...recentMessages];
      const tokensAfter = countMessageTokens(compactedHistory);

      return {
        compactedHistory,
        evictedCount,
        tokensBefore,
        tokensAfter,
        llmUsed: true,
      };
    } catch (error) {
      // Fallback to string-based compaction
      return this.fallbackCompact(history, evictedMessages, recentMessages, tokensBefore);
    }
  }

  /**
   * Generates a structured summary using the LLM.
   */
  private async generateLLMSummary(
    evictedMessages: BaseMessage[],
    llm: Runnable | BaseChatModel,
    maxSummaryTokens: number
  ): Promise<string> {
    // Construct the prompt for the compactor LLM
    const compactPrompt = new SystemMessage(
      `${COMPACT_SYSTEM_PROMPT}\n\nKeep your summary under ${maxSummaryTokens} tokens.`
    );

    // Convert evicted messages into a readable format for the summarizer
    const conversationText = evictedMessages
      .map((msg) => {
        const role = msg._getType();
        const content = typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content);
        return `[${role}]: ${content}`;
      })
      .join("\n\n");

    const summaryRequest = new HumanMessage(
      `Summarize this conversation:\n\n${conversationText}`
    );

    const response = await llm.invoke([compactPrompt, summaryRequest]);

    // Extract text from response
    if (typeof response === "string") return response;
    if ("content" in response && typeof response.content === "string") {
      return response.content;
    }

    throw new Error("Unexpected LLM response format during compaction");
  }

  /**
   * Fallback compaction using a simple heuristic summary (no LLM call).
   * Used when the LLM call fails.
   */
  private fallbackCompact(
    _fullHistory: BaseMessage[],
    evictedMessages: BaseMessage[],
    recentMessages: BaseMessage[],
    tokensBefore: number
  ): CompactionResult {
    // Build a basic summary from message roles and lengths
    const humanMsgCount = evictedMessages.filter(m => m._getType() === "human").length;
    const aiMsgCount = evictedMessages.filter(m => m._getType() === "ai").length;
    const toolMsgCount = evictedMessages.filter(m => m._getType() === "tool").length;

    const summaryText = [
      `[Fallback Compaction — LLM summary unavailable]`,
      `Evicted ${evictedMessages.length} messages:`,
      `  - ${humanMsgCount} user messages`,
      `  - ${aiMsgCount} agent responses`,
      `  - ${toolMsgCount} tool results`,
      `The conversation is continuing below.`,
    ].join("\n");

    const summaryMessage = new SystemMessage(summaryText);
    const handoffMessage = new SystemMessage(
      createHandoffPrompt(new Date().toISOString())
    );

    const compactedHistory = [summaryMessage, handoffMessage, ...recentMessages];
    const tokensAfter = countMessageTokens(compactedHistory);

    return {
      compactedHistory,
      evictedCount: evictedMessages.length,
      tokensBefore,
      tokensAfter,
      llmUsed: false,
    };
  }
}
