import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubAgentManager } from "../../src/core/subAgent.js";
import { AgentRegistry } from "../../src/agents/agentRegistry.js";
import { createSpawnAgentTools } from "../../src/tools/spawnAgent.js";
import { AgentSpec } from "../../src/agents/agentSpec.js";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { DynamicToolInterface } from "../../src/tools/index.js";

// ─── Mocks ──────────────────────────────────────────────────────────────────────

const mockRegistry = new AgentRegistry();
const mockSpec: AgentSpec = {
  name: "test_agent",
  description: "A test agent",
  systemPrompt: "You are a test agent.",
  tools: ["test_tool"],
  maxTurns: 3,
};
mockRegistry.register(mockSpec);

const mockTool: DynamicToolInterface = {
  name: "test_tool",
  description: "A test tool",
  schema: { type: "object", properties: {} },
  execute: async () => ({ content: "Tool success" }),
};

const mockTools = [mockTool];

function createMockLLM(responses: any[]) {
  let callCount = 0;
  return {
    bindTools: vi.fn().mockReturnThis(),
    invoke: vi.fn().mockImplementation(() => {
      const resp = responses[callCount++] || responses[responses.length - 1];
      return Promise.resolve(resp);
    }),
  };
}

// ─── SubAgentManager Tests ──────────────────────────────────────────────────────

describe("SubAgentManager", () => {
  it("rejects unknown agents", async () => {
    const llm = createMockLLM([new AIMessage("Hello")]);
    const manager = new SubAgentManager(mockRegistry, mockTools, llm as any);

    const result = await manager.spawn("unknown_agent", "Do something");
    expect(result.outcome).toBe("failure");
    expect(result.result).toContain("Unknown agent");
  });

  it("safely filters out spawn_agent and check_agent from available tools", async () => {
    // Tests depth-1 safety limit
    const unsafeTools = [
      mockTool,
      { name: "spawn_agent", description: "", schema: {}, execute: async () => ({ content: "" }) },
      { name: "check_agent", description: "", schema: {}, execute: async () => ({ content: "" }) }
    ];
    
    // We must cast these unsafeTools since they bypass DynamicToolInterface loosely here
    const manager = new SubAgentManager(mockRegistry, unsafeTools as any, createMockLLM([]) as any);
    
    // Access private allTools to verify
    const allTools = (manager as any).allTools;
    expect(allTools.length).toBe(1);
    expect(allTools[0].name).toBe("test_tool");
  });

  it("handles a successful sync execution without tool calls", async () => {
    const llm = createMockLLM([new AIMessage("I have completed the task.")]);
    const manager = new SubAgentManager(mockRegistry, mockTools, llm as any);

    const result = await manager.spawn("test_agent", "Do something");
    
    expect(result.outcome).toBe("success");
    expect(result.result).toBe("I have completed the task.");
    expect(result.turnsUsed).toBe(1);
    expect(result.toolCallCount).toBe(0);
  });

  it("handles tool calls recursively until finished", async () => {
    const llm = createMockLLM([
      new AIMessage({
        content: "I need to use a tool.",
        tool_calls: [{ id: "call_1", name: "test_tool", args: {} }] 
      }),
      new AIMessage("I have finished the task with the tool.")
    ]);
    const manager = new SubAgentManager(mockRegistry, mockTools, llm as any);

    const result = await manager.spawn("test_agent", "Do something");
    
    expect(result.outcome).toBe("success");
    expect(result.result).toBe("I have finished the task with the tool.");
    expect(result.turnsUsed).toBe(2);
    expect(result.toolCallCount).toBe(1);
  });

  it("returns partial outcome if maxTurns is exceeded", async () => {
    // LLM keeps returning tool calls, but agent has maxTurns = 3
    const llm = createMockLLM([
      new AIMessage({ content: "Loop 1", tool_calls: [{ id: "c1", name: "test_tool", args: {} }] }),
      new AIMessage({ content: "Loop 2", tool_calls: [{ id: "c2", name: "test_tool", args: {} }] }),
      new AIMessage({ content: "Loop 3", tool_calls: [{ id: "c3", name: "test_tool", args: {} }] }),
      new AIMessage("This should never be reached")
    ]);
    const manager = new SubAgentManager(mockRegistry, mockTools, llm as any);

    const result = await manager.spawn("test_agent", "Loop forever");
    
    expect(result.outcome).toBe("partial"); // Caught by loop protection
    expect(result.turnsUsed).toBe(3);
  });

  it("tracks modified files when write_file is called", async () => {
    const writeTool: DynamicToolInterface = {
      name: "write_file",
      description: "Writes a file",
      schema: { type: "object", properties: { path: { type: "string" } } },
      execute: async () => ({ content: "Written" }),
    };
    
    const reg = new AgentRegistry();
    reg.register({ name: "writer", description: "", systemPrompt: "", tools: ["write_file"] });

    const llm = createMockLLM([
      new AIMessage({
        content: "",
        tool_calls: [{ id: "c1", name: "write_file", args: { path: "/test/file.ts" } }]
      }),
      new AIMessage("Done writing.")
    ]);
    
    const manager = new SubAgentManager(reg, [writeTool], llm as any);
    const result = await manager.spawn("writer", "Write it");

    expect(result.filesModified).toContain("/test/file.ts");
  });

  describe("Async execution", () => {
    it("spawns a non-blocking async task and checks its result", async () => {
      // Delay the LLM so it's realistically async
      const llm = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi.fn().mockImplementation(async () => {
          await new Promise((r) => setTimeout(r, 50));
          return new AIMessage("Async done");
        }),
      };
      
      const manager = new SubAgentManager(mockRegistry, mockTools, llm as any);

      // Spawn async
      const taskId = await manager.spawnAsync("test_agent", "Do async task");
      expect(taskId).toMatch(/^task_\d+_\d+$/);

      // Check immediately — should be running
      const initialCheck = await manager.getResult(taskId);
      expect(typeof initialCheck).toBe("string");
      expect(initialCheck).toContain("still running");

      // Wait for it to finish
      await new Promise((r) => setTimeout(r, 100));

      // Check again — should be the result object
      const finalCheck = await manager.getResult(taskId);
      expect(typeof finalCheck).toBe("object");
      expect((finalCheck as any).outcome).toBe("success");
      expect((finalCheck as any).result).toBe("Async done");
    });

    it("prevents spawning beyond MAX_CONCURRENT_ASYNC", async () => {
      // LLM that hangs forever so tasks stay active
      const llm = {
        bindTools: vi.fn().mockReturnThis(),
        invoke: vi.fn().mockImplementation(() => new Promise(() => {})), // never resolves
      };
      
      const manager = new SubAgentManager(mockRegistry, mockTools, llm as any);

      // Spawn 3 (max)
      await manager.spawnAsync("test_agent", "Task 1");
      await manager.spawnAsync("test_agent", "Task 2");
      await manager.spawnAsync("test_agent", "Task 3");

      // 4th should throw an error
      await expect(manager.spawnAsync("test_agent", "Task 4"))
        .rejects.toThrow(/Maximum concurrent async agents reached/);
    });
  });
});

