import React from "react";
import { Box, Text } from "ink";
import chalk from "chalk";

interface HeaderProps {
  provider: string;
  model: string;
  streaming: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  provider,
  model,
  streaming,
}) => {
  return (
    <Box
      flexDirection="column"
      paddingX={1}
      borderStyle="round"
      borderColor="cyan"
    >
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          ◆ joone
        </Text>
        <Text dimColor>v0.1.0</Text>
      </Box>
      <Box marginTop={0} gap={2}>
        <Text>
          <Text dimColor>provider</Text>{" "}
          <Text color="white" bold>
            {provider}
          </Text>
        </Text>
        <Text>
          <Text dimColor>model</Text>{" "}
          <Text color="white" bold>
            {model}
          </Text>
        </Text>
        <Text>
          <Text dimColor>stream</Text>{" "}
          <Text color={streaming ? "green" : "yellow"}>
            {streaming ? "on" : "off"}
          </Text>
        </Text>
      </Box>
    </Box>
  );
};
