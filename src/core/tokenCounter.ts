import { BaseMessage, AIMessage } from "@langchain/core/messages";

/**
 * Lightweight token counter using character-based heuristic.
 *
 * Approximation: ~4 characters per token for English text.
 * This avoids a dependency on tiktoken while being accurate enough
 * for capacity threshold decisions (~90% accuracy for English).
 *
 * For production accuracy, swap to tiktoken with the appropriate
 * model-specific encoding.
 */

const CHARS_PER_TOKEN = 4;

/**
 * Estimates the token count for a string.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimates the total token count across a list of messages.
 */
export function countMessageTokens(messages: BaseMessage[]): number {
  let total = 0;

  for (const msg of messages) {
    if (typeof msg.content === "string") {
      total += estimateTokens(msg.content);
    } else if (Array.isArray(msg.content)) {
      // Handle multi-part messages (text + tool calls)
      for (const part of msg.content) {
        if (typeof part === "string") {
          total += estimateTokens(part);
        } else if ("text" in part && typeof part.text === "string") {
          total += estimateTokens(part.text);
        }
      }
    }

    // Account for role/name overhead (~4 tokens per message)
    total += 4;
  }

  return total;
}

/**
 * Checks if the message history is approaching the context window limit.
 *
 * @param messages - The current conversation messages.
 * @param maxTokens - The model's context window size.
 * @param threshold - Fraction of capacity to trigger compaction (default: 0.8 = 80%).
 */
export function isNearCapacity(
  messages: BaseMessage[],
  maxTokens: number,
  threshold = 0.8
): boolean {
  const used = countMessageTokens(messages);
  return used >= maxTokens * threshold;
}

/**
 * Extracts provider-specific cache hit metrics from an AI message.
 */
export function extractCacheMetrics(
  aiMessage: AIMessage,
  provider: string
): { cachedTokens: number; createdTokens: number } {
  const meta = aiMessage.response_metadata;
  if (!meta) return { cachedTokens: 0, createdTokens: 0 };

  const usage = (meta.usage || meta.tokenUsage || meta.estimatedTokenUsage || {}) as any;

  // Anthropic uses these specific nested fields
  if (provider === "anthropic") {
    return {
      cachedTokens: usage.cache_read_input_tokens || 0,
      createdTokens: usage.cache_creation_input_tokens || 0,
    };
  }
  
  // Google Gemini uses cachedContentTokenCount
  if (provider === "google-genai") {
    return {
      cachedTokens: usage.cachedContentTokenCount || 0,
      createdTokens: usage.promptTokenCount - (usage.cachedContentTokenCount || 0) || 0,
    };
  }

  // Fallback for others (assuming standard usage pattern if any support arises)
  return {
    cachedTokens: usage.prompt_tokens_details?.cached_tokens || usage.cached_tokens || 0,
    createdTokens: 0,
  };
}
