import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export type ToolCallStatus = "running" | "success" | "error";

interface ToolCallPanelProps {
  toolName: string;
  args?: Record<string, unknown>;
  status: ToolCallStatus;
  result?: string;
}

/**
 * Styled panel that appears when the agent invokes a tool.
 * Shows the tool name, arguments, a spinner while executing,
 * and the result once complete.
 */
export const ToolCallPanel: React.FC<ToolCallPanelProps> = ({
  toolName,
  args,
  status,
  result,
}) => {
  const borderColor =
    status === "running" ? "yellow" : status === "success" ? "green" : "red";

  const statusIcon =
    status === "running" ? (
      <Text color="yellow">
        <Spinner type="dots" />
      </Text>
    ) : status === "success" ? (
      <Text color="green">✓</Text>
    ) : (
      <Text color="red">✗</Text>
    );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      marginY={0}
    >
      <Box gap={1}>
        {statusIcon}
        <Text bold color={borderColor}>
          {toolName}
        </Text>
      </Box>

      {args && Object.keys(args).length > 0 && (
        <Box marginLeft={2} flexDirection="column">
          {Object.entries(args).map(([key, value]) => (
            <Text key={key}>
              <Text dimColor>{key}:</Text>{" "}
              <Text color="white">
                {typeof value === "string"
                  ? value.length > 80
                    ? value.slice(0, 77) + "..."
                    : value
                  : JSON.stringify(value)}
              </Text>
            </Text>
          ))}
        </Box>
      )}

      {result && (
        <Box marginTop={0} marginLeft={2}>
          <Text dimColor>
            {result.length > 120 ? result.slice(0, 117) + "..." : result}
          </Text>
        </Box>
      )}
    </Box>
  );
};
