import React from "react";
import { Box, Text } from "ink";

export type WorkflowTodoState = "done" | "active" | "pending" | "blocked";

export interface WorkflowTodoItem {
  id: "request" | "tools" | "response";
  label: string;
  note: string;
  state: WorkflowTodoState;
}

interface WorkflowTodoPanelProps {
  todos: WorkflowTodoItem[];
}

export const WorkflowTodoPanel: React.FC<WorkflowTodoPanelProps> = ({
  todos,
}) => {
  if (todos.length === 0) {
    return null;
  }

  const doneCount = todos.filter((todo) => todo.state === "done").length;
  const progress = Math.round((doneCount / todos.length) * 100);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
      marginBottom={1}
    >
      <Box justifyContent="space-between">
        <Box flexDirection="column">
          <Text dimColor>LIVE PROGRESS</Text>
          <Text bold color="blue">
            Agent workstream
          </Text>
        </Box>
        <Text color="blue">{progress}% complete</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {todos.map((todo) => (
          <Box key={todo.id} marginBottom={1}>
            <Box width={8}>
              <Text color={colorForState(todo.state)}>{labelForState(todo.state)}</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1}>
              <Text bold>{todo.label}</Text>
              <Text dimColor wrap="wrap">
                {todo.note}
              </Text>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
};

function labelForState(state: WorkflowTodoState): string {
  switch (state) {
    case "done":
      return "[done]";
    case "active":
      return "[now ]";
    case "blocked":
      return "[hold]";
    default:
      return "[next]";
  }
}

function colorForState(state: WorkflowTodoState): "green" | "yellow" | "red" | "gray" {
  switch (state) {
    case "done":
      return "green";
    case "active":
      return "yellow";
    case "blocked":
      return "red";
    default:
      return "gray";
  }
}
