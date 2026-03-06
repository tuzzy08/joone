/**
 * Built-in Slash Commands
 *
 * All default commands that ship with Joone. Each command is a self-contained
 * SlashCommand object registered into the CommandRegistry at session start.
 */

import { SlashCommand, CommandContext } from "./commandRegistry.js";
import { countMessageTokens, estimateTokens } from "../core/tokenCounter.js";

// ─── /help ──────────────────────────────────────────────────────────────────────

export const HelpCommand: SlashCommand = {
  name: "help",
  aliases: ["h", "?"],
  description: "Show all available commands",
  execute: async (_args, ctx) => {
    // We import the registry's getHelp via context indirectly.
    // The registry is responsible for calling this, so we return a static list.
    const lines = [
      "Available commands:\n",
      "  /help (h, ?)       — Show this help message",
      "  /model (m) [name]  — Switch model or show current model",
      "  /clear (c)         — Clear conversation history",
      "  /compact           — Manually trigger context compaction",
      "  /tokens (t)        — Show current token usage",
      "  /status (s)        — Show session status",
      "  /history           — Show conversation summary",
      "  /undo              — Remove last user+agent exchange",
      "  /exit (quit, q)    — Exit the session",
    ];
    return lines.join("\n");
  },
};

// ─── /model ─────────────────────────────────────────────────────────────────────

export const ModelCommand: SlashCommand = {
  name: "model",
  aliases: ["m"],
  description: "Switch LLM model or show current model",
  execute: async (args, ctx) => {
    if (!args.trim()) {
      return `Current model: ${ctx.model} (provider: ${ctx.provider})\n` +
        `To switch: /model <model-name>`;
    }

    // We can't hot-swap the LLM instance without re-creating the harness,
    // so we update the config and inform the user to restart.
    // In the future, this could support live reloading.
    const newModel = args.trim();
    return `⚠ Model switching requires a session restart.\n` +
      `To use "${newModel}", update your config:\n` +
      `  joone config\n` +
      `Or restart with: joone start\n\n` +
      `Current model: ${ctx.model}`;
  },
};

// ─── /clear ─────────────────────────────────────────────────────────────────────

export const ClearCommand: SlashCommand = {
  name: "clear",
  aliases: ["c"],
  description: "Clear conversation history (keeps system prompt)",
  execute: async (_args, ctx) => {
    const prevCount = ctx.contextState.conversationHistory.length;
    ctx.setContextState({
      ...ctx.contextState,
      conversationHistory: [],
    });
    return `✓ Cleared ${prevCount} messages from conversation history.\n` +
      `System prompt and project context preserved.`;
  },
};

// ─── /compact ───────────────────────────────────────────────────────────────────

export const CompactCommand: SlashCommand = {
  name: "compact",
  description: "Manually trigger context compaction",
  execute: async (_args, ctx) => {
    const history = ctx.contextState.conversationHistory;
    if (history.length <= 6) {
      return `Not enough history to compact (${history.length} messages). Need > 6.`;
    }

    const allMessages = [
      ...history, // Simplified — the full prompt builder would add system messages too
    ];
    const currentTokens = countMessageTokens(allMessages);
    const pct = Math.round((currentTokens / ctx.maxTokens) * 100);

    if (pct < 50) {
      return `Context at ${pct}% capacity (${currentTokens} tokens). ` +
        `Compaction not needed yet — typically triggers at 80%.`;
    }

    // For now, do a basic compaction. M12 will replace this with LLM-powered compaction.
    const keepLastN = 8;
    const recent = history.slice(-keepLastN);
    const evictedCount = history.length - keepLastN;

    // Simple string summary (M12 will upgrade to LLM summary)
    const { SystemMessage } = await import("@langchain/core/messages");
    const summaryMsg = new SystemMessage(
      `[Compacted: ${evictedCount} messages removed. ` +
      `Use /history for details. Conversation continues below.]`
    );

    ctx.setContextState({
      ...ctx.contextState,
      conversationHistory: [summaryMsg, ...recent],
    });

    const newTokens = countMessageTokens([summaryMsg, ...recent]);
    return `✓ Compacted ${evictedCount} messages. ` +
      `Tokens: ${currentTokens} → ${newTokens} (${Math.round((newTokens / ctx.maxTokens) * 100)}%)`;
  },
};

// ─── /tokens ────────────────────────────────────────────────────────────────────

