import type {
  DesktopBridge,
  DesktopConfig,
  DesktopEvent,
  DesktopSessionSnapshot,
} from "./types";

const DEFAULT_CONFIG: DesktopConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  streaming: true,
};

export function createBrowserDesktopBridge(): DesktopBridge {
  const sessions = new Map<string, DesktopSessionSnapshot>();
  const listeners = new Map<string, Set<(event: DesktopEvent) => void>>();

  return {
    async loadConfig() {
      return DEFAULT_CONFIG;
    },
    async saveConfig() {
      return;
    },
    async listSessions() {
      return [...sessions.values()];
    },
    async startSession() {
      const session = createSession();
      sessions.set(session.sessionId, session);
      emit(listeners, session.sessionId, {
        type: "session:started",
        sessionId: session.sessionId,
        provider: session.provider,
        model: session.model,
      });
      return session;
    },
    async resumeSession(sessionId: string) {
      return sessions.get(sessionId) ?? createSession(sessionId);
    },
    async submitMessage(sessionId: string, text: string) {
      const current = sessions.get(sessionId) ?? createSession(sessionId);
      const next: DesktopSessionSnapshot = {
        ...current,
        messages: [
          ...current.messages,
          { role: "user", content: text },
          {
            role: "agent",
            content: `Browser bridge reply: "${text}" received. Tauri/runtime wiring is next.`,
          },
        ],
        metrics: {
          ...current.metrics,
          totalTokens: current.metrics.totalTokens + text.length,
          turnCount: current.metrics.turnCount + 1,
        },
      };

      sessions.set(sessionId, next);
      emit(listeners, sessionId, { type: "agent:token", sessionId, token: "..." });
      emit(listeners, sessionId, {
        type: "session:state",
        sessionId,
        state: { conversationHistory: next.messages },
        metrics: next.metrics,
      });
      emit(listeners, sessionId, { type: "session:completed", sessionId });
      return next;
    },
    async closeSession(sessionId: string) {
      sessions.delete(sessionId);
    },
    subscribe(sessionId, listener) {
      let bucket = listeners.get(sessionId);
      if (!bucket) {
        bucket = new Set();
        listeners.set(sessionId, bucket);
      }
      bucket.add(listener);
      return () => {
        bucket?.delete(listener);
      };
    },
  };
}

function createSession(sessionId = `desktop-${Date.now()}`): DesktopSessionSnapshot {
  return {
    sessionId,
    provider: DEFAULT_CONFIG.provider,
    model: DEFAULT_CONFIG.model,
    messages: [
      {
        role: "system",
        content: "Browser desktop bridge connected.",
      },
    ],
    metrics: {
      totalTokens: 0,
      cacheHitRate: 0,
      toolCallCount: 0,
      turnCount: 0,
      totalCost: 0,
    },
  };
}

function emit(
  listeners: Map<string, Set<(event: DesktopEvent) => void>>,
  sessionId: string,
  event: DesktopEvent,
) {
  const bucket = listeners.get(sessionId);
  if (!bucket) {
    return;
  }

  for (const listener of bucket) {
    listener(event);
  }
}
