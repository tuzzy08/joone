import { describe, expect, it } from "vitest";
import { SimpleChatModel } from "@langchain/core/language_models/chat_models";
import { ExecutionHarness } from "../../src/core/agentLoop.js";
import type { ContextState } from "../../src/core/promptBuilder.js";

class FakeChatModel extends SimpleChatModel {
  constructor() {
    super({});
  }

  _llmType() {
    return "fake-chat";
  }

  bindTools() {
    return this;
  }

  async _call() {
    return "First turn completed.";
  }
}

describe("ExecutionHarness", () => {
  it("does not crash on the first user turn when injecting system context", async () => {
    const harness = new ExecutionHarness(new FakeChatModel(), []);
    const state: ContextState = {
      globalSystemInstructions: "You are Joone.",
      projectMemory: "Workspace memory",
      sessionContext: "Session context",
      conversationHistory: [],
    };

    const collect = async () => {
      const events = [];
      for await (const event of harness.run(state)) {
        events.push(event);
      }
      return events;
    };

    await expect(collect()).resolves.toBeDefined();
  });
});
