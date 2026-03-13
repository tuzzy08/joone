import { createMiddleware } from "langchain";
import { AIMessage, HumanMessage, BaseMessage } from "@langchain/core/messages";
import { ToolCall } from "@langchain/core/messages/tool";

/**
 * Creates a middleware that prevents the "Blind Retry" doom loop.
 *
 * Inspects the conversation history right before the model is called.
 * If the last N AI messages contain the exact same tool calls, it
 * injects a warning message to force the model to try a different approach.
 *
 * Reference: docs/02_edge_cases_and_mitigations.md — "The Blind Retry Doom Loop"
 *
 * @param threshold - Number of identical consecutive calls before blocking (default: 3).
 */
export function createLoopDetectionMiddleware(threshold = 3) {
  const signature = (calls: Pick<ToolCall, "name" | "args">[]): string => {
    return calls
      .map((c) => `${c.name}:${JSON.stringify(c.args, Object.keys(c.args || {}).sort())}`)
      .join("|");
  };

  return createMiddleware({
    name: "LoopDetectionMiddleware",
    wrapModelCall: async (request, handler) => {
      // Extract recent AI messages that have tool calls
      const aiMessagesWithTools = request.messages.filter(
        (m): m is AIMessage => m instanceof AIMessage && m.tool_calls !== undefined && m.tool_calls.length > 0
      );

      if (aiMessagesWithTools.length >= threshold) {
        const recent = aiMessagesWithTools.slice(-threshold);
        const sigs = recent.map((m) => signature(m.tool_calls!));

        const allIdentical = sigs.every((sig) => sig === sigs[0]);

        if (allIdentical) {
          // Identify the tools for the warning
          const toolNames = recent[0].tool_calls!.map(c => c.name).join(", ");
          
          // Inject a strong human message to break the loop
          const updatedMessages = [
            ...request.messages,
            new HumanMessage(
              `⚠ Loop detected: You have called the tools [${toolNames}] with identical arguments ` +
              `${threshold} times consecutively. Stop this approach and try a different strategy immediately.`
            )
          ];

          return handler({ ...request, messages: updatedMessages });
        }
      }

      return handler(request);
    },
  });
}
