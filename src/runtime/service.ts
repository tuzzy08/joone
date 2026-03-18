import * as path from "node:path";
import * as os from "node:os";
import { HumanMessage } from "@langchain/core/messages";
import { loadConfig, saveConfig, type JooneConfig } from "../cli/config.js";
import type { ContextState } from "../core/promptBuilder.js";
import { SessionResumer } from "../core/sessionResumer.js";
import { SessionStore, type SessionHeader } from "../core/sessionStore.js";
import {
  HITLBridge,
  type HITLPermissionRequest,
  type HITLQuestion,
} from "../hitl/bridge.js";
import type {
  RuntimeEvent,
  RuntimeHarness,
  RuntimeHarnessFactory,
  RuntimeMessage,
  RuntimePreparedSession,
  RuntimeSessionSnapshot,
  RuntimeHarnessFactoryOptions,
  RuntimeMetrics,
  SerializedRuntimeState,
} from "./types.js";

interface RuntimeSessionRecord {
  sessionId: string;
  config: JooneConfig;
  state: ContextState;
  status: "idle" | "processing" | "closed";
  harness?: RuntimeHarness;
  harnessPromise?: Promise<RuntimeHarness>;
}

interface RuntimeServiceOptions {
  configPath: string;
  cwd?: string;
  harnessFactory?: RuntimeHarnessFactory;
}

export class JooneRuntimeService {
  private readonly configPath: string;
  private readonly cwd: string;
  private readonly sessionStore = new SessionStore();
  private readonly sessions = new Map<string, RuntimeSessionRecord>();
  private readonly listeners = new Map<string, Set<(event: RuntimeEvent) => void>>();
  private readonly harnessFactory: RuntimeHarnessFactory;

  constructor(options: RuntimeServiceOptions) {
    this.configPath = options.configPath;
    this.cwd = options.cwd ?? process.cwd();
    this.harnessFactory =
      options.harnessFactory ?? createDefaultRuntimeHarnessFactory();

    const bridge = HITLBridge.getInstance();
    bridge.on("question", (question: HITLQuestion) => {
      for (const sessionId of this.sessions.keys()) {
        this.emit(sessionId, {
          type: "hitl:question",
          sessionId,
          question: question.question,
          options: question.options,
        });
      }
    });
    bridge.on("permission", (permission: HITLPermissionRequest) => {
      for (const sessionId of this.sessions.keys()) {
        this.emit(sessionId, {
          type: "hitl:permission",
          sessionId,
          toolName: permission.toolName,
          args: permission.args,
        });
      }
    });
  }

  async loadConfig(): Promise<JooneConfig> {
    return loadConfig(this.configPath);
  }

  async saveConfig(config: JooneConfig): Promise<void> {
    saveConfig(this.configPath, config);
  }

  async listSessions(): Promise<RuntimeSessionSnapshot[]> {
    const headers = await this.sessionStore.listSessions();
    return Promise.all(headers.map((header) => this.buildPersistedSnapshot(header)));
  }

  async prepareSession(options?: {
    sessionId?: string;
    config?: JooneConfig;
  }): Promise<RuntimePreparedSession> {
    const config = options?.config ?? (await this.loadConfig());
    const sessionId = options?.sessionId ?? `session-${Date.now()}`;
    let existing = this.sessions.get(sessionId);

    if (!existing) {
      const state = options?.sessionId
        ? await this.loadResumedState(options.sessionId)
        : this.createInitialState();

      existing = {
        sessionId,
        config,
        state,
        status: "idle",
      };
      this.sessions.set(sessionId, existing);
    } else {
      existing.config = config;
    }

    return {
      sessionId,
      provider: existing.config.provider,
      model: existing.config.model,
      initialState: existing.state,
      createHarness: async () => this.ensureHarness(existing!),
    };
  }

  async startSession(options?: {
    config?: JooneConfig;
    sessionId?: string;
  }): Promise<RuntimeSessionSnapshot> {
    const prepared = await this.prepareSession(options);
    const record = this.getRecord(prepared.sessionId);
    await this.ensureHarness(record);
    return this.buildSnapshot(record);
  }

  async resumeSession(sessionId: string): Promise<RuntimeSessionSnapshot> {
    return this.startSession({ sessionId });
  }

  subscribe(sessionId: string, listener: (event: RuntimeEvent) => void): () => void {
    let listeners = this.listeners.get(sessionId);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(sessionId, listeners);
    }

    listeners.add(listener);

    const record = this.sessions.get(sessionId);
    if (record) {
      listener(this.buildStartedEvent(record));
      listener({
        type: "session:status",
        sessionId,
        status: record.status,
      });
    }

