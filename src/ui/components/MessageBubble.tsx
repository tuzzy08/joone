import React from "react";
import { Box, Text } from "ink";

type MessageRole = "user" | "agent" | "system";

interface MessageBubbleProps {
  role: MessageRole;
  content: string;
}

/**
 * Renders a single conversation message with role-based styling.
 * - User messages: cyan accent, labeled "you"
 * - Agent messages: green accent, labeled "joone"
 * - System messages: centered, dim yellow
 */ export const MessageBubble: React.FC<MessageBubbleProps> = ({
  role,
  content,
}) => {
  if (role === "system") {
    return (
      <Box paddingX={1} justifyContent="center">
        <Text dimColor italic color="yellow">
          ⚙ {content}
        </Text>
      </Box>
    );
  }

  const isUser = role === "user";
  const accentColor = isUser ? "cyan" : "green";
  const label = isUser ? "you" : "joone";

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={accentColor}>
        {label}
      </Text>
      <Box marginLeft={2}>
        <Text color="white" wrap="wrap">
          {content}
        </Text>
      </Box>
    </Box>
  );
};
