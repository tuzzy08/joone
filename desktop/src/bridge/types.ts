export interface DesktopConfig {
  provider: string;
  model: string;
  streaming: boolean;
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
  | { type: "session:error"; sessionId: string; message: string }
  | { type: "session:completed"; sessionId: string };

export interface DesktopBridge {
  loadConfig(): Promise<DesktopConfig>;
  saveConfig(config: DesktopConfig): Promise<void>;
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
