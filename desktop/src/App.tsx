import React, { useEffect, useMemo, useRef, useState } from "react";
import { getDesktopBridge } from "./bridge";
import {
  PROVIDER_MODELS,
  SUPPORTED_PROVIDERS,
} from "../../src/desktop/providerCatalog.js";
import type {
  DesktopBridge,
  DesktopBridgeStatus,
  DesktopConfig,
  DesktopEvent,
  DesktopSessionSnapshot,
} from "./bridge/types";

const INITIAL_VISIBLE_SESSIONS = 4;

type PendingHitlPrompt =
  | {
      type: "question";
      id: string;
      question: string;
      options?: string[];
    }
  | {
      type: "permission";
      id: string;
      toolName: string;
      args: Record<string, unknown>;
    };

export function App() {
  const bridge = useMemo<DesktopBridge>(() => getDesktopBridge(), []);
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [draftConfig, setDraftConfig] = useState<DesktopConfig | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<DesktopBridgeStatus | null>(
    null,
  );
  const [sessions, setSessions] = useState<DesktopSessionSnapshot[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [activeSession, setActiveSession] = useState<DesktopSessionSnapshot | null>(
    null,
  );
  const [input, setInput] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [status, setStatus] = useState("Idle");
  // Keep HITL prompts FIFO so a later question does not overwrite an earlier unanswered one.
  const [pendingHitlPrompts, setPendingHitlPrompts] = useState<PendingHitlPrompt[]>([]);
  const [hitlAnswer, setHitlAnswer] = useState("");
  const retryActionRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    void runAction(
      () =>
        hydrateShell(
          bridge,
          setConfig,
          setDraftConfig,
          setBridgeStatus,
          setSessions,
          setActivity,
        ),
      "Failed to initialize desktop shell",
    );
  }, [bridge]);

  useEffect(() => {
    if (!config) {
      return;
    }

    setDraftConfig(config);
  }, [config]);

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

      if (event.type === "hitl:question") {
        setPendingHitlPrompts((prev) => [
          ...prev,
          {
            type: "question",
            id: event.id,
            question: event.question,
            options: event.options,
          },
        ]);
        setStatus("Awaiting input");
      }

      if (event.type === "hitl:permission") {
        setPendingHitlPrompts((prev) => [
          ...prev,
          {
            type: "permission",
            id: event.id,
            toolName: event.toolName,
            args: event.args,
          },
        ]);
        setStatus("Awaiting input");
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

  const saveSettings = async () => {
    if (!draftConfig) {
      return;
    }

    await runAction(async () => {
      await bridge.saveConfig(draftConfig);
      setConfig(draftConfig);
      setStatus("Idle");
      setActivity((prev) => [
        `Settings saved for ${draftConfig.provider} / ${draftConfig.model}.`,
        ...prev,
      ].slice(0, 10));
    }, "Failed to save settings");
  };

  const configDirty =
    config != null &&
    draftConfig != null &&
    (config.provider !== draftConfig.provider ||
      config.model !== draftConfig.model ||
      config.streaming !== draftConfig.streaming);
  const providerOptions = SUPPORTED_PROVIDERS;
  const availableModels = draftConfig
    ? PROVIDER_MODELS[draftConfig.provider] ?? []
    : [];
  const visibleSessions = showAllSessions
    ? sessions
    : sessions.slice(0, INITIAL_VISIBLE_SESSIONS);
  const activeHitlPrompt = pendingHitlPrompts[0];

  function updateDraftConfig(
    patch: Partial<DesktopConfig> | ((current: DesktopConfig) => DesktopConfig),
  ) {
    setDraftConfig((current) => {
      if (!current) {
        return current;
      }

      return typeof patch === "function" ? patch(current) : { ...current, ...patch };
    });
  }

  function syncDraftProvider(provider: string) {
    updateDraftConfig((current) => {
      const nextModels = PROVIDER_MODELS[provider] ?? [];
      const fallbackModel = nextModels[0]?.value ?? current.model;
      const hasCurrentModel = nextModels.some(
        (modelOption) => modelOption.value === current.model,
      );

      return {
        ...current,
        provider,
        model: hasCurrentModel ? current.model : fallbackModel,
      };
    });
  }

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

  const submitHitlAnswer = async () => {
    if (!activeHitlPrompt || !hitlAnswer.trim()) {
      return;
    }

    await runAction(async () => {
      await bridge.answerHitl(activeHitlPrompt.id, hitlAnswer.trim());
      setPendingHitlPrompts((prev) => prev.slice(1));
      setActivity((prev) => [
        `Answered HITL prompt ${activeHitlPrompt.id}.`,
        ...prev,
      ].slice(0, 10));
      setHitlAnswer("");
      setStatus((pendingHitlPrompts.length > 1) ? "Awaiting input" : "Idle");
    }, "Failed to answer HITL prompt");
  };

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
          <h2>Settings</h2>
          {draftConfig ? (
            <div className="settings-form">
              <label className="settings-row">
                <span>Provider</span>
                <select
                  className="input select-input"
                  value={draftConfig.provider}
                  onChange={(event) => syncDraftProvider(event.target.value)}
                >
                  {providerOptions.map((providerOption) => (
                    <option key={providerOption.value} value={providerOption.value}>
                      {providerOption.label}
                    </option>
                  ))}
                </select>
                <small className="settings-hint">
                  {
                    providerOptions.find(
                      (providerOption) => providerOption.value === draftConfig.provider,
                    )?.hint
                  }
                </small>
              </label>

              <label className="settings-row">
                <span>Model</span>
                <select
                  className="input select-input"
                  value={draftConfig.model}
                  onChange={(event) =>
                    updateDraftConfig({
                      model: event.target.value,
                    })
                  }
                >
                  {availableModels.map((modelOption) => (
                    <option key={modelOption.value} value={modelOption.value}>
                      {modelOption.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={draftConfig.streaming}
                  onChange={(event) => updateDraftConfig({
                    streaming: event.target.checked,
                  })}
                />
                <span>Streaming responses</span>
              </label>

              <button
                className="button"
                disabled={!configDirty}
                onClick={() => void saveSettings()}
              >
                Save Settings
              </button>
            </div>
          ) : (
            <p>Loading settings...</p>
          )}
        </section>

        <section className="panel">
          <h2>Sessions</h2>
          <div className="session-list">
            {sessions.length === 0 ? (
              <p>No saved sessions yet.</p>
            ) : (
              <>
                {visibleSessions.map((session) => (
                  <button
                    key={session.sessionId}
                    className="session-item"
                    onClick={() => void resumeSession(session.sessionId)}
                  >
                    <strong>{describeSession(session)}</strong>
                    <span className="session-meta">{session.sessionId}</span>
                    <span>{session.description ?? describeSession(session)}</span>
                  </button>
                ))}
                {sessions.length > INITIAL_VISIBLE_SESSIONS ? (
                  <button
                    className="ghost-button session-toggle"
                    onClick={() => setShowAllSessions((current) => !current)}
                  >
                    {showAllSessions
                      ? "Show fewer"
                      : `View more (${sessions.length - INITIAL_VISIBLE_SESSIONS})`}
                  </button>
                ) : null}
              </>
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

        {activeHitlPrompt ? (
          <section className="hitl-card">
            <strong>Human-in-the-loop</strong>
            {activeHitlPrompt.type === "question" ? (
              <>
                <p>{activeHitlPrompt.question}</p>
                {activeHitlPrompt.options?.length ? (
                  <div className="hitl-queue">
                    {activeHitlPrompt.options.map((option) => (
                      <span key={option}>{option}</span>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p>Allow tool execution for `{activeHitlPrompt.toolName}`?</p>
                <div className="hitl-queue">
                  {Object.entries(activeHitlPrompt.args).map(([key, value]) => (
                    <span key={key}>{`${key}: ${String(value)}`}</span>
                  ))}
                </div>
              </>
            )}
            {pendingHitlPrompts.length > 1 ? (
              <p>Pending prompts: {pendingHitlPrompts.length - 1}</p>
            ) : null}
            <div className="composer">
              <input
                className="input"
                placeholder={
                  activeHitlPrompt.type === "permission"
                    ? "Type y / n or approve / reject"
                    : "Type your answer"
                }
                value={hitlAnswer}
                onChange={(event) => setHitlAnswer(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void submitHitlAnswer();
                  }
                }}
              />
              <button className="button" onClick={() => void submitHitlAnswer()}>
                Submit Answer
              </button>
            </div>
          </section>
        ) : null}

        {!activeHitlPrompt ? (
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
        ) : null}
      </main>
    </div>
  );
}

async function hydrateShell(
  bridge: DesktopBridge,
  setConfig: (config: DesktopConfig) => void,
  setDraftConfig: (config: DesktopConfig) => void,
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
  setDraftConfig(config);
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
    description: session.description ?? describeSession(session),
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

function describeSession(session: DesktopSessionSnapshot): string {
  const candidate =
    session.description ??
    session.messages.find((message) => message.role === "user")?.content ??
    session.messages.find((message) => message.role === "agent")?.content ??
    "Untitled session";

  const normalized = candidate.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Untitled session";
  }

  return normalized.length > 72 ? `${normalized.slice(0, 69)}...` : normalized;
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
    case "hitl:question":
      return `Question requested: ${event.question}`;
    case "hitl:permission":
      return `Permission requested for ${event.toolName}`;
    default:
      return event.type;
  }
}
