import { describe, it, expect, beforeEach } from "vitest";
import {
  CommandRegistry,
  levenshteinDistance,
} from "../../src/commands/commandRegistry.js";
import {
  createDefaultRegistry,
  HelpCommand,
  ModelCommand,
  ClearCommand,
  CompactCommand,
  TokensCommand,
  StatusCommand,
  HistoryCommand,
  UndoCommand,
  ExitCommand,
} from "../../src/commands/builtinCommands.js";
import { CommandContext } from "../../src/commands/commandRegistry.js";
import { HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";

// ─── Test Helpers ───────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    config: {
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      maxTokens: 4096,
      temperature: 0,
      streaming: true,
    } as any,
    configPath: "/tmp/test-config.json",
    harness: {} as any,
    contextState: {
      globalSystemInstructions: "You are a test agent.",
      projectMemory: "Test project.",
      sessionContext: "Test session.",
      conversationHistory: [],
    },
    setContextState: () => {},
    addSystemMessage: () => {},
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    maxTokens: 4096,
    ...overrides,
  };
}

// ─── Levenshtein Distance ───────────────────────────────────────────────────────

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("model", "model")).toBe(0);
  });

  it("returns correct distance for single edit", () => {
    expect(levenshteinDistance("model", "modle")).toBe(2); // transposition = 2 edits
    expect(levenshteinDistance("help", "helo")).toBe(1);
  });

  it("handles empty strings", () => {
    expect(levenshteinDistance("", "abc")).toBe(3);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });
});

// ─── CommandRegistry ────────────────────────────────────────────────────────────

describe("CommandRegistry", () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  it("detects slash commands", () => {
    expect(registry.isCommand("/help")).toBe(true);
    expect(registry.isCommand("/model gpt-4")).toBe(true);
    expect(registry.isCommand("  /tokens")).toBe(true);
    expect(registry.isCommand("Hello world")).toBe(false);
    expect(registry.isCommand("")).toBe(false);
  });

  it("registers and executes a command", async () => {
    registry.register({
      name: "ping",
      description: "Test command",
      execute: async () => "pong",
    });

    const result = await registry.execute("/ping", makeContext());
    expect(result).toBe("pong");
  });

  it("resolves aliases to primary command", async () => {
    registry.register({
      name: "help",
      aliases: ["h", "?"],
      description: "Show help",
      execute: async () => "help text",
    });

    expect(await registry.execute("/h", makeContext())).toBe("help text");
    expect(await registry.execute("/?", makeContext())).toBe("help text");
  });

  it("returns error with suggestions for unknown commands", async () => {
    registry.register({
      name: "model",
      description: "Switch model",
      execute: async () => "ok",
    });

    const result = await registry.execute("/modle", makeContext());
    expect(result).toContain("Unknown command");
    expect(result).toContain("/model");
  });

  it("parses command args correctly", async () => {
    let receivedArgs = "";
    registry.register({
      name: "echo",
      description: "Echo args",
      execute: async (args) => {
        receivedArgs = args;
        return args;
      },
    });

    await registry.execute("/echo hello world", makeContext());
    expect(receivedArgs).toBe("hello world");
  });

  it("handles commands with no args", async () => {
    let receivedArgs = "";
    registry.register({
      name: "noargs",
      description: "No args",
      execute: async (args) => {
        receivedArgs = args;
        return "ok";
      },
    });

    await registry.execute("/noargs", makeContext());
    expect(receivedArgs).toBe("");
  });

  it("getHelp() returns formatted text", () => {
    registry.register({
      name: "foo",
      aliases: ["f"],
      description: "Do foo",
      execute: async () => {},
    });
    registry.register({
      name: "bar",
      description: "Do bar",
      execute: async () => {},
    });

    const help = registry.getHelp();
    expect(help).toContain("/foo");
    expect(help).toContain("/f");
    expect(help).toContain("Do foo");
    expect(help).toContain("/bar");
  });

  it("is case-insensitive for command names", async () => {
    registry.register({
      name: "help",
      description: "Help",
      execute: async () => "ok",
    });

    expect(await registry.execute("/HELP", makeContext())).toBe("ok");
    expect(await registry.execute("/Help", makeContext())).toBe("ok");
  });
});

// ─── Built-in Commands ──────────────────────────────────────────────────────────

