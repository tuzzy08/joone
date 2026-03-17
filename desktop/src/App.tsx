import React, { useEffect, useMemo, useState } from "react";
import { getDesktopBridge } from "./bridge";
import type {
  DesktopBridge,
  DesktopConfig,
  DesktopEvent,
  DesktopSessionSnapshot,
} from "./bridge/types";

export function App() {
  const bridge = useMemo<DesktopBridge>(() => getDesktopBridge(), []);
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [sessions, setSessions] = useState<DesktopSessionSnapshot[]>([]);
  const [activeSession, setActiveSession] = useState<DesktopSessionSnapshot | null>(
    null,
  );
  const [input, setInput] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const [status, setStatus] = useState("Idle");

  useEffect(() => {
    void hydrateShell(bridge, setConfig, setSessions, setActivity);
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
    });
  }, [activeSession, bridge]);

  const startSession = async () => {
    const session = await bridge.startSession();
    setActiveSession(session);
    setSessions((prev) => upsertSession(prev, session));
    setStatus("Idle");
  };

  const resumeSession = async (sessionId: string) => {
    const session = await bridge.resumeSession(sessionId);
    setActiveSession(session);
    setSessions((prev) => upsertSession(prev, session));
    setStatus("Idle");
  };

  const submit = async () => {
    if (!input.trim()) {
      return;
    }

    const session = activeSession ?? (await bridge.startSession());
    if (!activeSession) {
      setActiveSession(session);
      setSessions((prev) => upsertSession(prev, session));
    }

    const next = await bridge.submitMessage(session.sessionId, input.trim());
    setActiveSession(next);
    setSessions((prev) => upsertSession(prev, next));
    setInput("");
    setStatus("Thinking");
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <section className="panel">
          <h2>Workspace</h2>
          <p>{config ? `${config.provider} / ${config.model}` : "Loading..."}</p>
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
                  <span>{session.messages.at(0)?.content ?? "Empty session"}</span>
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
  setSessions: (sessions: DesktopSessionSnapshot[]) => void,
  setActivity: React.Dispatch<React.SetStateAction<string[]>>,
) {
  const [config, sessions] = await Promise.all([
    bridge.loadConfig(),
    bridge.listSessions(),
  ]);

  setConfig(config);
  setSessions(sessions);
  setActivity(["Desktop shell ready."]);
}

function upsertSession(
  sessions: DesktopSessionSnapshot[],
  next: DesktopSessionSnapshot,
) {
  const filtered = sessions.filter((session) => session.sessionId !== next.sessionId);
  return [next, ...filtered];
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
