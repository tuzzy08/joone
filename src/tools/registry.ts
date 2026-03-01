import { DynamicToolInterface } from "./index.js";

/**
 * Lazy Tool Registry
 *
 * Instead of loading all complex tools into the System Prompt (which burns tokens
 * and risks cache invalidation if changed), this registry maintains "stubs" —
 * lightweight descriptors that let the agent discover tools on demand.
 *
 * Tools in DeferredToolsDB are NOT sent to the LLM by default. The agent can
 * search for them via SearchToolsTool, then activate them via ActivateToolTool.
 */

// ─── Deferred (Lazy) Tools ─────────────────────────────────────────────────────

export const DeferredToolsDB: Record<string, DynamicToolInterface> = {
  git_commit: {
    name: "git_commit",
    description: "Creates a new git commit with staged changes.",
    schema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
    execute: async (args) => `Committed with message: ${args.message}`,
  },
  git_diff: {
    name: "git_diff",
    description:
      "Shows the diff of uncommitted changes or between two branches/commits.",
    schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Branch, commit, or file path (optional)",
        },
      },
    },
    execute: async (args) =>
      `Diff for: ${args.target || "working directory"}`,
  },
  git_log: {
    name: "git_log",
    description: "Shows recent commit history with messages and hashes.",
    schema: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Number of recent commits to show (default: 10)",
        },
      },
    },
    execute: async (args) =>
      `Showing last ${args.count || 10} commits.`,
  },
  grep_search: {
    name: "grep_search",
    description:
      "Searches for a text pattern across project files using ripgrep. Returns matching lines with filenames and line numbers.",
    schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search pattern (regex supported)" },
        path: { type: "string", description: "Directory or file to search in (default: .)" },
        includes: { type: "string", description: "File glob filter (e.g., '*.ts')" },
      },
      required: ["query"],
    },
    execute: async (args) =>
      `Search results for '${args.query}'`,
  },
  list_dir: {
    name: "list_dir",
    description:
      "Lists the contents of a directory — files and subdirectories with sizes.",
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path to list" },
      },
      required: ["path"],
    },
    execute: async (args) =>
      `Directory listing for: ${args.path}`,
  },
};

// ─── Active Tool Set (starts empty, filled by ActivateToolTool) ─────────────

const activatedTools: Map<string, DynamicToolInterface> = new Map();

/**
 * Returns a tool that has been dynamically activated.
 */
export function getActivatedTool(name: string): DynamicToolInterface | undefined {
  return activatedTools.get(name);
}

/**
 * Returns all currently activated tools.
 */
export function getActivatedTools(): DynamicToolInterface[] {
  return Array.from(activatedTools.values());
}

/**
 * Activates a tool from the deferred registry, making it available for execution.
 * Returns the activated tool, or undefined if not found.
 */
export function activateTool(name: string): DynamicToolInterface | undefined {
  const tool = DeferredToolsDB[name];
  if (!tool) return undefined;

  activatedTools.set(name, tool);
  return tool;
}

/**
 * Resets all activated tools. For testing.
 */
export function resetActivatedTools(): void {
  activatedTools.clear();
}

// ─── SearchToolsTool ────────────────────────────────────────────────────────────

/**
 * Fuzzy search: matches on tool name OR any word in the description.
 */
function fuzzyMatch(query: string, tool: DynamicToolInterface): boolean {
  const q = query.toLowerCase();
  const nameMatch = tool.name.toLowerCase().includes(q);
  const descWords = tool.description.toLowerCase();
  const descMatch = descWords.includes(q);
  return nameMatch || descMatch;
}

export const SearchToolsTool: DynamicToolInterface = {
  name: "search_tools",
  description:
    "Search for advanced tools available in the environment. Matches by tool name or description keywords.",
  schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
    },
    required: ["query"],
  },
  execute: async (args: { query: string }) => {
    const matches = Object.values(DeferredToolsDB).filter((tool) =>
      fuzzyMatch(args.query, tool)
    );

    if (matches.length === 0) {
      return `No tools found matching '${args.query}'. Available categories: git, file, search.`;
    }

    const descriptions = matches.map(
      (t) => `- **${t.name}**: ${t.description}`
    );

    return (
      `Found ${matches.length} tool(s):\n${descriptions.join("\n")}\n\n` +
      `To use a tool, call activate_tool with its name.`
    );
  },
};

// ─── ActivateToolTool ───────────────────────────────────────────────────────────

export const ActivateToolTool: DynamicToolInterface = {
  name: "activate_tool",
  description:
    "Activates a discovered tool for use. Call search_tools first to find available tools.",
  schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The tool name to activate" },
    },
    required: ["name"],
  },
  execute: async (args: { name: string }) => {
    const tool = activateTool(args.name);

    if (!tool) {
      return `Error: Tool '${args.name}' not found in the registry. Use search_tools to see available tools.`;
    }

    return (
      `✓ Tool '${args.name}' activated.\n` +
      `Schema: ${JSON.stringify(tool.schema, null, 2)}\n` +
      `You can now call it directly.`
    );
  },
};
