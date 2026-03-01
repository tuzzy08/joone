import { ToolCallContext, ToolMiddleware } from "./types.js";

/**
 * Intercepts bash tool calls to block dangerous or interactive commands.
 *
 * Categories of blocked commands:
 * 1. Destructive: `rm -rf /`, `mkfs`, `dd if=`, fork bombs
 * 2. Interactive/hanging: `vim`, `nano`, `less`, `top`, `htop`, `man`
 * 3. Network abuse: `curl | sh`, `wget | bash`
 */
export class CommandSanitizerMiddleware implements ToolMiddleware {
  readonly name = "CommandSanitizer";

  /**
   * Patterns that will cause a command to be blocked.
   * Each entry is [regex, human-readable reason].
   */
  private readonly blockedPatterns: [RegExp, string][] = [
    // Destructive
    [/rm\s+(-\w*r\w*f\w*|-\w*f\w*r\w*)\s+\/(?:\s|$)/, "destructive: rm -rf /"],
    [/mkfs\b/, "destructive: filesystem format"],
    [/\bdd\s+if=/, "destructive: raw disk write"],
    [/:\(\)\s*\{\s*:\|:&\s*\}\s*;?\s*:/, "destructive: fork bomb"],
    [/chmod\s+(-\w+\s+)*777\s+\//, "dangerous: recursive chmod 777 on root"],

    // Interactive / hanging
    [/\b(vim|vi|nano|emacs|pico)\b/, "interactive: text editor (hangs the sandbox)"],
    [/\b(less|more)\b/, "interactive: pager (hangs the sandbox)"],
    [/\b(top|htop|glances)\b/, "interactive: process monitor (hangs the sandbox)"],
    [/\bman\s+\w+/, "interactive: man page (hangs the sandbox)"],

    // Network abuse: pipe-to-shell
    [/curl\s+.*\|\s*(sh|bash|zsh)/, "unsafe: pipe remote script to shell"],
    [/wget\s+.*\|\s*(sh|bash|zsh)/, "unsafe: pipe remote script to shell"],
  ];

  before(ctx: ToolCallContext): ToolCallContext | string {
    // Only applies to bash/shell tool calls
    if (ctx.toolName !== "bash") {
      return ctx;
    }

    const command = ctx.args.command;
    if (typeof command !== "string") {
      return ctx;
    }

    for (const [pattern, reason] of this.blockedPatterns) {
      if (pattern.test(command)) {
        return (
          `⚠ Blocked: Command rejected by sanitizer.\n` +
          `Reason: ${reason}\n` +
          `Command: ${command}\n` +
          `Use a safer alternative or refine your approach.`
        );
      }
    }

    return ctx;
  }
}
