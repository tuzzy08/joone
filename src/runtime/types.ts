import type { JooneConfig } from "../cli/config.js";
import type { ContextState } from "../core/promptBuilder.js";

export interface RuntimeMessage {
  role: "user" | "agent" | "system";
  content: string;
}

export interface RuntimeMetrics {
  totalTokens: number;
  cacheHitRate: number;
  toolCallCount: number;
  turnCount: number;
  totalCost: number;
}

export interface SerializedRuntimeState {
  globalSystemInstructions: string;
  projectMemory: string;
  sessionContext: string;
  conversationHistory: RuntimeMessage[];
}

export interface RuntimeSessionSnapshot {
  sessionId: string;
  provider: string;
  model: string;
  state: ContextState;
  messages: RuntimeMessage[];
  metrics: RuntimeMetrics;
  lastSavedAt?: number;
  description?: string;
}

export interface RuntimePreparedSession {
  sessionId: string;
  provider: string;
  model: string;
  initialState: ContextState;
  createHarness: () => Promise<RuntimeHarness>;
}

export interface RuntimeSessionStartedEvent {
  type: "session:started";
  sessionId: string;
  provider: string;
  model: string;
  state: SerializedRuntimeState;
}

export interface RuntimeSessionStateEvent {
  type: "session:state";
  sessionId: string;
  state: SerializedRuntimeState;
  metrics: RuntimeMetrics;
}

export interface RuntimeAgentTokenEvent {
  type: "agent:token";
  sessionId: string;
  token: string;
}

export interface RuntimeToolStartEvent {
  type: "tool:start";
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface RuntimeToolEndEvent {
  type: "tool:end";
  sessionId: string;
  toolName: string;
  result: string;
}

export interface RuntimeQuestionEvent {
  type: "hitl:question";
  sessionId: string;
  id: string;
  question: string;
  options?: string[];
}

export interface RuntimePermissionEvent {
  type: "hitl:permission";
  sessionId: string;
  id: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface RuntimeErrorEvent {
  type: "session:error";
  sessionId: string;
  message: string;
}

export interface RuntimeCompletedEvent {
  type: "session:completed";
  sessionId: string;
}

export interface RuntimeSessionStatusEvent {
  type: "session:status";
  sessionId: string;
  status: "idle" | "processing" | "closed";
}

export type RuntimeEvent =
  | RuntimeSessionStartedEvent
  | RuntimeSessionStateEvent
  | RuntimeAgentTokenEvent
  | RuntimeToolStartEvent
  | RuntimeToolEndEvent
  | RuntimeQuestionEvent
  | RuntimePermissionEvent
  | RuntimeErrorEvent
  | RuntimeCompletedEvent
  | RuntimeSessionStatusEvent;

export interface RuntimeHarness {
  sessionId: string;
  provider: string;
  model: string;
  readonly tracerSummary: RuntimeMetrics;
  run(state: ContextState, resumeCommand?: unknown): AsyncGenerator<any>;
  save(): Promise<void>;
  destroy(): Promise<void>;
}

export interface RuntimeHarnessFactoryOptions {
  config: JooneConfig;
  cwd: string;
  sessionId: string;
}

export type RuntimeHarnessFactory = (
  options: RuntimeHarnessFactoryOptions,
) => Promise<RuntimeHarness>;