// ─── spawn_agent & check_agent tools ────────────────────────────────────────────

describe("spawn_agent and check_agent tools", () => {
  it("formats the spawn result correctly in sync mode", async () => {
    const llm = createMockLLM([new AIMessage("Test complete")]);
    const manager = new SubAgentManager(mockRegistry, mockTools, llm as any);
    const tools = createSpawnAgentTools(manager, mockRegistry);
    const spawnAgentTool = tools.find(t => t.name === "spawn_agent")!;

    const result = await spawnAgentTool.execute({ agent: "test_agent", task: "Run test" });
    
    expect(result.isError).toBe(false);
    expect(typeof result.content).toBe("string");
    expect(result.content).toContain("Sub-Agent Result: test_agent");
    expect(result.content).toContain("Outcome: success");
    expect(result.content).toContain("Test complete");
    expect(result.metadata).toBeDefined();
    expect((result.metadata as any).agentName).toBe("test_agent");
  });

  it("handles async mode and pairs with check_agent", async () => {
    const llm = {
      bindTools: vi.fn().mockReturnThis(),
      invoke: vi.fn().mockResolvedValue(new AIMessage("Delayed finish")),
    };
    const manager = new SubAgentManager(mockRegistry, mockTools, llm as any);
    const tools = createSpawnAgentTools(manager, mockRegistry);
    const spawnTool = tools.find(t => t.name === "spawn_agent")!;
    const checkTool = tools.find(t => t.name === "check_agent")!;

    // Spawn
    const spawnRes = await spawnTool.execute({ agent: "test_agent", task: "Test", mode: "async" });
    expect(spawnRes.content).toContain("task_");
    const taskId = (spawnRes.metadata as any).taskId;

    // Wait a tick for the microtask to finish (the mock resolves immediately)
    await new Promise(r => setTimeout(r, 10));

    // Check
    const checkRes = await checkTool.execute({ taskId });
    expect(checkRes.isError).toBe(false);
    expect(checkRes.content).toContain("Outcome: success");
    expect(checkRes.content).toContain("Delayed finish");
  });
});
