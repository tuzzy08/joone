import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { HITLBridge } from "../../src/hitl/bridge.js";
import { JooneRuntimeService } from "../../src/runtime/service.js";
import type {
  RuntimeHarness,
  RuntimeHarnessFactory,
  RuntimeQuestionEvent,
  RuntimeSessionStartedEvent,
  RuntimeSessionStatusEvent,
  RuntimeEvent,
} from "../../src/runtime/types.js";

const tempRoot = path.join(
  os.tmpdir(),
  `joone-runtime-test-${process.pid}-${Date.now()}`,
);

describe("JooneRuntimeService", () => {
  const configPath = path.join(tempRoot, "config.json");

  beforeEach(() => {
    fs.mkdirSync(tempRoot, { recursive: true });
    HITLBridge.resetInstance();
  });

  afterEach(() => {
    HITLBridge.resetInstance();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("loads and saves config through the shared runtime API", async () => {
    const service = new JooneRuntimeService({
      configPath,
      cwd: tempRoot,
      harnessFactory: makeHarnessFactory(),
    });

    const initial = await service.loadConfig();
    expect(initial.provider).toBe("anthropic");

    await service.saveConfig({
      ...initial,
      provider: "google",
      model: "gemini-2.5-pro",
    });

    const reloaded = await service.loadConfig();
    expect(reloaded.provider).toBe("google");
    expect(reloaded.model).toBe("gemini-2.5-pro");
  });

  it("starts a session and emits serializable lifecycle events", async () => {
    const service = new JooneRuntimeService({
      configPath,
      cwd: tempRoot,
      harnessFactory: makeHarnessFactory(),
    });

    const session = await service.startSession();
    const events: RuntimeEvent[] = [];
    const unsubscribe = service.subscribe(session.sessionId, (event) => {
      events.push(event);
    });

    const reply = await service.submitMessage(session.sessionId, "hello");

    unsubscribe();

    expect(reply.messages.at(-1)?.role).toBe("agent");
    expect(events.some((event) => event.type === "agent:token")).toBe(true);
    expect(events.some((event) => event.type === "session:completed")).toBe(
      true,
    );

    const started = events.find(
      (event): event is RuntimeSessionStartedEvent =>
        event.type === "session:started",
    );
    expect(started?.state.projectMemory).toContain(tempRoot);

    const status = events.find(
      (event): event is RuntimeSessionStatusEvent =>
        event.type === "session:status",
    );
    expect(status?.status).toBe("idle");
  });

  it("resumes a persisted session via the shared runtime", async () => {
    const service = new JooneRuntimeService({
      configPath,
      cwd: tempRoot,
      harnessFactory: makeHarnessFactory(),
    });

    const started = await service.startSession();
    await service.submitMessage(started.sessionId, "persist me");
    await service.closeSession(started.sessionId);

    const resumed = await service.resumeSession(started.sessionId);

    expect(resumed.state.conversationHistory.length).toBeGreaterThan(0);
    expect(
      resumed.state.conversationHistory.some((message) => message instanceof AIMessage),
    ).toBe(true);
    expect(resumed.state.conversationHistory.at(-1)).toBeInstanceOf(HumanMessage);
  });

  it("lists persisted sessions as normalized snapshots for desktop clients", async () => {
    const service = new JooneRuntimeService({
      configPath,
      cwd: tempRoot,
      harnessFactory: makeHarnessFactory(),
    });

    const started = await service.startSession();
    await service.submitMessage(started.sessionId, "persisted desktop preview");
    await service.closeSession(started.sessionId);

    const sessions = await service.listSessions();

    const listed = sessions.find((session) => session.sessionId === started.sessionId);

    expect(listed?.sessionId).toBe(started.sessionId);
    expect(Array.isArray(listed?.messages)).toBe(true);
    expect(listed?.messages.length).toBeGreaterThan(0);
    expect(listed?.metrics.totalTokens).toBeTypeOf("number");
  });

  it("cleans up runtime resources when a session closes", async () => {
    let destroyed = 0;
    const service = new JooneRuntimeService({
      configPath,
      cwd: tempRoot,
      harnessFactory: makeHarnessFactory(() => {
        destroyed += 1;
      }),
    });

    const session = await service.startSession();
    await service.closeSession(session.sessionId);

    expect(destroyed).toBe(1);
  });

  it("emits queueable HITL questions with ids and resolves multiple prompts in order", async () => {
    const service = new JooneRuntimeService({
      configPath,
      cwd: tempRoot,
      harnessFactory: makeHarnessFactoryWithQuestions(),
    });

    const session = await service.startSession();
    const events: RuntimeEvent[] = [];
    service.subscribe(session.sessionId, (event) => {
      events.push(event);
    });

    const replyPromise = service.submitMessage(session.sessionId, "walk me through this");

    const firstQuestion = await waitForQuestion(events, 0);
    expect(firstQuestion.id).toBeTruthy();
    expect(firstQuestion.question).toContain("First");

    await service.answerHitl(firstQuestion.id, "alpha");

    const secondQuestion = await waitForQuestion(events, 1);
    expect(secondQuestion.id).toBeTruthy();
    expect(secondQuestion.id).not.toBe(firstQuestion.id);
    expect(secondQuestion.question).toContain("Second");

    await service.answerHitl(secondQuestion.id, "beta");

    const reply = await replyPromise;

    expect(reply.messages.at(-1)?.content).toContain("alpha");
    expect(reply.messages.at(-1)?.content).toContain("beta");
  });
});

function makeHarnessFactory(onDestroy?: () => void): RuntimeHarnessFactory {
  return async () => {
    const harness: RuntimeHarness = {
      sessionId: `runtime-session-${Date.now()}`,
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      tracerSummary: {
        totalTokens: 0,
        cacheHitRate: 0,
        toolCallCount: 0,
        turnCount: 0,
        totalCost: 0,
      },
      async *run(state) {
        yield {
          event: "on_chat_model_stream",
          data: { chunk: { content: "Hi" } },
        };
        yield {
          event: "on_chat_model_end",
          data: { output: { content: "Hi there" } },
        };
        yield {
          event: "on_chain_end",
          name: "LangGraph",
          data: {
            output: {
              messages: [
                ...state.conversationHistory,
                new AIMessage("Hi there"),
              ],
            },
          },
        };
      },
      async save() {
        return;
      },
      async destroy() {
        onDestroy?.();
      },
    };

    return harness;
  };
}

function makeHarnessFactoryWithQuestions(): RuntimeHarnessFactory {
  return async () => {
    const harness: RuntimeHarness = {
      sessionId: `runtime-session-${Date.now()}`,
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      tracerSummary: {
        totalTokens: 0,
        cacheHitRate: 0,
        toolCallCount: 0,
        turnCount: 0,
        totalCost: 0,
      },
      async *run(state) {
        const bridge = HITLBridge.getInstance();
        const first = await bridge.askUser("First clarification?", ["alpha", "beta"]);
        const second = await bridge.askUser("Second clarification?");
        yield {
          event: "on_chain_end",
          name: "LangGraph",
          data: {
            output: {
              messages: [
                ...state.conversationHistory,
                new AIMessage(`Answers: ${first} / ${second}`),
              ],
            },
          },
        };
      },
      async save() {
        return;
      },
      async destroy() {
        return;
      },
    };

    return harness;
  };
}

async function waitForQuestion(
  events: RuntimeEvent[],
  index: number,
): Promise<RuntimeQuestionEvent> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const questions = events.filter(
      (event): event is RuntimeQuestionEvent => event.type === "hitl:question",
    );
    if (questions[index]) {
      return questions[index];
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Timed out waiting for question ${index + 1}`);
}
