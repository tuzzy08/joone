/**
 * Sub-Agent Manager
 *
 * Spawns and orchestrates isolated sub-agents for scoped tasks.
 * Each sub-agent gets its own ExecutionHarness with a separate conversation
 * history. Only the final SubAgentResult is returned to the main agent,
 * discarding the sub-agent's internal conversation to save context.
 *
 * Supports both synchronous (blocking) and asynchronous (non-blocking) modes.
 *
 * Safety:
 * - Depth limit of 1: sub-agents cannot spawn other sub-agents
 * - maxTurns cap per agent prevents doom-loops
 * - Concurrent async agent cap of 3 prevents resource exhaustion
 * - Per-agent token budget tracking
 */

import { AgentSpec, SubAgentResult } from "../agents/agentSpec.js";
import { AgentRegistry } from "../agents/agentRegistry.js";
import { DynamicToolInterface, ToolResult } from "../tools/index.js";
import { ContextState } from "../core/promptBuilder.js";
import { countMessageTokens } from "../core/tokenCounter.js";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Runnable } from "@langchain/core/runnables";

// ─── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_MAX_TURNS = 10;
const MAX_CONCURRENT_ASYNC = 3;
const ASYNC_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// ─── Async Task State ───────────────────────────────────────────────────────────

interface AsyncTask {
  taskId: string;
  agentName: string;
  taskDescription: string;
  promise: Promise<SubAgentResult>;
  result?: SubAgentResult;
  startedAt: number;
  completed: boolean;
}

// ─── SubAgentManager ────────────────────────────────────────────────────────────

export class SubAgentManager {
  private registry: AgentRegistry;
  private allTools: DynamicToolInterface[];
  private llm: Runnable | BaseChatModel;
  private asyncTasks: Map<string, AsyncTask> = new Map();
  private taskCounter = 0;

  constructor(
    registry: AgentRegistry,
    tools: DynamicToolInterface[],
    llm: Runnable | BaseChatModel,
  ) {
    this.registry = registry;
    // Filter out spawn_agent and check_agent to prevent recursive nesting (depth-1 limit)
    this.allTools = tools.filter(
      (t) => t.name !== "spawn_agent" && t.name !== "check_agent"
    );
    this.llm = llm;
  }

  /**
   * Synchronous spawn — blocks until the sub-agent finishes.
   */
  async spawn(
    agentName: string,
    task: string,
    maxTurnsOverride?: number
  ): Promise<SubAgentResult> {
    const spec = this.registry.get(agentName);
    if (!spec) {
      return this.makeErrorResult(
        agentName,
        task,
        `Unknown agent "${agentName}". Available: ${this.registry.getNames().join(", ")}`
      );
    }

    return this.runAgent(spec, task, maxTurnsOverride);
  }

  /**
   * Asynchronous spawn — returns immediately with a taskId.
   * The main agent can poll with getResult(taskId).
   */
  async spawnAsync(
    agentName: string,
    task: string,
    maxTurnsOverride?: number
  ): Promise<string> {
    // Cap concurrent async agents
    this.cleanupExpired();
    const activeCount = Array.from(this.asyncTasks.values())
      .filter((t) => !t.completed).length;

    if (activeCount >= MAX_CONCURRENT_ASYNC) {
      throw new Error(
        `Maximum concurrent async agents reached (${MAX_CONCURRENT_ASYNC}). ` +
        `Wait for existing tasks to complete or check them with check_agent.`
      );
    }

    const spec = this.registry.get(agentName);
    if (!spec) {
      throw new Error(
        `Unknown agent "${agentName}". Available: ${this.registry.getNames().join(", ")}`
      );
    }

    const taskId = `task_${++this.taskCounter}_${Date.now()}`;

    const promise = this.runAgent(spec, task, maxTurnsOverride).then((result) => {
      const asyncTask = this.asyncTasks.get(taskId);
      if (asyncTask) {
        asyncTask.result = result;
        asyncTask.completed = true;
      }
      return result;
    });

    this.asyncTasks.set(taskId, {
      taskId,
      agentName,
      taskDescription: task,
      promise,
      startedAt: Date.now(),
      completed: false,
    });

    return taskId;
  }

  /**
   * Check the status or get the result of an async task.
   * Returns the result if completed, or a status message if still running.
   */
  async getResult(taskId: string): Promise<SubAgentResult | string> {
    const asyncTask = this.asyncTasks.get(taskId);
    if (!asyncTask) {
      return `Unknown task ID: ${taskId}. No such async task exists.`;
    }

    if (asyncTask.completed && asyncTask.result) {
      // Clean up the task
      this.asyncTasks.delete(taskId);
      return asyncTask.result;
    }

    const elapsed = Math.round((Date.now() - asyncTask.startedAt) / 1000);
    return `Task "${asyncTask.taskDescription}" (agent: ${asyncTask.agentName}) ` +
      `is still running (${elapsed}s elapsed).`;
  }