export const TokensCommand: SlashCommand = {
  name: "tokens",
  aliases: ["t"],
  description: "Show current token usage and context capacity",
  execute: async (_args, ctx) => {
    const history = ctx.contextState.conversationHistory;
    const historyTokens = countMessageTokens(history);

    const systemTokens =
      estimateTokens(ctx.contextState.globalSystemInstructions) +
      estimateTokens(ctx.contextState.projectMemory) +
      estimateTokens(ctx.contextState.sessionContext);

    const totalTokens = systemTokens + historyTokens;
    const pct = Math.round((totalTokens / ctx.maxTokens) * 100);

    const bar = generateBar(pct);

    return [
      `Token Usage:`,
      `  System prompt:  ~${systemTokens} tokens`,
      `  Conversation:   ~${historyTokens} tokens (${history.length} messages)`,
      `  Total:          ~${totalTokens} / ${ctx.maxTokens} tokens`,
      `  Capacity:       ${bar} ${pct}%`,
      pct >= 80 ? `  ⚠ Near capacity — consider /compact` : "",
    ].filter(Boolean).join("\n");
  },
};

/**
 * Generates a simple text progress bar.
 */
function generateBar(pct: number): string {
  const filled = Math.round(pct / 5); // 20 chars total
  const empty = 20 - filled;
  return `[${"█".repeat(filled)}${"░".repeat(Math.max(0, empty))}]`;
}

// ─── /status ────────────────────────────────────────────────────────────────────

export const StatusCommand: SlashCommand = {
  name: "status",
  aliases: ["s"],
  description: "Show current session status",
  execute: async (_args, ctx) => {
    const history = ctx.contextState.conversationHistory;
    const tokens = countMessageTokens(history);
    const pct = Math.round((tokens / ctx.maxTokens) * 100);

    return [
      `Session Status:`,
      `  Provider:     ${ctx.provider}`,
      `  Model:        ${ctx.model}`,
      `  Messages:     ${history.length}`,
      `  Token Usage:  ~${tokens} / ${ctx.maxTokens} (${pct}%)`,
      `  CWD:          ${process.cwd()}`,
    ].join("\n");
  },
};

// ─── /history ───────────────────────────────────────────────────────────────────

export const HistoryCommand: SlashCommand = {
  name: "history",
  description: "Show conversation history summary",
  execute: async (_args, ctx) => {
    const history = ctx.contextState.conversationHistory;

    if (history.length === 0) {
      return "No conversation history yet.";
    }

    const lines: string[] = [`Conversation History (${history.length} messages):\n`];

    // Show last 20 messages max
    const start = Math.max(0, history.length - 20);
    if (start > 0) {
      lines.push(`  ... (${start} earlier messages omitted)\n`);
    }

    for (let i = start; i < history.length; i++) {
      const msg = history[i];
      const role = msg._getType();
      const content = typeof msg.content === "string"
        ? msg.content.slice(0, 80)
        : "[complex content]";
      const suffix = typeof msg.content === "string" && msg.content.length > 80 ? "..." : "";
      lines.push(`  ${i + 1}. [${role}] ${content}${suffix}`);
    }

    return lines.join("\n");
  },
};

// ─── /undo ──────────────────────────────────────────────────────────────────────

export const UndoCommand: SlashCommand = {
  name: "undo",
  description: "Remove last user message and agent response",
  execute: async (_args, ctx) => {
    const history = ctx.contextState.conversationHistory;

    if (history.length === 0) {
      return "Nothing to undo — conversation history is empty.";
    }

    // Walk backwards to remove the last user→agent exchange.
    // An exchange is: HumanMessage → [AIMessage + ToolMessages...]
    let removeCount = 0;
    let hitHuman = false;

    for (let i = history.length - 1; i >= 0; i--) {
      const type = history[i]._getType();
      removeCount++;

      if (type === "human") {
        hitHuman = true;
        break;
      }
    }

    if (!hitHuman) {
      // No HumanMessage found — remove the last message only
      removeCount = 1;
    }

    const newHistory = history.slice(0, history.length - removeCount);
    ctx.setContextState({
      ...ctx.contextState,
      conversationHistory: newHistory,
    });

    return `✓ Removed ${removeCount} message(s). History now has ${newHistory.length} messages.`;
  },
};

// ─── /exit ──────────────────────────────────────────────────────────────────────

export const ExitCommand: SlashCommand = {
  name: "exit",
  aliases: ["quit", "q"],
  description: "Exit the Joone session",
  execute: async (_args, _ctx) => {
    // The TUI will handle the actual exit. We return a signal message.
    return "__EXIT__";
  },
};

// ─── Registration Helper ────────────────────────────────────────────────────────

import { CommandRegistry } from "./commandRegistry.js";

/**
 * Creates a CommandRegistry pre-loaded with all built-in commands.
 */
export function createDefaultRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register(HelpCommand);
  registry.register(ModelCommand);
  registry.register(ClearCommand);
  registry.register(CompactCommand);
  registry.register(TokensCommand);
  registry.register(StatusCommand);
  registry.register(HistoryCommand);
  registry.register(UndoCommand);
  registry.register(ExitCommand);

  return registry;
}
