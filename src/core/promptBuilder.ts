import {
  BaseMessage,
  SystemMessage,
  HumanMessage,
} from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Runnable } from "@langchain/core/runnables";
import { countMessageTokens } from "./tokenCounter.js";
import { ConversationCompactor, CompactionResult } from "./compactor.js";

export interface ContextState {
  globalSystemInstructions: string;
  projectMemory: string;
  sessionContext: string;
  conversationHistory: BaseMessage[];
}

/**
 * CacheOptimizedPromptBuilder
 *
 * Enforces strict prefix ordering to maximize Claude's Prompt Caching.
 *
 * Order of Prefix (Static to Dynamic):
 * 1. Base System Instructions + Tool Definitions (Globally Cached)
 * 2. Project Memory (e.g., CLAUDE.md) (Cached per project)
 * 3. Session State (Environment variables) (Cached per session)
 * 4. Conversation Messages (Grows iteratively)
 */
export class CacheOptimizedPromptBuilder {
  /**
   * Compiles the full message array for the LLM request.
   * The first messages are static, and subsequent ones are dynamic.
   */
  public buildPrompt(state: ContextState): BaseMessage[] {
    // We use SystemMessages for the static prefix.
    // In @langchain/anthropic, to use cache_control, we can inject it into the final message of each tier if needed,
    // but preserving the exact order of the system prompts is the main requirement.

    const unifiedContent = [
      state.globalSystemInstructions,
      `--- Project Context ---\n${state.projectMemory}`,
      `--- Session Rules ---\n${state.sessionContext}`,
    ].join("\n\n");

    const systemMessages: BaseMessage[] = [
      new SystemMessage({
        content: unifiedContent,
        name: "global_context",
      }),
    ];

    // Combine the static prefix with the dynamic conversation history
    return [...systemMessages, ...state.conversationHistory];
  }

  /**
   * The System Reminder Pattern
   * Instead of replacing the System Prompt (which breaks cache),
   * use this to inject state updates into the Conversation History.
   */
  public injectSystemReminder(
    history: BaseMessage[],
    reminder: string,
  ): BaseMessage[] {
    const reminderMsg = new HumanMessage({
      content: `<system-reminder>\n${reminder}\n</system-reminder>`,
    });
    return [...history, reminderMsg];
  }

  /**
   * Cache-Safe Compaction (string-based fallback)
   * When history gets too long, we preserve the last N messages (recent context)
   * and replace older messages with a summary. The static system prefix is untouched.
   *
   * @param history - The full conversation history.
   * @param summary - A text summary of the older messages.
   * @param keepLastN - Number of recent messages to preserve (default: 6).
   */
  public compactHistory(
    history: BaseMessage[],
    summary: string,
    keepLastN = 6,
  ): BaseMessage[] {
    if (history.length === 0) {
      return history;
    }

    // Use HumanMessage formatted as a system update to avoid breaking Google's validation
    // and maintaining proper user/assistant flow.
    const compactedMessage = new HumanMessage(
      `<system-update>\n[The previous conversation history has been compacted.]\nSummary:\n${summary}\n</system-update>`,
    );

    // Preserve recent messages for continuity
    const recentMessages = history.slice(-keepLastN);

    return [compactedMessage, ...recentMessages];
  }

  /**
   * LLM-Powered Compaction with Handoff
   * Uses a dedicated LLM call to generate a structured summary, then injects
   * a handoff prompt to orient the agent. Falls back to string-based compaction
   * if the LLM call fails.
   *
   * @param history - The full conversation history.
   * @param llm - The LLM to use for summarization (should be a fast/cheap model).
   * @param keepLastN - Number of recent messages to preserve (default: 8).
   * @returns CompactionResult with the new history and metrics.
   */
  public async compactHistoryWithLLM(
    history: BaseMessage[],
    llm: Runnable | BaseChatModel,
    keepLastN = 8,
  ): Promise<CompactionResult> {
    const compactor = new ConversationCompactor();
    return compactor.compact(history, llm, { keepLastN });
  }

  /**
   * Checks if the conversation should be compacted based on token usage.
   *
   * @param state - The current context state.
   * @param maxTokens - The model's context window.
   * @param threshold - Fraction of capacity to trigger (default: 0.8).
   */
  public shouldCompact(
    state: ContextState,
    maxTokens: number,
    threshold = 0.8,
  ): boolean {
    const allMessages = this.buildPrompt(state);
    const usage = countMessageTokens(allMessages);
    return usage >= maxTokens * threshold;
  }
}

