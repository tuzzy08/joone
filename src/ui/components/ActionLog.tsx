import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import { AgentEventEmitter, AgentEvent } from "../../core/events.js";

const MAX_LOGS = 10;

interface ActionLogProps {
  emitter: AgentEventEmitter;
}

export const ActionLog: React.FC<ActionLogProps> = ({ emitter }) => {
  const [logs, setLogs] = useState<{ id: number; event: AgentEvent }[]>([]);

  useEffect(() => {
    let counter = 0;
    const handleEvent = (event: AgentEvent) => {
      // Ignore text streams so we don't spam the action log
      if (event.type === "agent:stream") return;

      setLogs((prev) => {
        const next = [...prev, { id: ++counter, event }];
        return next.slice(-MAX_LOGS);
      });
    };

    emitter.on("agent:event", handleEvent);
    return () => {
      emitter.off("agent:event", handleEvent);
    };
  }, [emitter]);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="blue"
      paddingX={1}
      width="100%"
      minHeight={12}
    >
      <Text bold color="blue">
        Activity Log
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {logs.length === 0 ? (
          <Text dimColor>No activity yet...</Text>
        ) : (
          logs.map(({ id, event }) => {
            let label = "";
            let color = "gray";

            switch (event.type) {
              case "tool:start":
                label = `[Tool] Starting ${event.toolName}`;
                color = "yellow";
                break;
              case "tool:end":
                label = `[Tool] ${event.toolName} completed in ${event.durationMs}ms`;
                color = "green";
                break;
              case "subagent:spawn":
                label = `[SubAgent] Spawning '${event.agentName}'`;
                color = "magenta";
                break;
              case "file:io":
                // Safely handle path which might be undefined somehow or use standard format
                label = `[File] ${event.action.toUpperCase()}: ${event.path.split(/[\\/]/).pop()}`;
                color = "cyan";
                break;
              case "system:script_exec":
                label = `[Exec] ${event.location}: ${event.command.slice(0, 30)}...`;
                color = "red";
                break;
              case "browser:nav":
                label = `[Browser] Navigating to ${event.url}`;
                color = "blueBright";
                break;
              case "system:save":
                label = `[System] Saved Session State`;
                color = "gray";
                break;
              default:
                label = `[Unknown] Event type: ${(event as any).type}`;
                color = "gray";
            }

            return (
              <Text key={id} color={color}>
                {label}
              </Text>
            );
          })
        )}
      </Box>
    </Box>
  );
};
