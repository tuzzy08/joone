import React, { useState, useEffect } from "react";
import { Text } from "ink";

interface StreamingTextProps {
  /** Array of tokens that have been received so far. */
  tokens: string[];
  /** Whether the stream is still active. */
  isStreaming: boolean;
}

/**
 * StreamingText renders incoming tokens with a blinking cursor
 * while the stream is active. Once streaming stops, the cursor disappears.
 */
export const StreamingText: React.FC<StreamingTextProps> = ({
  tokens,
  isStreaming,
}) => {
  const [cursorVisible, setCursorVisible] = useState(true);

  useEffect(() => {
    if (!isStreaming) {
      setCursorVisible(false);
      return;
    }

    const interval = setInterval(() => {
      setCursorVisible((v) => !v);
    }, 500);

    return () => clearInterval(interval);
  }, [isStreaming]);

  const fullText = tokens.join("");

  return (
    <Text>
      <Text color="white">{fullText}</Text>
      {isStreaming && (
        <Text color="cyan" bold>
          {cursorVisible ? "▊" : " "}
        </Text>
      )}
    </Text>
  );
};
