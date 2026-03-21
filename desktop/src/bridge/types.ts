export interface DesktopProviderConnection {
  apiKey?: string;
  baseUrl?: string;
  connected?: boolean;
  defaultModel?: string;
}

export interface DesktopNotificationSettings {
  permissions: boolean;
  completionSummary: boolean;
  needsAttention: boolean;
}

export interface DesktopUpdateSettings {
  autoCheck: boolean;
}

export interface DesktopConfig {
  provider: string;
  model: string;
  streaming: boolean;
  permissionMode?: "auto" | "ask_dangerous" | "ask_all";
  appearance?: "light" | "dark";
  notifications: DesktopNotificationSettings;
  updates: DesktopUpdateSettings;
  providerConnections: Record<string, DesktopProviderConnection>;
}

export interface DesktopBridgeStatus {
  mode: "browser" | "http" | "tauri";
  backend: "mock" | "runtime";
  healthy: boolean;
  runtimeOwner?: "mock" | "external" | "managed";
  baseUrl?: string;
}

export interface DesktopWorkspaceContext {
  gitBranch?: string | null;
  permissionMode: "auto" | "ask_dangerous" | "ask_all";
  executionMode?: "host" | "sandbox";
}

export interface DesktopProviderConnectionResult {
  ok: boolean;
  message: string;
}

export interface DesktopUpdateCheckResult {
  checkedAt: number;
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  downloadUrl?: string;
  message: string;
}

export interface DesktopMessage {
  role: "user" | "agent" | "system";
  content: string;
}

export interface DesktopMetrics {
  totalTokens: number;
  cacheHitRate: number;
  toolCallCount: number;
  turnCount: number;
  totalCost: number;
}

export interface DesktopSessionSnapshot {
  sessionId: string;
  provider: string;
  model: string;
  description?: string;
  lastSavedAt?: number;
  messages: DesktopMessage[];
  metrics: DesktopMetrics;
}

export type DesktopEvent =
  | {
      type: "session:started";
      sessionId: string;
      provider: string;
      model: string;
    }
  | {
      type: "session:state";
      sessionId: string;
      state: { conversationHistory: DesktopMessage[] };
      metrics: DesktopMetrics;
    }
  | {
      type: "session:status";
      sessionId: string;
      status: "idle" | "processing" | "closed";
    }
  | { type: "agent:token"; sessionId: string; token: string }
  | {
      type: "tool:start";
      sessionId: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool:end";
      sessionId: string;
      toolName: string;
      args?: Record<string, unknown>;
      result: string;
    }
  | {
      type: "hitl:question";
      sessionId: string;
      id: string;
      question: string;
      options?: string[];
    }
  | {
      type: "hitl:permission";
      sessionId: string;
      id: string;
      toolName: string;
      args: Record<string, unknown>;
    }
  | { type: "session:error"; sessionId: string; message: string }
  | { type: "session:completed"; sessionId: string };

export interface DesktopBridge {
  getStatus(): Promise<DesktopBridgeStatus>;
  getWorkspaceContext(): Promise<DesktopWorkspaceContext>;
  loadConfig(): Promise<DesktopConfig>;
  saveConfig(config: DesktopConfig): Promise<void>;
  testProviderConnection(
    provider: string,
    connection: DesktopProviderConnection,
  ): Promise<DesktopProviderConnectionResult>;
  checkForUpdates(): Promise<DesktopUpdateCheckResult>;
  answerHitl(id: string, answer: string): Promise<void>;
  listSessions(): Promise<DesktopSessionSnapshot[]>;
  startSession(): Promise<DesktopSessionSnapshot>;
  resumeSession(sessionId: string): Promise<DesktopSessionSnapshot>;
  submitMessage(
    sessionId: string,
    text: string,
  ): Promise<DesktopSessionSnapshot>;
  closeSession(sessionId: string): Promise<void>;
  subscribe(
    sessionId: string,
    listener: (event: DesktopEvent) => void,
  ): () => void;
}
