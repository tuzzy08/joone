/**
 * Spawn Agent Tools
 *
 * DynamicToolInterface implementations for spawning and checking sub-agents.
 * These tools are registered with the main agent's tool set, allowing the
 * LLM to delegate scoped tasks to isolated sub-agents.
 *
 * Safety: spawn_agent and check_agent are excluded from sub-agent tool sets
 * to enforce the depth-1 nesting limit.
 */

import { DynamicToolInterface, ToolResult } from "./index.js";
import { SubAgentManager } from "../core/subAgent.js";
import { SubAgentResult } from "../agents/agentSpec.js";
import { AgentRegistry } from "../agents/agentRegistry.js";

// ─── Factory ────────────────────────────────────────────────────────────────────

/**
 * Creates the spawn_agent and check_agent tools bound to a SubAgentManager.
 * The agent registry summary is injected into the spawn_agent description
 * so the LLM knows which agents are available.
 */
export function createSpawnAgentTools(
  manager: SubAgentManager,
  registry: AgentRegistry
): DynamicToolInterface[] {
  const agentNames = registry.getNames();
  const agentList = agentNames.join(", ");

  // ─── spawn_agent ───────────────────────────────────────────────────────────

  const SpawnAgentTool: DynamicToolInterface = {
    name: "spawn_agent",
    description:
      `Spawn an isolated sub-agent to handle a scoped task. Available agents: ${agentList}. ` +
      `The sub-agent runs independently with its own conversation and returns a structured result. ` +
      `Use mode "async" for non-blocking execution — you can continue working and check results later with check_agent.`,
    schema: {
      type: "object",
      properties: {
        agent: {
          type: "string",
          description: `The agent name from the registry. Available: ${agentList}`,
          enum: agentNames,
        },
        task: {
          type: "string",
          description: "Detailed description of the task for the sub-agent to complete",
        },
        mode: {
          type: "string",
          enum: ["sync", "async"],
          description: "Execution mode: 'sync' (default, blocks until done) or 'async' (non-blocking, returns taskId)",
        },
      },
      required: ["agent", "task"],
    },
    execute: async (args: {
      agent: string;
      task: string;
      mode?: "sync" | "async";
    }): Promise<ToolResult> => {
      const mode = args.mode ?? "sync";

      if (mode === "async") {
        try {
          const taskId = await manager.spawnAsync(args.agent, args.task);
          return {
            content: `Async sub-agent "${args.agent}" started. Task ID: ${taskId}\n` +
              `Use check_agent with this taskId to get the result when ready.`,
            metadata: { taskId, agentName: args.agent, mode: "async" },
          };
        } catch (err: any) {
          return { content: `Spawn error: ${err.message}`, isError: true };
        }
      }

      // Sync mode (default)
      const result = await manager.spawn(args.agent, args.task);
      return {
        content: formatSubAgentResult(result),
        metadata: {
          agentName: result.agentName,
          outcome: result.outcome,
          toolCalls: result.toolCallCount,
          turnsUsed: result.turnsUsed,
          duration: result.duration,
        },
        isError: result.outcome === "failure",
      };
    },
  };

  // ─── check_agent ───────────────────────────────────────────────────────────

  const CheckAgentTool: DynamicToolInterface = {
    name: "check_agent",
    description:
      "Check the status or retrieve the result of an async sub-agent task. " +
      "If the task is still running, returns a status update. If completed, returns the result.",
    schema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "The task ID returned by spawn_agent in async mode",
        },
      },
      required: ["taskId"],
    },
    execute: async (args: { taskId: string }): Promise<ToolResult> => {
      const result = await manager.getResult(args.taskId);

      if (typeof result === "string") {
        // Still running or unknown
        return { content: result };
      }

      // Completed — return formatted result
      return {
        content: formatSubAgentResult(result),
        metadata: {
          agentName: result.agentName,
          outcome: result.outcome,
          toolCalls: result.toolCallCount,
          turnsUsed: result.turnsUsed,
          duration: result.duration,
        },
        isError: result.outcome === "failure",
      };
    },
  };

  return [SpawnAgentTool, CheckAgentTool];
}

// ─── Formatter ──────────────────────────────────────────────────────────────────

/**
 * Formats a SubAgentResult into a readable string for the main agent.
 */
function formatSubAgentResult(result: SubAgentResult): string {
  const lines = [
    `--- Sub-Agent Result: ${result.agentName} ---`,
    `Outcome: ${result.outcome}`,
    `Turns: ${result.turnsUsed} | Tool Calls: ${result.toolCallCount} | Duration: ${Math.round(result.duration / 1000)}s`,
    `Tokens: ~${result.tokenUsage.prompt} prompt + ~${result.tokenUsage.completion} completion`,
  ];

  if (result.filesModified.length > 0) {
    lines.push(`Files Modified: ${result.filesModified.join(", ")}`);
  }

  lines.push(`\nResult:\n${result.result}`);

  return lines.join("\n");
}
