/**
 * Context Guard
 *
 * Proactively monitors token usage during the agent loop and triggers auto-compaction
 * before the model's context window is exceeded.
 *
 * Thresholds:
 * - 80% (WARN): Triggers standard LLM-powered context compaction
 * - 95% (CRITICAL): Forces emergency truncation if compaction fails
 */

import { BaseMessage, SystemMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Runnable } from "@langchain/core/runnables";
import { CacheOptimizedPromptBuilder, ContextState } from "./promptBuilder.js";
import { countMessageTokens } from "./tokenCounter.js";
import { createHandoffPrompt } from "./compactor.js";

export interface ContextGuardMetrics {
  originalTokens: number;
  newTokens: number;
  messagesEvicted: number;
  actionTaken: "none" | "compacted" | "emergency_truncated";
}

export class ContextGuard {
  private promptBuilder: CacheOptimizedPromptBuilder;
  private llm: Runnable | BaseChatModel;
  private maxTokens: number;

  constructor(
    llm: Runnable | BaseChatModel,
    maxTokens: number,
    promptBuilder: CacheOptimizedPromptBuilder = new CacheOptimizedPromptBuilder()
  ) {
    this.llm = llm;
    this.maxTokens = maxTokens;
    this.promptBuilder = promptBuilder;
  }

  /**
   * Checks the token usage of the current state and compacts if necessary.
   * Returns updated state and metrics about the action taken.
   */
  async ensureCapacity(
    state: ContextState,
    warnThreshold = 0.8,
    criticalThreshold = 0.95
  ): Promise<{ state: ContextState; metrics: ContextGuardMetrics }> {
    const fullPrompt = this.promptBuilder.buildPrompt(state);
    const tokenCount = countMessageTokens(fullPrompt);

    // 1. Under limit — do nothing
    if (tokenCount < this.maxTokens * warnThreshold) {
      return {
        state,
        metrics: {
          originalTokens: tokenCount,
          newTokens: tokenCount,
          messagesEvicted: 0,
          actionTaken: "none",
        },
      };
    }

    // 2. Over WARN but below CRITICAL — try standard LLM compaction
    if (tokenCount < this.maxTokens * criticalThreshold) {
      const result = await this.promptBuilder.compactHistoryWithLLM(
        state.conversationHistory,
        this.llm,
        8 // keep last 8 messages
      );

      return {
        state: {
          ...state,
          conversationHistory: result.compactedHistory,
        },
        metrics: {
          originalTokens: tokenCount,
          newTokens: result.tokensAfter,
          messagesEvicted: result.evictedCount,
          actionTaken: "compacted",
        },
      };
    }

    // 3. CRITICAL overflow (or standard compaction didn't free enough space)
    // Emergency truncation: drop everything except the last 4 messages and inject an emergency handoff
    const keepLast = 4;
    
    // If we're already at or below 4 messages, we literally can't truncate more
    if (state.conversationHistory.length <= keepLast) {
       return {
         state,
         metrics: { originalTokens: tokenCount, newTokens: tokenCount, messagesEvicted: 0, actionTaken: "none" }
       };
    }

    const recentMsgs = state.conversationHistory.slice(-keepLast);
    const evictedCount = state.conversationHistory.length - keepLast;

    const emergencySystemMsg = new SystemMessage(
      `[EMERGENCY CONTEXT TRUNCATION]\n` +
      `The conversation exceeded the maximum context window (${this.maxTokens} tokens). ` +
      `Older messages were aggressively deleted without summarization to prevent an immediate crash.\n` +
      `You are the same agent. ` + createHandoffPrompt(new Date().toISOString())
    );

    const newHistory = [emergencySystemMsg, ...recentMsgs];
    const newTokens = countMessageTokens(this.promptBuilder.buildPrompt({
       ...state,
       conversationHistory: newHistory
    }));

    return {
      state: {
        ...state,
        conversationHistory: newHistory,
      },
      metrics: {
        originalTokens: tokenCount,
        newTokens,
        messagesEvicted: evictedCount,
        actionTaken: "emergency_truncated",
      },
    };
  }
}
