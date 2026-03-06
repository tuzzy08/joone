/**
 * Slash Command Registry
 *
 * Intercepts user input starting with "/" in the TUI and routes it to
 * registered command handlers. This bypasses the agent loop entirely,
 * making slash commands zero-cost (no LLM tokens consumed).
 *
 * Architecture:
 * - Commands are self-contained objects implementing SlashCommand
 * - The registry supports aliases (e.g., /m → /model)
 * - Unknown commands suggest similar names via Levenshtein distance
 */

import { ContextState } from "../core/promptBuilder.js";
import { ExecutionHarness } from "../core/agentLoop.js";
import { JooneConfig } from "../cli/config.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

/**
 * Context passed to every slash command handler.
 * Provides read/write access to session state, config, and UI.
 */
export interface CommandContext {
  /** Current Joone configuration. */
  config: JooneConfig;
  /** Path to the config file (for commands that modify config). */
  configPath: string;
  /** The execution harness (for commands that need LLM access, e.g., /compact). */
  harness: ExecutionHarness;
  /** Current conversation/context state. */
  contextState: ContextState;
  /** Setter for updating context state from a command. */
  setContextState: (state: ContextState) => void;
  /** Setter for pushing UI messages. */
  addSystemMessage: (content: string) => void;
  /** Current provider name. */
  provider: string;
  /** Current model name. */
  model: string;
  /** Max tokens (context window). */
  maxTokens: number;
}

/**
 * A registered slash command.
 */
export interface SlashCommand {
  /** Primary name (without the leading /). */
  name: string;
  /** Optional aliases (e.g., ["m"] for /model). */
  aliases?: string[];
  /** Short description shown in /help. */
  description: string;
  /** Execute the command. Returns an optional string to display. */
  execute: (args: string, context: CommandContext) => Promise<string | void>;
}

// ─── Levenshtein Distance ───────────────────────────────────────────────────────

/**
 * Computes the Levenshtein edit distance between two strings.
 * Used for "did you mean?" suggestions on unknown commands.
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,     // deletion
        matrix[i][j - 1] + 1,     // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

// ─── Registry ───────────────────────────────────────────────────────────────────

export class CommandRegistry {
  private commands: Map<string, SlashCommand> = new Map();
  private aliasMap: Map<string, string> = new Map();

  /**
   * Register a slash command. Overwrites if name already exists.
   */
  register(command: SlashCommand): void {
    this.commands.set(command.name, command);

    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliasMap.set(alias, command.name);
      }
    }
  }

  /**
   * Returns true if the input looks like a slash command.
   */
  isCommand(input: string): boolean {
    return input.trimStart().startsWith("/");
  }

  /**
   * Parse user input into command name and arguments.
   */
  private parse(input: string): { name: string; args: string } {
    const trimmed = input.trimStart().slice(1); // Remove leading "/"
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) {
      return { name: trimmed.toLowerCase(), args: "" };
    }
    return {
      name: trimmed.slice(0, spaceIdx).toLowerCase(),
      args: trimmed.slice(spaceIdx + 1).trim(),
    };
  }

  /**
   * Execute a slash command from raw user input.
   * Returns the command output string, or an error/suggestion message.
   */
  async execute(input: string, context: CommandContext): Promise<string> {
    const { name, args } = this.parse(input);

    // Resolve alias → primary name
    const resolvedName = this.aliasMap.get(name) ?? name;
    const command = this.commands.get(resolvedName);

    if (command) {
      const result = await command.execute(args, context);
      return result ?? "";
    }

    // Unknown command — find suggestions
    const allNames = this.getAllNames();
    const suggestions = allNames
      .map((n) => ({ name: n, dist: levenshteinDistance(name, n) }))
      .filter((s) => s.dist <= 2) // Max 2 edits
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3)
      .map((s) => `/${s.name}`);

    let msg = `Unknown command: /${name}.`;
    if (suggestions.length > 0) {
      msg += ` Did you mean: ${suggestions.join(", ")}?`;
    }
    msg += ` Type /help for all commands.`;
    return msg;
  }

  /**
   * Returns all registered commands.
   */
  getAll(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Returns all command names AND aliases (for suggestion matching).
   */
  getAllNames(): string[] {
    const names = Array.from(this.commands.keys());
    const aliases = Array.from(this.aliasMap.keys());
    return [...names, ...aliases];
  }

  /**
   * Generates formatted help text for all registered commands.
   */
  getHelp(): string {
    const lines: string[] = ["Available commands:\n"];

    for (const cmd of this.commands.values()) {
      const aliases = cmd.aliases?.length
        ? ` (${cmd.aliases.map((a) => `/${a}`).join(", ")})`
        : "";
      lines.push(`  /${cmd.name}${aliases} — ${cmd.description}`);
    }

    return lines.join("\n");
  }
}
