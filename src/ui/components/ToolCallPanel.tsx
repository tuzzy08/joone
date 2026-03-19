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

export const ToolCallPanel: React.FC<ToolCallPanelProps> = ({
  toolName,
  args,
  status,
  result,
}) => {
  const borderColor =
    status === "running" ? "yellow" : status === "success" ? "green" : "red";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between">
        <Box flexDirection="column">
          <Text dimColor>TOOL CALL</Text>
          <Text bold color={borderColor}>
            {toolName}
          </Text>
        </Box>
        <StatusBadge status={status} />
      </Box>

      {args && Object.keys(args).length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>arguments</Text>
          <Box flexDirection="column" marginLeft={1}>
            {Object.entries(args)
              .slice(0, 4)
              .map(([key, value]) => (
                <Text key={key} wrap="wrap">
                  <Text color="gray">{key}:</Text> {formatValue(value)}
                </Text>
              ))}
          </Box>
        </Box>
      ) : null}

      {result ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>result</Text>
          <Box marginLeft={1}>
            <Text wrap="wrap">{summarizeText(result, 180)}</Text>
          </Box>
        </Box>
      ) : null}
    </Box>
  );
};

const StatusBadge: React.FC<{ status: ToolCallStatus }> = ({ status }) => {
  if (status === "running") {
    return (
      <Text color="yellow">
        <Spinner type="dots" /> running
      </Text>
    );
  }

  if (status === "success") {
    return <Text color="green">done</Text>;
  }

  return <Text color="red">error</Text>;
};

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return summarizeText(value, 72);
  }

  if (value == null) {
    return "null";
  }

  try {
    return summarizeText(JSON.stringify(value), 72);
  } catch {
    return summarizeText(String(value), 72);
  }
}

function summarizeText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3)}...`;
}
