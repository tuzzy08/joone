/**
 * Agent Registry
 *
 * Central registry for named sub-agents. The registry enables:
 * - Decoupled agent development (add agents without touching the main loop)
 * - Prompt injection (registry summary included in the main agent's system prompt)
 * - Lookup by name for the spawn_agent tool
 */

import { AgentSpec } from "./agentSpec.js";

export class AgentRegistry {
  private agents: Map<string, AgentSpec> = new Map();

  /**
   * Register a new agent spec. Overwrites if name already exists.
   */
  register(spec: AgentSpec): void {
    this.agents.set(spec.name, spec);
  }

  /**
   * Look up an agent by name.
   */
  get(name: string): AgentSpec | undefined {
    return this.agents.get(name);
  }

  /**
   * Returns all registered agent specs.
   */
  getAll(): AgentSpec[] {
    return Array.from(this.agents.values());
  }

  /**
   * Returns all registered agent names.
   */
  getNames(): string[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Returns true if an agent with the given name exists.
   */
  has(name: string): boolean {
    return this.agents.has(name);
  }

  /**
   * Generates a summary of all available agents, formatted for injection
   * into the main agent's system prompt.
   */
  getSummary(): string {
    if (this.agents.size === 0) {
      return "No sub-agents are currently registered.";
    }

    const lines = ["Available sub-agents (use spawn_agent tool to invoke):\n"];

    for (const spec of this.agents.values()) {
      const tools = spec.tools ? ` [tools: ${spec.tools.join(", ")}]` : " [all tools]";
      const turns = spec.maxTurns ?? 10;
      lines.push(`  • ${spec.name}: ${spec.description}${tools} (max ${turns} turns)`);
    }

    return lines.join("\n");
  }
}