    return () => {
      listeners?.delete(listener);
      if (listeners && listeners.size === 0) {
        this.listeners.delete(sessionId);
      }
    };
  }

  syncSessionState(sessionId: string, state: ContextState): void {
    const record = this.getRecord(sessionId);
    record.state = state;
  }

  async submitMessage(
    sessionId: string,
    text: string,
  ): Promise<RuntimeSessionSnapshot> {
    const record = this.getRecord(sessionId);
    const harness = await this.ensureHarness(record);

    record.status = "processing";
    this.emit(sessionId, {
      type: "session:status",
      sessionId,
      status: "processing",
    });

    const updatedState: ContextState = {
      ...record.state,
      conversationHistory: [
        ...record.state.conversationHistory,
        new HumanMessage(text),
      ],
    };
    record.state = updatedState;

    let nextHistory = updatedState.conversationHistory;

    try {
      for await (const event of harness.run(updatedState)) {
        if (event.event === "on_chat_model_stream" && event.data?.chunk?.content) {
          this.emit(sessionId, {
            type: "agent:token",
            sessionId,
            token: event.data.chunk.content,
          });
        } else if (event.event === "on_tool_start") {
          this.emit(sessionId, {
            type: "tool:start",
            sessionId,
            toolName: event.name,
            args: event.data?.input ?? {},
          });
        } else if (event.event === "on_tool_end") {
          this.emit(sessionId, {
            type: "tool:end",
            sessionId,
            toolName: event.name,
            result: stringifyToolResult(event.data?.output),
          });
        } else if (
          event.event === "on_chain_end" &&
          event.name === "LangGraph" &&
          event.data?.output?.messages
        ) {
          nextHistory = event.data.output.messages;
        }
      }

      record.state = {
        ...updatedState,
        conversationHistory: nextHistory,
      };
      await this.sessionStore.saveSession(
        sessionId,
        record.state,
        record.config.provider,
        record.config.model,
      );

      this.emit(sessionId, {
        type: "session:state",
        sessionId,
        state: serializeState(record.state),
        metrics: harness.tracerSummary,
      });
      this.emit(sessionId, { type: "session:completed", sessionId });
      record.status = "idle";
      this.emit(sessionId, {
        type: "session:status",
        sessionId,
        status: "idle",
      });
    } catch (error: any) {
      record.status = "idle";
      this.emit(sessionId, {
        type: "session:error",
        sessionId,
        message: error.message,
      });
      this.emit(sessionId, {
        type: "session:status",
        sessionId,
        status: "idle",
      });
      throw error;
    }

    return this.buildSnapshot(record);
  }

  async cancelSession(sessionId: string): Promise<void> {
    const record = this.getRecord(sessionId);
    record.status = "idle";
    this.emit(sessionId, {
      type: "session:status",
      sessionId,
      status: "idle",
    });
  }

  async closeSession(sessionId: string): Promise<void> {
    const record = this.getRecord(sessionId);
    await this.sessionStore.saveSession(
      sessionId,
      record.state,
      record.config.provider,
      record.config.model,
    );

    if (record.harness) {
      await record.harness.save();
      await record.harness.destroy();
    }

    record.status = "closed";
    this.emit(sessionId, {
      type: "session:status",
      sessionId,
      status: "closed",
    });
    this.sessions.delete(sessionId);
  }

  private emit(sessionId: string, event: RuntimeEvent): void {
    const listeners = this.listeners.get(sessionId);
    if (!listeners) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }

  private async loadResumedState(sessionId: string): Promise<ContextState> {
    const payload = await this.sessionStore.loadSession(sessionId);
    const resumer = new SessionResumer(this.cwd);
    return resumer.prepareForResume(payload);
  }

  private createInitialState(): ContextState {
    return {
      globalSystemInstructions: `You are Joone, a highly capable autonomous coding agent. 
You run in a hybrid environment based on user configuration. You execute commands using 'bash' and can safely evaluate tests and install dependencies.
Always use the tools provided to you. Never read or write outside the current project directory unless explicitly requested.

IMPORTANT CAPABILITIES:
- You have access to an 'ask_user_question' tool. Use it to ask the user for clarification, preferences, or approval before making significant changes.
- Some tool calls may require user approval before execution, depending on the user's permission settings. If a tool call is denied, try an alternative approach or ask the user for guidance.
- You have access to Skills - reusable instruction sets for specialized tasks. Use 'search_skills' to discover them and 'load_skill' to activate their instructions.`,
      projectMemory: `Initial working directory: ${this.cwd}`,
      sessionContext: `Environment: ${process.platform}\nCWD: ${this.cwd}`,
      conversationHistory: [],
    };
  }

  private async ensureHarness(
    record: RuntimeSessionRecord,
  ): Promise<RuntimeHarness> {
    if (record.harness) {
      return record.harness;
    }

    if (!record.harnessPromise) {
      record.harnessPromise = this.harnessFactory({
        config: record.config,
        cwd: this.cwd,
        sessionId: record.sessionId,
      });
    }

    record.harness = await record.harnessPromise;
    return record.harness;
  }

  private buildSnapshot(record: RuntimeSessionRecord): RuntimeSessionSnapshot {
    return {
      sessionId: record.sessionId,
      provider: record.config.provider,
      model: record.config.model,
      state: record.state,
      messages: serializeMessages(record.state.conversationHistory),
      description: describeConversation(record.state),
      metrics:
        record.harness?.tracerSummary ?? {
          totalTokens: 0,
          cacheHitRate: 0,
          toolCallCount: 0,
          turnCount: 0,
          totalCost: 0,
        },
    };
  }

  private async buildPersistedSnapshot(
    header: SessionHeader,
  ): Promise<RuntimeSessionSnapshot> {
    const payload = await this.sessionStore.loadSession(header.sessionId);
    return {
      sessionId: header.sessionId,
      provider: header.provider,
      model: header.model,
      state: payload.state,
      messages: serializeMessages(payload.state.conversationHistory),
      lastSavedAt: header.lastSavedAt,
      description: header.description,
      metrics: emptyRuntimeMetrics(),
    };
  }

  private buildStartedEvent(record: RuntimeSessionRecord): RuntimeEvent {
    return {
      type: "session:started",
      sessionId: record.sessionId,
      provider: record.config.provider,
      model: record.config.model,
      state: serializeState(record.state),
    };
  }

  private getRecord(sessionId: string): RuntimeSessionRecord {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new Error(`Unknown session: ${sessionId}`);
    }
    return record;
  }
}

