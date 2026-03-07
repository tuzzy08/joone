import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";
import * as fs from "node:fs";
import * as path from "node:path";

export const FileBrowser: React.FC = () => {
  const [items, setItems] = useState<{ name: string; isDir: boolean }[]>([]);

  useEffect(() => {
    const updateTree = () => {
      try {
        const cwd = process.cwd();
        const dirents = fs.readdirSync(cwd, { withFileTypes: true });

        // Filter out .git, node_modules etc. to keep it compact
        const filtered = dirents.filter(
          (d) =>
            !d.name.startsWith(".git") &&
            d.name !== "node_modules" &&
            !d.name.endsWith(".log"),
        );

        // Sort: dirs first, then files
        filtered.sort((a, b) => {
          if (a.isDirectory() && !b.isDirectory()) return -1;
          if (!a.isDirectory() && b.isDirectory()) return 1;
          return a.name.localeCompare(b.name);
        });

        const mapped = filtered
          .map((d) => ({
            name: d.name,
            isDir: d.isDirectory(),
          }))
          .slice(0, 15); // limit output so we don't break layout

        setItems(mapped);
      } catch (e) {}
    };

    updateTree();
    const interval = setInterval(updateTree, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="cyan"
      paddingX={1}
      width="100%"
      minHeight={10}
    >
      <Text bold color="cyan">
        Workspace ({path.basename(process.cwd())})
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {items.length === 0 ? (
          <Text dimColor>Empty directory</Text>
        ) : (
          items.map((item, i) => (
            <Text key={i} color={item.isDir ? "blueBright" : "white"}>
              {item.isDir ? "📁" : "📄"} {item.name}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
};
