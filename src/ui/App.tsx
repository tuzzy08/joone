import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useInput, useApp, Static } from "ink";
import TextInput from "ink-text-input";
import { Header } from "./components/Header.js";
import { StatusBar } from "./components/StatusBar.js";
import { MessageBubble } from "./components/MessageBubble.js";
import { StreamingText } from "./components/StreamingText.js";
import { ToolCallPanel, ToolCallStatus } from "./components/ToolCallPanel.js";
import { HITLPrompt } from "./components/HITLPrompt.js";
import { FileBrowser } from "./components/FileBrowser.js";
import {
  WorkflowTodoItem,
  WorkflowTodoPanel,
} from "./components/WorkflowTodoPanel.js";
import type { ExecutionHarness } from "../core/agentLoop.js";
import type { ContextState } from "../core/promptBuilder.js";
import { countMessageTokens } from "../core/tokenCounter.js";
import { getProviderContextLimit } from "../core/contextGuard.js";
import {
  HITLBridge,
  HITLQuestion,
  HITLPermissionRequest,
} from "../hitl/bridge.js";
import { createDefaultRegistry } from "../commands/builtinCommands.js";
import { AgentEvent } from "../core/events.js";

export interface Message {
  role: "user" | "agent" | "system";
  content: string;
}

export interface ActiveToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
}

interface AppProps {
  provider: string;
  model: string;
  streaming: boolean;
  createHarness: () => Promise<ExecutionHarness>;
  initialState: ContextState;
  maxTokens: number;
  onStateChange?: (state: ContextState) => void;
  benchmarkStartup?: boolean;
  onStartupBenchmarkMark?: (name: string) => void;
  onStartupBenchmarkComplete?: () => void;
}

type PendingHitlPrompt =
  | {
      id: string;
      type: "question";
      question: HITLQuestion;
    }
  | {
      id: string;
      type: "permission";
      permission: HITLPermissionRequest;
    };

