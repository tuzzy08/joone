import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  tokenCount?: number;
  cacheHitRate?: number;
  elapsed?: string;
  toolCalls?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  tokenCount = 0,
  cacheHitRate,
  elapsed = "0s",
  toolCalls = 0,
}) => {
  return (
    <Box
      paddingX={1}
      borderStyle="single"
      borderColor="gray"
      justifyContent="space-between"
    >
      <Text>
        <Text dimColor>tokens</Text>{" "}
        <Text color="white">{tokenCount.toLocaleString()}</Text>
      </Text>
      {cacheHitRate !== undefined && (
        <Text>
          <Text dimColor>cache</Text>{" "}
          <Text color={cacheHitRate > 0.8 ? "green" : "yellow"}>
            {(cacheHitRate * 100).toFixed(0)}%
          </Text>
        </Text>
      )}
      <Text>
        <Text dimColor>tools</Text> <Text color="white">{toolCalls}</Text>
      </Text>
      <Text>
        <Text dimColor>elapsed</Text> <Text color="white">{elapsed}</Text>
      </Text>
    </Box>
  );
};
