import React, { useEffect, useMemo, useRef, useState } from "react";
import { getDesktopBridge } from "./bridge";
import type {
  DesktopBridge,
  DesktopBridgeStatus,
  DesktopConfig,
  DesktopEvent,
  DesktopSessionSnapshot,
} from "./bridge/types";

export function App() {
  const bridge = useMemo<DesktopBridge>(() => getDesktopBridge(), []);
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<DesktopBridgeStatus | null>(
    null,
  );
  const [sessions, setSessions] = useState<DesktopSessionSnapshot[]>([]);
  const [activeSession, setActiveSession] = useState<DesktopSessionSnapshot | null>(
    null,
  );
  const [input, setInput] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [status, setStatus] = useState("Idle");
  const retryActionRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    void runAction(
      () =>
        hydrateShell(bridge, setConfig, setBridgeStatus, setSessions, setActivity),
      "Failed to initialize desktop shell",
    );
  }, [bridge]);

  useEffect(() => {
    if (!activeSession) {
      return;
    }

    return bridge.subscribe(activeSession.sessionId, (event) => {
      setActivity((prev) => [describeEvent(event), ...prev].slice(0, 10));

      if (event.type === "session:state") {
        setActiveSession((prev) =>
          prev
            ? {
                ...prev,
                messages: event.state.conversationHistory,
                metrics: event.metrics,
              }
            : prev,
        );
      }

      if (event.type === "agent:token") {
        setStatus("Streaming");
      }

      if (event.type === "session:completed") {
        setStatus("Idle");
      }

      if (event.type === "session:error") {
        reportError(new Error(event.message), "Runtime error");
      }
    });
  }, [activeSession, bridge]);

  const startSession = async () => {
    await runAction(async () => {
      const session = await bridge.startSession();
      const normalized = normalizeSession(session);
      setActiveSession(normalized);
      setSessions((prev) => upsertSession(prev, normalized));
      setStatus("Idle");
    }, "Failed to start session");
  };

  const resumeSession = async (sessionId: string) => {
    await runAction(async () => {
      const session = await bridge.resumeSession(sessionId);
      const normalized = normalizeSession(session);
      setActiveSession(normalized);
      setSessions((prev) => upsertSession(prev, normalized));
      setStatus("Idle");
    }, `Failed to resume ${sessionId}`);
  };

  const submit = async () => {
    if (!input.trim()) {
      return;
    }

    await runAction(async () => {
      const session = activeSession ?? (await bridge.startSession());
      if (!activeSession) {
        const normalized = normalizeSession(session);
        setActiveSession(normalized);
        setSessions((prev) => upsertSession(prev, normalized));
      }

      const next = await bridge.submitMessage(session.sessionId, input.trim());
      const normalized = normalizeSession(next);
      setActiveSession(normalized);
      setSessions((prev) => upsertSession(prev, normalized));
      setInput("");
      setStatus("Thinking");
    }, "Failed to send message");
  };

  async function runAction(action: () => Promise<void>, context: string) {
    retryActionRef.current = action;
    try {
      await action();
      retryActionRef.current = null;
      setLastError(null);
    } catch (error) {
      reportError(error, context);
    }
  }

  async function retryLastAction() {
    const retry = retryActionRef.current;
    if (!retry) {
      return;
    }

    await runAction(retry, "Retry last action");
  }

  function dismissError() {
    retryActionRef.current = null;
    setLastError(null);
    setStatus((current) => (current === "Error" ? "Idle" : current));
  }

  function reportError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : String(error);
    const nextError = `${context}: ${message}`;
    setLastError(nextError);
    setStatus("Error");
    setActivity((prev) => [`Error: ${nextError}`, ...prev].slice(0, 10));
  }

  return (
    <div className="shell">
      {lastError ? (
        <div className="toast-stack">
          <section className="toast" role="alert">
            <strong>Desktop error</strong>
            <p>{lastError}</p>
            <div className="toast-actions">
              <button className="button" onClick={() => void retryLastAction()}>
                Retry last action
              </button>
              <button className="ghost-button" onClick={() => dismissError()}>
                Dismiss
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <aside className="sidebar">
        <section className="panel">
          <h2>Workspace</h2>
          <p>{config ? `${config.provider} / ${config.model}` : "Loading..."}</p>
          {/* Keep the active transport explicit while the desktop shell still supports a temporary mock bridge. */}
          <p>Bridge: {bridgeStatus?.mode ?? "Loading..."}</p>
          <p>
            Runtime:{" "}
            {bridgeStatus
              ? bridgeStatus.healthy
                ? `${bridgeStatus.backend} ready`
                : `${bridgeStatus.backend} unavailable`
              : "Checking..."}
          </p>
          <p className="error-text">Last error: {lastError ?? "None"}</p>
          <strong>{activeSession?.sessionId ?? "No active session"}</strong>
        </section>

        <section className="panel">
          <h2>Sessions</h2>
          <div className="session-list">
            {sessions.length === 0 ? (
              <p>No saved sessions yet.</p>
            ) : (
              sessions.map((session) => (
                <button
                  key={session.sessionId}
                  className="session-item"
                  onClick={() => void resumeSession(session.sessionId)}
                >
                  <strong>{session.sessionId}</strong>
                  <span>{session.messages[0]?.content ?? "Empty session"}</span>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <h2>Metrics</h2>
          <p>Status: {status}</p>
          <p>Tokens: {activeSession?.metrics.totalTokens ?? 0}</p>
          <p>Tools: {activeSession?.metrics.toolCallCount ?? 0}</p>
        </section>

        <section className="panel">
          <h2>Activity</h2>
          <div className="activity-list">
            {activity.length === 0 ? (
              <p>No runtime events yet.</p>
            ) : (
              activity.map((entry, index) => <p key={index}>{entry}</p>)
            )}
          </div>
        </section>
      </aside>

      <main className="main">
        <header className="hero">
          <div>
            <h1>Joone Desktop</h1>
            <p>Shared-runtime desktop shell with browser fallback and Tauri adapter.</p>
          </div>
          <button className="button" onClick={() => void startSession()}>
            Start Session
          </button>
        </header>

        <section className="conversation">
          {(activeSession?.messages ?? []).length === 0 ? (
            <article className="bubble bubble-system">
              Start or resume a session to begin using the desktop client.
            </article>
          ) : (
            activeSession?.messages.map((message, index) => (
              <article key={index} className={`bubble bubble-${message.role}`}>
                {message.content}
              </article>
            ))
          )}
        </section>

        <footer className="composer">
          <input
            className="input"
            placeholder="What should we build today?"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void submit();
              }
            }}
          />
          <button className="button" onClick={() => void submit()}>
            Send
          </button>
        </footer>
      </main>
    </div>
  );
}

async function hydrateShell(
  bridge: DesktopBridge,
  setConfig: (config: DesktopConfig) => void,
  setBridgeStatus: (status: DesktopBridgeStatus) => void,
  setSessions: (sessions: DesktopSessionSnapshot[]) => void,
  setActivity: React.Dispatch<React.SetStateAction<string[]>>,
) {
  const [bridgeStatus, config, sessions] = await Promise.all([
    bridge.getStatus(),
    bridge.loadConfig(),
    bridge.listSessions(),
  ]);

  setConfig(config);
  setBridgeStatus(bridgeStatus);
  setSessions(sessions.map((session) => normalizeSession(session)));
  setActivity([
    `Desktop shell ready via ${bridgeStatus.mode} bridge (${bridgeStatus.backend}).`,
  ]);
}

function upsertSession(
  sessions: DesktopSessionSnapshot[],
  next: DesktopSessionSnapshot,
) {
  const filtered = sessions.filter((session) => session.sessionId !== next.sessionId);
  return [next, ...filtered];
}

function normalizeSession(session: DesktopSessionSnapshot): DesktopSessionSnapshot {
  return {
    ...session,
    messages: Array.isArray(session.messages) ? session.messages : [],
    metrics: session.metrics ?? {
      totalTokens: 0,
      cacheHitRate: 0,
      toolCallCount: 0,
      turnCount: 0,
      totalCost: 0,
    },
  };
}

function describeEvent(event: DesktopEvent): string {
  switch (event.type) {
    case "session:started":
      return `Started ${event.sessionId}`;
    case "session:completed":
      return `Completed ${event.sessionId}`;
    case "session:error":
      return `Error: ${event.message}`;
    case "tool:start":
      return `Tool ${event.toolName} started`;
    case "tool:end":
      return `Tool ${event.toolName} finished`;
    case "agent:token":
      return `Streaming token: ${event.token}`;
    default:
      return event.type;
  }
}
