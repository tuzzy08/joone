export interface DesktopConfig {
  provider: string;
  model: string;
  streaming: boolean;
}

export interface DesktopBridgeStatus {
  mode: "browser" | "http" | "tauri";
  backend: "mock" | "runtime";
  healthy: boolean;
  baseUrl?: string;
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
  | { type: "agent:token"; sessionId: string; token: string }
  | { type: "tool:start"; sessionId: string; toolName: string }
  | { type: "tool:end"; sessionId: string; toolName: string }
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
  loadConfig(): Promise<DesktopConfig>;
  saveConfig(config: DesktopConfig): Promise<void>;
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
