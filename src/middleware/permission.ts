import { ToolCallContext, ToolMiddleware } from "./types.js";
import { HITLBridge } from "../hitl/bridge.js";
import { ToolResult } from "../tools/index.js";

export type PermissionMode = "auto" | "ask_dangerous" | "ask_all";

/** Tools that are always safe and never need user approval. */
const SAFE_TOOLS = new Set([
    "read_file",
    "view_file_outline",
    "search_skills",
    "load_skill",
    "search_tools",
    "ask_user_question", // Meta: the ask tool itself is always safe
]);

/** Tools that perform destructive or side-effect-heavy operations. */
const DANGEROUS_TOOLS = new Set([
    "bash",
    "write_file",
    "replace_file_content",
    "multi_replace_file_content",
    "install_deps",
    "install_host_dependencies",
]);

/**
 * PermissionMiddleware — gates dangerous tool calls behind user approval.
 *
 * Behavior per mode:
 * - `auto`: All tools execute without asking. (Default for power users.)
 * - `ask_dangerous`: Only tools in DANGEROUS_TOOLS require approval.
 * - `ask_all`: Every tool except SAFE_TOOLS requires approval.
 */
export class PermissionMiddleware implements ToolMiddleware {
    name = "PermissionMiddleware";
    private mode: PermissionMode;

    constructor(mode: PermissionMode = "auto") {
        this.mode = mode;
    }

    async before(ctx: ToolCallContext): Promise<ToolCallContext | string | void> {
        if (this.mode === "auto") return ctx;

        const toolName = ctx.toolName;
        const needsApproval = this.requiresApproval(toolName);

        if (!needsApproval) return ctx;

        const bridge = HITLBridge.getInstance();
        const approved = await bridge.requestPermission(toolName, ctx.args);

        if (!approved) {
            // Short-circuit: return a string to deny the tool call
            return (
                `Permission denied: The user declined to approve the execution of "${toolName}". ` +
                `Try an alternative approach or ask the user for guidance using the ask_user_question tool.`
            );
        }

        return ctx;
    }

    private requiresApproval(toolName: string): boolean {
        if (SAFE_TOOLS.has(toolName)) return false;

        if (this.mode === "ask_all") return true;
        if (this.mode === "ask_dangerous") return DANGEROUS_TOOLS.has(toolName);

        return false;
    }
}
