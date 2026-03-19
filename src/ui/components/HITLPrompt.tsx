import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import {
  HITLQuestion,
  HITLPermissionRequest,
  HITLBridge,
} from "../../hitl/bridge.js";

interface HITLPromptProps {
  /** The active HITL question or permission request. */
  question?: HITLQuestion;
  permission?: HITLPermissionRequest;
  pendingCount?: number;
}

/**
 * HITLPrompt — renders a blocking question/permission prompt in the TUI.
 *
 * When a tool calls `ask_user_question` or the PermissionMiddleware fires,
 * this component takes over the input area to capture the user's response.
 */
export const HITLPrompt: React.FC<HITLPromptProps> = ({
  question,
  permission,
  pendingCount = 0,
}) => {
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = (value: string) => {
    const bridge = HITLBridge.getInstance();
    if (question) {
      bridge.resolveAnswer(question.id, value);
    } else if (permission) {
      bridge.resolveAnswer(permission.id, value);
    }
    setInputValue("");
  };

  if (question) {
    return (
      <Box flexDirection="column" paddingX={1} marginBottom={1}>
        <Box marginBottom={1}>
          <Text color="yellow" bold>
            ❓ Agent is asking:
          </Text>
        </Box>
        <Box marginLeft={2} marginBottom={1}>
          <Text>{question.question}</Text>
        </Box>
        {pendingCount > 0 && (
          <Box marginLeft={2} marginBottom={1}>
            <Text dimColor>{`Pending prompts: ${pendingCount}`}</Text>
          </Box>
        )}
        {question.options && question.options.length > 0 && (
          <Box flexDirection="column" marginLeft={2} marginBottom={1}>
            {question.options.map((opt, i) => (
              <Text key={i} dimColor>
                {`  ${i + 1}. ${opt}`}
              </Text>
            ))}
          </Box>
        )}
        <Box>
          <Box marginRight={1}>
            <Text color="yellow" bold>
              →
            </Text>
          </Box>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            placeholder="Type your answer..."
          />
        </Box>
      </Box>
    );
  }

  if (permission) {
    const argsSummary = Object.entries(permission.args)
      .map(
        ([k, v]) =>
          `${k}: ${typeof v === "string" ? v.substring(0, 60) : JSON.stringify(v)}`,
      )
      .join(", ");

    return (
      <Box flexDirection="column" paddingX={1} marginBottom={1}>
        <Box marginBottom={1}>
          <Text color="red" bold>
            ⚠ Permission Required:
          </Text>
        </Box>
        <Box marginLeft={2} marginBottom={1}>
          <Text>
            The agent wants to execute{" "}
            <Text bold color="white">
              {permission.toolName}
            </Text>
          </Text>
        </Box>
        <Box marginLeft={2} marginBottom={1}>
          <Text dimColor>{argsSummary}</Text>
        </Box>
        {pendingCount > 0 && (
          <Box marginLeft={2} marginBottom={1}>
            <Text dimColor>{`Pending prompts: ${pendingCount}`}</Text>
          </Box>
        )}
        <Box>
          <Box marginRight={1}>
            <Text color="red" bold>
              Allow? (y/n):
            </Text>
          </Box>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            placeholder="y or n"
          />
        </Box>
      </Box>
    );
  }

  return null;
};