describe("Built-in Commands", () => {
  describe("/help", () => {
    it("returns help text with all commands listed", async () => {
      const result = await HelpCommand.execute("", makeContext());
      expect(result).toContain("/help");
      expect(result).toContain("/model");
      expect(result).toContain("/clear");
      expect(result).toContain("/tokens");
      expect(result).toContain("/exit");
    });
  });

  describe("/model", () => {
    it("shows current model when no args", async () => {
      const result = await ModelCommand.execute("", makeContext());
      expect(result).toContain("claude-sonnet-4-20250514");
      expect(result).toContain("anthropic");
    });

    it("advises restart when model name provided", async () => {
      const result = await ModelCommand.execute("gpt-4o", makeContext());
      expect(result).toContain("gpt-4o");
      expect(result).toContain("restart");
    });
  });

  describe("/clear", () => {
    it("clears conversation history", async () => {
      let capturedState: any = null;
      const ctx = makeContext({
        contextState: {
          globalSystemInstructions: "test",
          projectMemory: "test",
          sessionContext: "test",
          conversationHistory: [
            new HumanMessage("hello"),
            new AIMessage("hi"),
          ],
        },
        setContextState: (s) => { capturedState = s; },
      });

      const result = await ClearCommand.execute("", ctx);
      expect(result).toContain("2 messages");
      expect(capturedState.conversationHistory).toHaveLength(0);
    });
  });

  describe("/tokens", () => {
    it("shows token usage info", async () => {
      const result = await TokensCommand.execute("", makeContext());
      expect(result).toContain("Token Usage");
      expect(result).toContain("System prompt");
      expect(result).toContain("Conversation");
    });
  });

  describe("/status", () => {
    it("shows session status", async () => {
      const result = await StatusCommand.execute("", makeContext());
      expect(result).toContain("anthropic");
      expect(result).toContain("claude-sonnet-4-20250514");
      expect(result).toContain("Session Status");
    });
  });

  describe("/history", () => {
    it("returns empty message for no history", async () => {
      const result = await HistoryCommand.execute("", makeContext());
      expect(result).toContain("No conversation history");
    });

    it("shows messages when history exists", async () => {
      const ctx = makeContext({
        contextState: {
          globalSystemInstructions: "",
          projectMemory: "",
          sessionContext: "",
          conversationHistory: [
            new HumanMessage("Hello"),
            new AIMessage("Hi there!"),
          ],
        },
      });

      const result = await HistoryCommand.execute("", ctx);
      expect(result).toContain("2 messages");
      expect(result).toContain("Hello");
      expect(result).toContain("Hi there!");
    });
  });

  describe("/undo", () => {
    it("removes last user+agent exchange", async () => {
      let capturedState: any = null;
      const ctx = makeContext({
        contextState: {
          globalSystemInstructions: "",
          projectMemory: "",
          sessionContext: "",
          conversationHistory: [
            new HumanMessage("First"),
            new AIMessage("Response 1"),
            new HumanMessage("Second"),
            new AIMessage("Response 2"),
          ],
        },
        setContextState: (s) => { capturedState = s; },
      });

      const result = await UndoCommand.execute("", ctx);
      expect(result).toContain("2 message(s)");
      expect(capturedState.conversationHistory).toHaveLength(2);
    });

    it("returns message for empty history", async () => {
      const result = await UndoCommand.execute("", makeContext());
      expect(result).toContain("Nothing to undo");
    });
  });

  describe("/exit", () => {
    it("returns __EXIT__ signal", async () => {
      const result = await ExitCommand.execute("", makeContext());
      expect(result).toBe("__EXIT__");
    });
  });

  describe("/compact", () => {
    it("rejects when history is too short", async () => {
      const result = await CompactCommand.execute("", makeContext({
        contextState: {
          globalSystemInstructions: "",
          projectMemory: "",
          sessionContext: "",
          conversationHistory: [new HumanMessage("hi")],
        },
      }));
      expect(result).toContain("Not enough history");
    });
  });
});

// ─── Default Registry ───────────────────────────────────────────────────────────

describe("createDefaultRegistry", () => {
  it("creates a registry with all built-in commands", () => {
    const registry = createDefaultRegistry();
    const all = registry.getAll();

    const names = all.map((c) => c.name);
    expect(names).toContain("help");
    expect(names).toContain("model");
    expect(names).toContain("clear");
    expect(names).toContain("compact");
    expect(names).toContain("tokens");
    expect(names).toContain("status");
    expect(names).toContain("history");
    expect(names).toContain("undo");
    expect(names).toContain("exit");
  });

  it("resolves aliases correctly", async () => {
    const registry = createDefaultRegistry();

    // /h → /help
    const result = await registry.execute("/h", makeContext());
    expect(result).toContain("/help");

    // /q → /exit
    const exitResult = await registry.execute("/q", makeContext());
    expect(exitResult).toBe("__EXIT__");
  });
});
