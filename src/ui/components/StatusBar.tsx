import React from "react";
import { Box, Text } from "ink";

interface StatusBarProps {
  /** Current tokens used in the context window (estimated). */
  contextTokens?: number;
  /** Maximum context window size for the model. */
  maxContextTokens?: number;
  /** Total tokens consumed across all LLM calls (prompt + completion). */
  totalTokens?: number;
  /** Cache hit rate (0–1). */
  cacheHitRate?: number;
  /** Elapsed session time. */
  elapsed?: string;
  /** Total tool calls executed. */
  toolCalls?: number;
  /** Number of LLM turns. */
  turns?: number;
  /** Estimated cost in USD. */
  cost?: number;
}

/**
 * Renders a visual capacity bar for the context window.
 *
 * Example: ▓▓▓▓▓▓▓▓░░░░░░░  52%
 */
function ContextBar({
  used,
  max,
  width = 16,
}: {
  used: number;
  max: number;
  width?: number;
}) {
  const ratio = max > 0 ? Math.min(used / max, 1) : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const pct = Math.round(ratio * 100);

  // Color: green < 60%, yellow 60-80%, red > 80%
  const barColor = ratio < 0.6 ? "green" : ratio < 0.8 ? "yellow" : "red";

  return (
    <Text>
      <Text color={barColor}>{"▓".repeat(filled)}</Text>
      <Text dimColor>{"░".repeat(empty)}</Text>
      <Text> </Text>
      <Text color={barColor}>{pct}%</Text>
    </Text>
  );
}

/**
 * Formats a token count for display (e.g., 3241 → "3.2K", 128000 → "128K").
 */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  contextTokens = 0,
  maxContextTokens = 200_000,
  totalTokens = 0,
  cacheHitRate,
  elapsed = "0s",
  toolCalls = 0,
  turns = 0,
  cost,
}) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      {/* Row 1: Context Window */}
      <Box justifyContent="space-between">
        <Box>
          <Text dimColor>ctx </Text>
          <ContextBar used={contextTokens} max={maxContextTokens} />
          <Text dimColor>
            {" "}
            {formatTokens(contextTokens)}/{formatTokens(maxContextTokens)}
          </Text>
        </Box>
        {cacheHitRate !== undefined && (
          <Text>
            <Text dimColor>cache </Text>
            <Text
              color={
                cacheHitRate > 0.8
                  ? "green"
                  : cacheHitRate > 0.5
                    ? "yellow"
                    : "red"
              }
            >
              {(cacheHitRate * 100).toFixed(0)}%
            </Text>
          </Text>
        )}
      </Box>

      {/* Row 2: Session Metrics */}
      <Box justifyContent="space-between">
        <Text>
          <Text dimColor>tokens </Text>
          <Text color="white">{formatTokens(totalTokens)}</Text>
        </Text>
        <Text>
          <Text dimColor>turns </Text>
          <Text color="white">{turns}</Text>
        </Text>
        <Text>
          <Text dimColor>tools </Text>
          <Text color="white">{toolCalls}</Text>
        </Text>
        {cost !== undefined && cost > 0 && (
          <Text>
            <Text dimColor>cost </Text>
            <Text color="white">
              ${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}
            </Text>
          </Text>
        )}
        <Text>
          <Text dimColor>elapsed </Text>
          <Text color="white">{elapsed}</Text>
        </Text>
      </Box>
    </Box>
  );
};
