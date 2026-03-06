/**
 * Agent Specification
 *
 * Defines the shape of a sub-agent: its identity, capabilities, constraints,
 * and tools. This enables decoupled agent development — new agents can be
 * added to the registry without modifying the main agent or harness.
 */

/**
 * Describes a named sub-agent with a purpose-tuned configuration.
 */
export interface AgentSpec {
  /** Unique name (e.g., "script_runner", "code_reviewer"). */
  name: string;

  /** Human-readable description included in the main agent's prompt. */
  description: string;

  /** Dedicated system prompt for this sub-agent. */
  systemPrompt: string;

  /** Restrict to specific tool names. If omitted, all main-agent tools are available. */
  tools?: string[];

  /** Maximum turns before the sub-agent is forcibly stopped (doom-loop protection). Default: 10. */
  maxTurns?: number;

  /** Override model for this agent (default: FAST_MODEL_DEFAULTS from same provider). */
  model?: string;

  /** Permission behavior for this agent. */
  permissionMode?: "auto" | "ask_all";
}

/**
 * Structured result returned by a sub-agent after completing (or failing) a task.
 * Only this result is injected into the main agent's history — the sub-agent's
 * full conversation is discarded to save context.
 */
export interface SubAgentResult {
  /** The agent name from AgentSpec. */
  agentName: string;

  /** The original task description. */
  taskDescription: string;

  /** Outcome status. */
  outcome: "success" | "failure" | "partial";

  /** The final text output from the sub-agent. */
  result: string;

  /** Files created, modified, or deleted during the sub-task. */
  filesModified: string[];

  /** Total tool calls executed. */
  toolCallCount: number;

  /** Approximate token usage. */
  tokenUsage: { prompt: number; completion: number };

  /** Wall-clock duration in milliseconds. */
  duration: number;

  /** Number of turns the sub-agent ran. */
  turnsUsed: number;
}