function emptyRuntimeMetrics(): RuntimeMetrics {
  return {
    totalTokens: 0,
    cacheHitRate: 0,
    toolCallCount: 0,
    turnCount: 0,
    totalCost: 0,
  };
}

function describeConversation(state: ContextState): string {
  const firstUserMessage = serializeMessages(state.conversationHistory).find(
    (message) => message.role === "user",
  );
  return firstUserMessage?.content ?? "Empty session";
}

function serializeMessages(messages: ContextState["conversationHistory"]): RuntimeMessage[] {
  return messages.map((message) => {
    const type = message._getType();
    if (type === "human") {
      return { role: "user" as const, content: String(message.content) };
    }
    if (type === "ai") {
      return { role: "agent" as const, content: String(message.content) };
    }
    return { role: "system" as const, content: String(message.content) };
  });
}

function serializeState(state: ContextState): SerializedRuntimeState {
  return {
    globalSystemInstructions: state.globalSystemInstructions,
    projectMemory: state.projectMemory,
    sessionContext: state.sessionContext,
    conversationHistory: serializeMessages(state.conversationHistory),
  };
}

function stringifyToolResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (result == null) {
    return "";
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

function createDefaultRuntimeHarnessFactory(): RuntimeHarnessFactory {
  return async ({ config, cwd, sessionId }: RuntimeHarnessFactoryOptions) => {
    const previousCwd = process.cwd();
    if (previousCwd !== cwd) {
      process.chdir(cwd);
    }

    const { createModel } = await import("../cli/modelFactory.js");
    const model = await createModel(config);
    const { SessionTracer } = await import("../tracing/sessionTracer.js");
    const tracer = new SessionTracer();
    let sandboxManager: any;

    const { bindSandbox, CORE_TOOLS } = await import("../tools/index.js");
    if (config.executionMode !== "host") {
      const { SandboxManager } = await import("../sandbox/manager.js");
      sandboxManager = new SandboxManager({
        template: config.sandboxTemplate,
        apiKey: config.e2bApiKey,
        openSandboxApiKey: config.openSandboxApiKey,
        openSandboxDomain: config.openSandboxDomain,
      });
      await sandboxManager.create();

      const { FileSync } = await import("../sandbox/sync.js");
      const fileSync = new FileSync(cwd);
      bindSandbox(sandboxManager, fileSync);
    }

    const { askUserQuestionTool } = await import("../tools/askUser.js");
    const tools = [...CORE_TOOLS, askUserQuestionTool] as import("@langchain/core/tools").StructuredTool[];
    const { ExecutionHarness } = await import("../core/agentLoop.js");
    const harness = new ExecutionHarness(
      model,
      tools,
      tracer,
      config.provider,
      config.model,
      sessionId,
      config.maxTokens,
      config.permissionMode,
      config.executionMode,
    );

    return {
      sessionId,
      provider: config.provider,
      model: config.model,
      get tracerSummary(): RuntimeMetrics {
        return harness.tracer.getSummary();
      },
      run(state, resumeCommand) {
        return harness.run(state, resumeCommand as any);
      },
      async save() {
        tracer.save();
      },
      async destroy() {
        if (sandboxManager) {
          await sandboxManager.destroy();
        }
        if (process.cwd() !== previousCwd) {
          process.chdir(previousCwd);
        }
      },
    };
  };
}