  /**
   * Core execution loop for a sub-agent.
   * Creates an isolated conversation and runs a multi-turn loop.
   */
  private async runAgent(
    spec: AgentSpec,
    task: string,
    maxTurnsOverride?: number
  ): Promise<SubAgentResult> {
    const startTime = Date.now();
    const maxTurns = maxTurnsOverride ?? spec.maxTurns ?? DEFAULT_MAX_TURNS;

    // Resolve available tools for this agent
    const agentTools = spec.tools
      ? this.allTools.filter((t) => spec.tools!.includes(t.name))
      : this.allTools;

    // Create isolated conversation history
    const systemPrompt = new HumanMessage(
      `<system-directive>\n${spec.systemPrompt}\n\n--- Current Task ---\n${task}\n</system-directive>`
    );

    const history: BaseMessage[] = [
      new HumanMessage(task),
    ];

    let promptTokens = 0;
    let completionTokens = 0;
    let toolCallCount = 0;
    let turnsUsed = 0;
    let lastResponse = "";
    const filesModified: Set<string> = new Set();

    // Build LangChain tool declarations for binding
    const toolDeclarations = agentTools.map((t) => ({
      name: t.name,
      description: t.description,
      schema: t.schema,
    }));

    try {
      // Bind tools to the LLM for this sub-agent session
      let boundLlm: any;
      if ("bindTools" in this.llm && typeof (this.llm as any).bindTools === "function") {
        boundLlm = (this.llm as any).bindTools(toolDeclarations);
      } else {
        boundLlm = this.llm;
      }

      for (let turn = 0; turn < maxTurns; turn++) {
        turnsUsed++;

        // Build the full message array
        const messages = [systemPrompt, ...history];
        const stepPromptTokens = countMessageTokens(messages);
        promptTokens += stepPromptTokens;

        // Invoke the LLM
        const response = await boundLlm.invoke(messages);
        const responseTokens = countMessageTokens([response as AIMessage]);
        completionTokens += responseTokens;

        const aiMessage = response as AIMessage;
        history.push(aiMessage);

        // Extract text content
        if (typeof aiMessage.content === "string" && aiMessage.content.length > 0) {
          lastResponse = aiMessage.content;
        }

        // Check for tool calls
        if (!aiMessage.tool_calls || aiMessage.tool_calls.length === 0) {
          // No tool calls — agent is done
          break;
        }

        // Execute tool calls
        for (const call of aiMessage.tool_calls) {
          if (!call.id) continue;

          const tool = agentTools.find((t) => t.name === call.name);
          if (!tool) {
            history.push(new ToolMessage({
              content: `Error: Tool "${call.name}" is not available to this sub-agent.`,
              tool_call_id: call.id,
            }));
            continue;
          }

          toolCallCount++;

          try {
            const result = await tool.execute(call.args);
            const output = typeof result === "string" ? result : (result as ToolResult).content;

            // Track file modifications
            if (call.name === "write_file" && call.args?.path) {
              filesModified.add(call.args.path);
            }

            history.push(new ToolMessage({
              content: output,
              tool_call_id: call.id,
            }));
          } catch (err: any) {
            history.push(new ToolMessage({
              content: `Tool error: ${err.message}`,
              tool_call_id: call.id,
            }));
          }
        }
      }

      // Determine outcome
      const outcome = turnsUsed >= maxTurns ? "partial" : "success";

      return {
        agentName: spec.name,
        taskDescription: task,
        outcome,
        result: lastResponse || "(Sub-agent produced no text output)",
        filesModified: Array.from(filesModified),
        toolCallCount,
        tokenUsage: { prompt: promptTokens, completion: completionTokens },
        duration: Date.now() - startTime,
        turnsUsed,
      };
    } catch (error: any) {
      return this.makeErrorResult(
        spec.name,
        task,
        `Sub-agent error: ${error.message}`,
        { promptTokens, completionTokens, toolCallCount, turnsUsed, startTime, filesModified }
      );
    }
  }

  /**
   * Creates an error SubAgentResult.
   */
  private makeErrorResult(
    agentName: string,
    task: string,
    errorMsg: string,
    partial?: {
      promptTokens: number;
      completionTokens: number;
      toolCallCount: number;
      turnsUsed: number;
      startTime: number;
      filesModified: Set<string>;
    }
  ): SubAgentResult {
    return {
      agentName,
      taskDescription: task,
      outcome: "failure",
      result: errorMsg,
      filesModified: partial ? Array.from(partial.filesModified) : [],
      toolCallCount: partial?.toolCallCount ?? 0,
      tokenUsage: {
        prompt: partial?.promptTokens ?? 0,
        completion: partial?.completionTokens ?? 0,
      },
      duration: partial ? Date.now() - partial.startTime : 0,
      turnsUsed: partial?.turnsUsed ?? 0,
    };
  }

  /**
   * Clean up expired async tasks.
   */
  private cleanupExpired(): void {
    const now = Date.now();
    for (const [taskId, task] of this.asyncTasks.entries()) {
      if (now - task.startedAt > ASYNC_EXPIRY_MS) {
        this.asyncTasks.delete(taskId);
      }
    }
  }
}
