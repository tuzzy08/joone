import { installHostDependenciesTool } from "./installHostDeps.js";
import { bashTool, bindSandbox } from "./bashTool.js";

// Re-export bindSandbox so index.ts can initialize it
export { bindSandbox };

// The core custom tools that the agent needs.
// Note: File I/O (read_file, write_file, edit_file, ls, grep) and Subagents
// are provided natively by Deep Agents via the FilesystemBackend and createSubAgentMiddleware.
export const CORE_TOOLS = [
    bashTool,
    installHostDependenciesTool,
];