export const App: React.FC<AppProps> = ({
  provider,
  model,
  streaming,
  createHarness,
  initialState,
  maxTokens,
  onStateChange,
  benchmarkStartup = false,
  onStartupBenchmarkMark,
  onStartupBenchmarkComplete,
}) => {
  const { exit } = useApp();

  const contextTokensLimit = useMemo(
    () => getProviderContextLimit(provider, model),
    [provider, model],
  );

  // Slash Command Registry — initialized once, stable across renders
  const commandRegistry = useMemo(() => createDefaultRegistry(), []);

  // UI State
  const [messages, setMessages] = useState<Message[]>([
    { role: "system", content: "Session started. Type your request below." },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Streaming & Tool State
  const [streamingTokens, setStreamingTokens] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolCall, setActiveToolCall] = useState<ActiveToolCall | null>(
    null,
  );
  const [recentToolCalls, setRecentToolCalls] = useState<ActiveToolCall[]>([]);
  const [workflowTodos, setWorkflowTodos] = useState<WorkflowTodoItem[]>([]);
  const toolRunCounterRef = React.useRef(0);

  // Core Engine State
  const [contextState, setContextState] = useState<ContextState>(initialState);
  const [harness, setHarness] = useState<ExecutionHarness | null>(null);
  const [isInitializingHarness, setIsInitializingHarness] = useState(false);
  const harnessPromiseRef = React.useRef<Promise<ExecutionHarness> | null>(null);

  // HITL State
  const [pendingHitlPrompts, setPendingHitlPrompts] = useState<
    PendingHitlPrompt[]
  >([]);

  // Listen for HITL events from the bridge
  useEffect(() => {
    const bridge = HITLBridge.getInstance();

    const onQuestion = (question: HITLQuestion) => {
      setPendingHitlPrompts((prev) => [
        ...prev,
        { id: question.id, type: "question", question },
      ]);
      setWorkflowTodos((prev) =>
        updateWorkflowTodo(
          prev,
          "tools",
          "blocked",
          "Waiting for your answer before continuing.",
        ),
      );
    };
    const onPermission = (permission: HITLPermissionRequest) => {
      setPendingHitlPrompts((prev) => [
        ...prev,
        { id: permission.id, type: "permission", permission },
      ]);
      setWorkflowTodos((prev) =>
        updateWorkflowTodo(
          prev,
          "tools",
          "blocked",
          `Waiting for approval to run ${permission.toolName}.`,
        ),
      );
    };

    bridge.on("question", onQuestion);
    bridge.on("permission", onPermission);

    // Clear prompts when resolved
    const origResolve = bridge.resolveAnswer.bind(bridge);
    bridge.resolveAnswer = (id: string, answer: string) => {
      origResolve(id, answer);
      setPendingHitlPrompts((prev) => prev.filter((prompt) => prompt.id !== id));
      setWorkflowTodos((prev) =>
        updateWorkflowTodo(
          prev,
          "tools",
          "active",
          "Continuing after your input.",
        ),
      );
    };

    return () => {
      bridge.off("question", onQuestion);
      bridge.off("permission", onPermission);
    };
  }, []);

  // Listen for agent events to inject as system messages
  useEffect(() => {
    if (!harness) {
      return;
    }

    const handleEvent = (event: AgentEvent) => {
      // Streaming tokens and tool calls have dedicated UI panels.
      if (
        event.type === "agent:stream" ||
        event.type === "tool:start" ||
        event.type === "tool:end"
      ) {
        return;
      }

      let content = "";
      switch (event.type) {
        case "subagent:spawn":
          content = `[SubAgent] Spawning '${event.agentName}'`;
          break;
        case "file:io":
          content = `[File] ${event.action.toUpperCase()}: ${event.path.split(/[\\\\/]/).pop()}`;
          break;
        case "system:script_exec":
          content = `[Exec] ${event.location}: ${event.command.slice(0, 30)}...`;
          break;
        case "browser:nav":
          content = `[Browser] Navigating to ${event.url}`;
          break;
        case "system:save":
          content = `[System] Saved Session State`;
          break;
        default:
          content = `[Unknown] Event type: ${(event as any).type}`;
      }

      setMessages((prev) => [...prev, { role: "system", content }]);
    };

    harness.on("agent:event", handleEvent);
    return () => {
      harness.off("agent:event", handleEvent);
    };
  }, [harness]);

  // StatusBar Metrics
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState("0s");

  // Update elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - startTime) / 1000);
      if (seconds < 60) {
        setElapsed(`${seconds}s`);
      } else {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        setElapsed(`${mins}m ${secs}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // Hold the latest state in a ref for the unmount/signal handlers
  const stateRef = React.useRef(contextState);
  useEffect(() => {
    stateRef.current = contextState;
    onStateChange?.(contextState);
  }, [contextState, onStateChange]);

  const performGracefulExit = async () => {
    try {
      if (harness) {
        await harness.autoSave.forceSave({
          config: { provider, model },
          state: stateRef.current,
        });
      }
    } catch (e) {
      // Ignore errors during exit
    } finally {
      exit();
    }
  };

  useEffect(() => {
    const handleSignal = () => {
      performGracefulExit();
    };

    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);

    return () => {
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
    };
  }, [provider, model, harness, exit]);

  // Handle Ctrl+C (Keyboard)
  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") {
        performGracefulExit();
      }
    },
    { isActive: !benchmarkStartup },
  );

  const ensureHarness = async (): Promise<ExecutionHarness> => {
    if (harness) {
      return harness;
    }

    if (!harnessPromiseRef.current) {
      setIsInitializingHarness(true);
      harnessPromiseRef.current = createHarness()
        .then((createdHarness) => {
          setHarness(createdHarness);
          return createdHarness;
        })
        .finally(() => {
          setIsInitializingHarness(false);
        });
    }

    return harnessPromiseRef.current;
  };

  useEffect(() => {
    if (!benchmarkStartup) {
      return;
    }

    let cancelled = false;

    const runBenchmark = async () => {
      try {
        onStartupBenchmarkMark?.("ui:interactive");
        await ensureHarness();

        if (cancelled) {
          return;
        }

        onStartupBenchmarkMark?.("runtime:harness-ready");
        onStartupBenchmarkComplete?.();
        requestSoftExit();
      } catch (error: any) {
        if (cancelled) {
          return;
        }

        setMessages((prev) => [
          ...prev,
          { role: "system", content: `Benchmark error: ${error.message}` },
        ]);
        requestSoftExit();
      }
    };

    runBenchmark();

    return () => {
      cancelled = true;
    };
  }, [benchmarkStartup]);

  const runAgentLoop = async (
    currentState: ContextState,
    activeHarness: ExecutionHarness,
    resumeCommand?: unknown,
  ) => {
    try {
      if (!resumeCommand) {
        setIsProcessing(true);
        setIsStreaming(true);
        setStreamingTokens([]);
      }

      const stream = activeHarness.run(currentState, resumeCommand as any);
      let nextHistory = [...currentState.conversationHistory];
      let finalState: any = null;

      for await (const event of stream) {
        if (
          event.event === "on_chat_model_stream" &&
          event.data?.chunk?.content
        ) {
          setStreamingTokens((prev) => [...prev, event.data.chunk.content]);
          setWorkflowTodos((prev) =>
            updateWorkflowTodo(
              prev,
              "response",
              "active",
              "Drafting the reply.",
            ),
          );
        } else if (event.event === "on_chat_model_end") {
          const content = event.data.output?.content;
          if (content && typeof content === "string") {
            setIsStreaming(false);
            setMessages((prev) => [...prev, { role: "agent", content }]);
          }
        } else if (event.event === "on_tool_start") {
          const toolCall = {
            id: `${event.name}-${toolRunCounterRef.current++}`,
            name: event.name,
            args: event.data.input,
            status: "running",
          } satisfies ActiveToolCall;
          setActiveToolCall(toolCall);
          setRecentToolCalls((prev) => [toolCall, ...prev].slice(0, 4));
          setWorkflowTodos((prev) =>
            updateWorkflowTodo(
              prev,
              "tools",
              "active",
              `Running ${event.name}.`,
            ),
          );
        } else if (event.event === "on_tool_end") {
          const toolResult = summarizeToolResult(event.data.output);
          setActiveToolCall((prev) =>
            prev
              ? {
                  ...prev,
                  status: "success",
                  result: toolResult,
                }
              : null,
          );
          setRecentToolCalls((prev) =>
            finalizeRecentToolCalls(prev, event.name, event.data.input, toolResult),
          );
          setWorkflowTodos((prev) =>
            updateWorkflowTodo(
              prev,
              "tools",
              "done",
              `${event.name} completed.`,
            ),
          );
          await new Promise((resolve) => setTimeout(resolve, 800));
          setActiveToolCall(null);
        } else if (
          event.event === "on_chain_end" &&
          event.name === "LangGraph"
        ) {
          finalState = event.data.output;
        }
      }

      // ── Handle LangGraph Interrupts (HITL) ──
      // Check if the agent paused for permission
      const stateObj = await (activeHarness as any).agent.getState({
        configurable: { thread_id: activeHarness.sessionId },
      });

      if (stateObj.next && stateObj.next.length > 0) {
        const tasks = stateObj.tasks || [];
        const activeTask = tasks[0];

        if (
          activeTask &&
          activeTask.interrupts &&
          activeTask.interrupts.length > 0
        ) {
          const interruptPayload = activeTask.interrupts[0].value;
          const toolName =
            interruptPayload?.toolCall?.name || "restricted_tool";
          const args = interruptPayload?.toolCall?.args || {};

          const bridge = HITLBridge.getInstance();
          const approved = await bridge.requestPermission(toolName, args);

          const resumePayload = approved
            ? { action: "approve" }
            : { action: "reject" };
          const { Command } = await import("@langchain/langgraph");
          const command = new Command({ resume: resumePayload });

          // Recurse to resume the graph
          await runAgentLoop(currentState, activeHarness, command);
          return;
        }
      }

      // Turn complete
      if (finalState && finalState.messages) {
        nextHistory = finalState.messages;
      }
      setContextState({ ...currentState, conversationHistory: nextHistory });
      setWorkflowTodos((prev) => completeWorkflowTodos(prev));
      setIsProcessing(false);
      setIsStreaming(false);
    } catch (error: any) {
      setIsStreaming(false);
      setActiveToolCall((prev) =>
        prev
          ? {
              ...prev,
              status: "error",
              result: error.message,
            }
          : null,
      );
      setRecentToolCalls((prev) => failRecentToolCalls(prev, error.message));
      setWorkflowTodos((prev) =>
        prev.map((todo) =>
          todo.state === "done"
            ? todo
            : { ...todo, state: "blocked", note: error.message }
        ),
      );
      setIsProcessing(false);
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Error: ${error.message}` },
      ]);
    }
  };

  const handleSubmit = async (query: string) => {
    if (!query.trim() || isProcessing) return;

    const userText = query.trim();
    setInputValue("");

    // ── Slash Command Interception ──
    // Commands starting with "/" are handled locally at zero LLM cost.
    if (commandRegistry.isCommand(userText)) {
      setMessages((prev) => [...prev, { role: "user", content: userText }]);
      const activeHarness = harness ?? (await ensureHarness());

      const commandContext = {
        config: {
          provider,
          model,
          maxTokens,
          streaming,
          temperature: 0,
        } as any,
        configPath: "",
        harness: activeHarness,
        contextState,
        setContextState,
        addSystemMessage: (content: string) => {
          setMessages((prev) => [...prev, { role: "system", content }]);
        },
        provider,
        model,
        maxTokens,
        contextTokens: contextTokensLimit,
      };

      try {
        const result = await commandRegistry.execute(userText, commandContext);

        // Handle /exit signal
        if (result === "__EXIT__") {
          setMessages((prev) => [
            ...prev,
            { role: "system", content: "Goodbye! 👋" },
          ]);
          setTimeout(() => {
            requestSoftExit();
          }, 500);
          return;
        }

        if (result) {
          setMessages((prev) => [...prev, { role: "system", content: result }]);
        }
      } catch (err: any) {
        setMessages((prev) => [
          ...prev,
          { role: "system", content: `Command error: ${err.message}` },
        ]);
      }
      return;
    }

    // ── Normal Agent Message ──
    setIsProcessing(true);

    // 1. Update UI
    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setWorkflowTodos(createWorkflowTodos(userText));

    // 2. Update Engine State
    const { HumanMessage } = await import("@langchain/core/messages");
    const humanMsg = new HumanMessage(userText);
    const updatedState = {
      ...contextState,
      conversationHistory: [...contextState.conversationHistory, humanMsg],
    };
    setContextState(updatedState);

    // 3. Start Turn
    try {
      const activeHarness = await ensureHarness();
      await runAgentLoop(updatedState, activeHarness);
    } catch (error: any) {
      setIsProcessing(false);
      setIsStreaming(false);
      setActiveToolCall(null);
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Error: ${error.message}` },
      ]);
    }
  };

  const requestSoftExit = () => {
    exit();
  };

  const summary = harness
    ? harness.tracer.getSummary()
    : {
        totalTokens: 0,
        cacheHitRate: 0,
        toolCallCount: 0,
        turnCount: 0,
        totalCost: 0,
      };
  const contextTokens = countMessageTokens(contextState.conversationHistory);
  const activeHitlPrompt = pendingHitlPrompts[0];
  const activeHitlQuestion =
    activeHitlPrompt?.type === "question" ? activeHitlPrompt.question : undefined;
  const activeHitlPermission =
    activeHitlPrompt?.type === "permission"
      ? activeHitlPrompt.permission
      : undefined;
  const hasActiveHitlPrompt = Boolean(activeHitlPrompt);

  return (
    <Box flexDirection="column" minHeight={15}>
      <Header provider={provider} model={model} streaming={streaming} />

      <Box flexDirection="row" flexGrow={1} width="100%">
        {/* LEFT COLUMN: Chat & Interactive Area */}
        <Box flexDirection="column" width="65%" paddingRight={1}>
          <Box flexDirection="column" paddingY={1}>
            <Static items={messages}>
              {(msg, i) => (
                <MessageBubble key={i} role={msg.role} content={msg.content} />
              )}
            </Static>
          </Box>

          {workflowTodos.length > 0 && (
            <Box paddingX={1}>
              <WorkflowTodoPanel todos={workflowTodos} />
            </Box>
          )}

          {isStreaming && (
            <Box paddingX={1} marginBottom={1}>
              <Box marginLeft={2}>
                <StreamingText
                  tokens={streamingTokens}
                  isStreaming={isStreaming}
                />
              </Box>
            </Box>
          )}

          {activeToolCall && (
            <Box paddingX={1} marginBottom={1}>
              <ToolCallPanel
                toolName={activeToolCall.name}
                args={activeToolCall.args}
                status={activeToolCall.status}
                result={activeToolCall.result}
              />
            </Box>
          )}

          {!activeToolCall && recentToolCalls.length > 0 && (
            <Box flexDirection="column" paddingX={1} marginBottom={1}>
              {recentToolCalls.map((toolCall) => (
                <ToolCallPanel
                  key={toolCall.id}
                  toolName={toolCall.name}
                  args={toolCall.args}
                  status={toolCall.status}
                  result={toolCall.result}
                />
              ))}
            </Box>
          )}

          {/* Interactive Prompt Area */}
          {hasActiveHitlPrompt && (
            <HITLPrompt
              question={activeHitlQuestion}
              permission={activeHitlPermission}
              pendingCount={Math.max(pendingHitlPrompts.length - 1, 0)}
            />
          )}

          {!benchmarkStartup && !isProcessing && !hasActiveHitlPrompt && (
            <Box paddingX={1} marginBottom={1}>
              <Box marginRight={1}>
                <Text color="green" bold>
                  ❯
                </Text>
              </Box>
              <TextInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                placeholder="What should we build today?"
              />
            </Box>
          )}

          {isProcessing &&
            !isStreaming &&
            !activeToolCall &&
            !hasActiveHitlPrompt && (
              <Box paddingX={1} marginBottom={1}>
                <Text dimColor>
                  {isInitializingHarness ? "Initializing agent..." : "Thinking..."}
                </Text>
              </Box>
            )}
        </Box>

        {/* RIGHT COLUMN: Dashboards */}
        <Box flexDirection="column" width="35%" paddingLeft={1}>
          <StatusBar
            contextTokens={contextTokens}
            maxContextTokens={contextTokensLimit}
            totalTokens={summary.totalTokens}
            cacheHitRate={summary.cacheHitRate}
            toolCalls={summary.toolCallCount}
            turns={summary.turnCount}
            cost={summary.totalCost}
            elapsed={elapsed}
          />
          <Box marginTop={1}>
            <FileBrowser />
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

function createWorkflowTodos(query: string): WorkflowTodoItem[] {
  return [
    {
      id: "request",
      label: "Understand the request",
      note: summarizeText(query, 88),
      state: "done",
    },
    {
      id: "tools",
      label: "Inspect files and run tools",
      note: "Waiting for the next action.",
      state: "active",
    },
    {
      id: "response",
      label: "Draft the response",
      note: "Will start once enough context is gathered.",
      state: "pending",
    },
  ];
}

function updateWorkflowTodo(
  todos: WorkflowTodoItem[],
  id: WorkflowTodoItem["id"],
  state: WorkflowTodoItem["state"],
  note: string,
): WorkflowTodoItem[] {
  return todos.map((todo) => (todo.id === id ? { ...todo, state, note } : todo));
}

function completeWorkflowTodos(todos: WorkflowTodoItem[]): WorkflowTodoItem[] {
  const hadToolActivity = todos.some(
    (todo) => todo.id === "tools" && todo.note !== "Waiting for the next action.",
  );

  return todos.map((todo) => {
    if (todo.id === "tools") {
      return {
        ...todo,
        state: "done",
        note: hadToolActivity
          ? "Tool work finished successfully."
          : "No tool calls were needed for this reply.",
      };
    }

    if (todo.id === "response") {
      return {
        ...todo,
        state: "done",
        note: "Reply delivered to the conversation.",
      };
    }

    return { ...todo, state: "done" };
  });
}

function finalizeRecentToolCalls(
  toolCalls: ActiveToolCall[],
  toolName: string,
  args: Record<string, unknown>,
  result: string,
): ActiveToolCall[] {
  let updated = false;

  const next = toolCalls.map((toolCall) => {
    if (!updated && toolCall.name === toolName && toolCall.status === "running") {
      updated = true;
      const nextToolCall: ActiveToolCall = {
        ...toolCall,
        args,
        status: "success",
        result,
      };
      return nextToolCall;
    }

    return toolCall;
  });

  if (updated) {
    return next;
  }

  const completedTool: ActiveToolCall = {
      id: `${toolName}-${Date.now()}`,
      name: toolName,
      args,
      status: "success",
      result,
    };

  return [completedTool, ...toolCalls].slice(0, 4);
}

function failRecentToolCalls(
  toolCalls: ActiveToolCall[],
  errorMessage: string,
): ActiveToolCall[] {
  let updated = false;

  return toolCalls.map((toolCall) => {
    if (!updated && toolCall.status === "running") {
      updated = true;
      return {
        ...toolCall,
        status: "error",
        result: errorMessage,
      };
    }

    return toolCall;
  });
}

function summarizeToolResult(value: unknown): string {
  if (typeof value === "string") {
    return summarizeText(value, 180);
  }

  if (value == null) {
    return "Tool execution completed.";
  }

  try {
    return summarizeText(JSON.stringify(value), 180);
  } catch {
    return summarizeText(String(value), 180);
  }
}

function summarizeText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3)}...`;
}
