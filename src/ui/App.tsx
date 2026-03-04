import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { Header } from "./components/Header.js";
import { StatusBar } from "./components/StatusBar.js";
import { MessageBubble } from "./components/MessageBubble.js";
import { StreamingText } from "./components/StreamingText.js";
import { ToolCallPanel, ToolCallStatus } from "./components/ToolCallPanel.js";
import { HITLPrompt } from "./components/HITLPrompt.js";
import { ExecutionHarness } from "../core/agentLoop.js";
import { ContextState } from "../core/promptBuilder.js";
import { countMessageTokens } from "../core/tokenCounter.js";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import {
  HITLBridge,
  HITLQuestion,
  HITLPermissionRequest,
} from "../hitl/bridge.js";

export interface Message {
  role: "user" | "agent" | "system";
  content: string;
}

export interface ActiveToolCall {
  name: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
}

interface AppProps {
  provider: string;
  model: string;
  streaming: boolean;
  harness: ExecutionHarness;
  initialState: ContextState;
  maxTokens: number;
}

export const App: React.FC<AppProps> = ({
  provider,
  model,
  streaming,
  harness,
  initialState,
  maxTokens,
}) => {
  const { exit } = useApp();

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

  // Core Engine State
  const [contextState, setContextState] = useState<ContextState>(initialState);

  // HITL State
  const [hitlQuestion, setHitlQuestion] = useState<HITLQuestion | undefined>(
    undefined,
  );
  const [hitlPermission, setHitlPermission] = useState<
    HITLPermissionRequest | undefined
  >(undefined);

  // Listen for HITL events from the bridge
  useEffect(() => {
    const bridge = HITLBridge.getInstance();

    const onQuestion = (q: HITLQuestion) => setHitlQuestion(q);
    const onPermission = (p: HITLPermissionRequest) => setHitlPermission(p);

    bridge.on("question", onQuestion);
    bridge.on("permission", onPermission);

    // Clear prompts when resolved
    const origResolve = bridge.resolveAnswer.bind(bridge);
    bridge.resolveAnswer = (id: string, answer: string) => {
      origResolve(id, answer);
      setHitlQuestion(undefined);
      setHitlPermission(undefined);
    };

    return () => {
      bridge.off("question", onQuestion);
      bridge.off("permission", onPermission);
    };
  }, []);

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

  // Handle Ctrl+C
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
      process.exit(0);
    }
  });

  const runAgentLoop = async (currentState: ContextState) => {
    try {
      setIsStreaming(true);
      setStreamingTokens([]);

      let aiResponse: AIMessage;

      if (streaming) {
        aiResponse = await harness.streamStep(currentState, {
          onToken: (token) => {
            setStreamingTokens((prev) => [...prev, token]);
          },
        });
      } else {
        aiResponse = await harness.step(currentState);
      }

      setIsStreaming(false);

      // Add AI text to UI if any
      if (
        aiResponse.content &&
        typeof aiResponse.content === "string" &&
        aiResponse.content.trim() !== ""
      ) {
        setMessages((prev) => [
          ...prev,
          { role: "agent", content: aiResponse.content as string },
        ]);
      }

      // Add AI message to memory for following tools
      let nextHistory = [...currentState.conversationHistory, aiResponse];

      // Handle Tools
      if (aiResponse.tool_calls && aiResponse.tool_calls.length > 0) {
        // Execute all tool calls once
        const toolMessages = await harness.executeToolCalls(
          aiResponse,
          currentState,
        );

        // Update UI sequentially for each tool call
        for (const call of aiResponse.tool_calls) {
          setActiveToolCall({
            name: call.name,
            args: call.args,
            status: "running",
          });

          // Brief delay to show running state
          await new Promise((resolve) => setTimeout(resolve, 300));

          setActiveToolCall({
            name: call.name,
            args: call.args,
            status: "success",
            result:
              toolMessages.length > 0
                ? "Tool execution completed."
                : "No output.",
          });
        }

        // Add tool results to history once
        nextHistory = [...nextHistory, ...toolMessages];

        // Wait a sec so user sees the success state
        await new Promise((resolve) => setTimeout(resolve, 800));
        setActiveToolCall(null);

        // Recurse: Agent needs to react to the tool output
        const nextState = { ...currentState, conversationHistory: nextHistory };
        setContextState(nextState);
        await runAgentLoop(nextState);
      } else {
        // Turn complete
        setContextState({ ...currentState, conversationHistory: nextHistory });
        setIsProcessing(false);
      }
    } catch (error: any) {
      setIsStreaming(false);
      setActiveToolCall(null);
      setIsProcessing(false);
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Error: ${error.message}` },
      ]);
    }
  };

  const handleSubmit = (query: string) => {
    if (!query.trim() || isProcessing) return;

    const userText = query.trim();
    setInputValue("");
    setIsProcessing(true);

    // 1. Update UI
    setMessages((prev) => [...prev, { role: "user", content: userText }]);

    // 2. Update Engine State
    const humanMsg = new HumanMessage(userText);
    const updatedState = {
      ...contextState,
      conversationHistory: [...contextState.conversationHistory, humanMsg],
    };
    setContextState(updatedState);

    // 3. Start Turn
    runAgentLoop(updatedState);
  };

  const summary = harness.tracer.getSummary();
  const contextTokens = countMessageTokens(contextState.conversationHistory);

  return (
    <Box flexDirection="column" minHeight={15}>
      <Header provider={provider} model={model} streaming={streaming} />

      <Box flexDirection="column" paddingY={1}>
        {messages.map((msg, i) => (
          <MessageBubble key={i} role={msg.role} content={msg.content} />
        ))}
      </Box>

      {isStreaming && (
        <Box paddingX={1} marginBottom={1}>
          <Box marginLeft={2}>
            <StreamingText tokens={streamingTokens} isStreaming={isStreaming} />
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

      {/* Interactive Prompt Area */}
      {(hitlQuestion || hitlPermission) && (
        <HITLPrompt question={hitlQuestion} permission={hitlPermission} />
      )}

      {!isProcessing && !hitlQuestion && !hitlPermission && (
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

      {isProcessing && !isStreaming && !activeToolCall && (
        <Box paddingX={1} marginBottom={1}>
          <Text dimColor>Thinking...</Text>
        </Box>
      )}

      <StatusBar
        contextTokens={contextTokens}
        maxContextTokens={maxTokens}
        totalTokens={summary.totalTokens}
        cacheHitRate={summary.cacheHitRate}
        toolCalls={summary.toolCallCount}
        turns={summary.turnCount}
        cost={summary.totalCost}
        elapsed={elapsed}
      />
    </Box>
  );
};
