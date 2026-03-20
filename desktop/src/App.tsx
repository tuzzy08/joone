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
  DesktopMessage,
  DesktopSessionSnapshot,
} from "./bridge/types";

const INITIAL_VISIBLE_SESSIONS = 3;
const MAX_TOOL_RUNS = 6;

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

type WorkTodoState = "done" | "active" | "pending" | "blocked";

interface WorkTodo {
  id: "request" | "tools" | "response";
  label: string;
  note: string;
  state: WorkTodoState;
}

interface ToolRunCard {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: string;
}

interface SessionWorkstream {
  todos: WorkTodo[];
  toolRuns: ToolRunCard[];
}

export function App() {
  const bridge = useMemo<DesktopBridge>(() => getDesktopBridge(), []);
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [draftConfig, setDraftConfig] = useState<DesktopConfig | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<DesktopBridgeStatus | null>(
    null,
  );
  const [sessions, setSessions] = useState<DesktopSessionSnapshot[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<DesktopSessionSnapshot | null>(
    null,
  );
  const [input, setInput] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [status, setStatus] = useState("Idle");
  const [pendingHitlPrompts, setPendingHitlPrompts] = useState<
    PendingHitlPrompt[]
  >([]);
  const [hitlAnswer, setHitlAnswer] = useState("");
  const [sessionWorkstreams, setSessionWorkstreams] = useState<
    Record<string, SessionWorkstream>
  >({});
  const retryActionRef = useRef<(() => Promise<void>) | null>(null);
  const conversationRef = useRef<HTMLElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);

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

    ensureSessionWorkstream(activeSession.sessionId);

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

      if (event.type === "session:status") {
        setStatus(capitalizeStatus(event.status));
      }

      if (event.type === "agent:token") {
        setStatus("Streaming");
        updateSessionWorkstream(event.sessionId, (current) => ({
          ...current,
          todos: setTodoState(current.todos, "response", "active", "Drafting the reply."),
        }));
      }

      if (event.type === "tool:start") {
        updateSessionWorkstream(event.sessionId, (current) => ({
          todos: setTodoState(
            current.todos,
            "tools",
            "active",
            `Running ${event.toolName}.`,
          ),
          toolRuns: [
            {
              id: `${event.toolName}-${Date.now()}`,
              toolName: event.toolName,
              args: event.args,
              status: "running",
            },
            ...current.toolRuns,
          ].slice(0, MAX_TOOL_RUNS),
        }));
      }

      if (event.type === "tool:end") {
        updateSessionWorkstream(event.sessionId, (current) => ({
          todos: setTodoState(
            current.todos,
            "tools",
            "done",
            `${event.toolName} completed.`,
          ),
          toolRuns: finalizeToolRun(current.toolRuns, event),
        }));
      }

      if (event.type === "session:completed") {
        setStatus("Idle");
        updateSessionWorkstream(event.sessionId, (current) => ({
          ...current,
          todos: completeTurnTodos(current.todos, current.toolRuns),
        }));
      }

      if (event.type === "session:error") {
        updateSessionWorkstream(event.sessionId, (current) => ({
          todos: current.todos.map((todo) =>
            todo.state === "done"
              ? todo
              : { ...todo, state: "blocked", note: event.message }
          ),
          toolRuns: failLatestToolRun(current.toolRuns, event.message),
        }));
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
        updateSessionWorkstream(event.sessionId, (current) => ({
          ...current,
          todos: setTodoState(
            current.todos,
            "tools",
            "blocked",
            "Waiting for your answer before continuing.",
          ),
        }));
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
        updateSessionWorkstream(event.sessionId, (current) => ({
          ...current,
          todos: setTodoState(
            current.todos,
            "tools",
            "blocked",
            `Waiting for approval to run ${event.toolName}.`,
          ),
        }));
      }
    });
  }, [activeSession, bridge]);

  const startSession = async () => {
    await runAction(async () => {
      const session = await bridge.startSession();
      const normalized = normalizeSession(session);
      setActiveSession(normalized);
      setSessions((prev) => upsertSession(prev, normalized));
      ensureSessionWorkstream(normalized.sessionId);
      setStatus("Idle");
    }, "Failed to start session");
  };

  const resumeSession = async (sessionId: string) => {
    setResumingSessionId(sessionId);
    await runAction(async () => {
      try {
        const session = await bridge.resumeSession(sessionId);
        const normalized = normalizeSession(session);
        setActiveSession(normalized);
        setSessions((prev) => upsertSession(prev, normalized));
        ensureSessionWorkstream(normalized.sessionId);
        setStatus("Idle");
      } finally {
        setResumingSessionId(null);
      }
    }, `Failed to resume ${sessionId}`);
  };

  const submit = async () => {
    if (!input.trim()) {
      return;
    }

    const prompt = input.trim();

    await runAction(async () => {
      const session = normalizeSession(activeSession ?? (await bridge.startSession()));
      if (!activeSession) {
        setActiveSession(session);
        setSessions((prev) => upsertSession(prev, session));
      }

      setStatus("Thinking");
      setInput("");
      setPendingHitlPrompts([]);
      updateSessionWorkstream(session.sessionId, (current) => ({
        todos: createTurnTodos(prompt),
        toolRuns: current.toolRuns,
      }));

      const next = await bridge.submitMessage(session.sessionId, prompt);
      const normalized = normalizeSession(next);
      setActiveSession(normalized);
      setSessions((prev) => upsertSession(prev, normalized));
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
  const activeWorkstream = activeSession
    ? sessionWorkstreams[activeSession.sessionId] ?? emptyWorkstream()
    : emptyWorkstream();
  const activeProgress = getTodoProgress(activeWorkstream.todos);

  useEffect(() => {
    scrollToConversationEnd();
  }, [
    activeSession?.sessionId,
    activeSession?.messages.length,
    activeWorkstream.toolRuns.length,
    activeWorkstream.todos.length,
  ]);

  useEffect(() => {
    if (activeHitlPrompt || resumingSessionId) {
      return;
    }

    focusComposer();
  }, [activeHitlPrompt, resumingSessionId, activeSession?.sessionId]);

  function ensureSessionWorkstream(sessionId: string) {
    setSessionWorkstreams((current) => {
      if (current[sessionId]) {
        return current;
      }

      return {
        ...current,
        [sessionId]: emptyWorkstream(),
      };
    });
  }

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

  function updateSessionWorkstream(
    sessionId: string,
    updater: (current: SessionWorkstream) => SessionWorkstream,
  ) {
    setSessionWorkstreams((current) => ({
      ...current,
      [sessionId]: updater(current[sessionId] ?? emptyWorkstream()),
    }));
  }

  function scrollToConversationEnd() {
    requestAnimationFrame(() => {
      const container = conversationRef.current;
      if (!container) {
        return;
      }

      const latestEntry = container.lastElementChild as HTMLElement | null;
      if (latestEntry) {
        latestEntry.scrollIntoView({
          block: "end",
          behavior: "smooth",
        });
        return;
      }

      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  function focusComposer() {
    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
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
      if (activeSession) {
        updateSessionWorkstream(activeSession.sessionId, (current) => ({
          ...current,
          todos: setTodoState(
            current.todos,
            "tools",
            "active",
            "Continuing after your input.",
          ),
        }));
      }
      setActivity((prev) => [
        `Answered HITL prompt ${activeHitlPrompt.id}.`,
        ...prev,
      ].slice(0, 10));
      setHitlAnswer("");
      setStatus("Thinking");
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
                  onChange={(event) =>
                    updateDraftConfig({
                      streaming: event.target.checked,
                    })
                  }
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
          <div
            className={`session-list${showAllSessions ? " session-list--expanded" : ""}`}
          >
            {sessions.length === 0 ? (
              <p>No saved sessions yet.</p>
            ) : (
              <>
                {visibleSessions.map((session) => (
                  <button
                    key={session.sessionId}
                    className={`session-item${
                      activeSession?.sessionId === session.sessionId ? " session-item--active" : ""
                    }${
                      resumingSessionId === session.sessionId ? " session-item--loading" : ""
                    }`}
                    disabled={resumingSessionId != null}
                    onClick={() => void resumeSession(session.sessionId)}
                  >
                    <div className="session-item-header">
                      <strong>{describeSession(session)}</strong>
                      {activeSession?.sessionId === session.sessionId ? (
                        <span className="session-badge">Current session</span>
                      ) : null}
                    </div>
                    <span className="session-meta">{session.sessionId}</span>
                    <div className="session-details">
                      <span>{session.description ?? describeSession(session)}</span>
                      <span className="session-time">
                        Last saved {formatSessionTimestamp(session.lastSavedAt)}
                      </span>
                    </div>
                    <span className="session-action">
                      {resumingSessionId === session.sessionId ? "Resuming..." : "Resume session"}
                    </span>
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

        <section className="conversation" ref={conversationRef}>
          {(activeSession?.messages ?? []).length === 0 ? (
            <article className="bubble bubble-system">
              Start or resume a session to begin using the desktop client.
            </article>
          ) : (
            activeSession?.messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`bubble bubble-${message.role}`}>
                <span className="bubble-label">{labelForRole(message.role)}</span>
                <div>{message.content}</div>
              </article>
            ))
          )}

          {activeWorkstream.todos.length > 0 ? (
            <article className="work-card todo-card">
              <div className="work-card-header">
                <div>
                  <span className="eyebrow">Live progress</span>
                  <strong>Agent workstream</strong>
                </div>
                <span className="status-chip">{activeProgress}% complete</span>
              </div>
              <div className="todo-list">
                {activeWorkstream.todos.map((todo) => (
                  <div key={todo.id} className={`todo-step todo-step--${todo.state}`}>
                    <span className="todo-icon">{iconForTodo(todo.state)}</span>
                    <div>
                      <strong>{todo.label}</strong>
                      <p>{todo.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {activeWorkstream.toolRuns.map((toolRun) => (
            <article key={toolRun.id} className={`work-card tool-card tool-card--${toolRun.status}`}>
              <div className="work-card-header">
                <div>
                  <span className="eyebrow">Tool call</span>
                  <strong>{toolRun.toolName}</strong>
                </div>
                <span className={`status-chip status-chip--${toolRun.status}`}>
                  {toolRun.status === "running"
                    ? "Running"
                    : toolRun.status === "success"
                      ? "Complete"
                      : "Needs attention"}
                </span>
              </div>
              {Object.keys(toolRun.args).length > 0 ? (
                <div className="tool-block">
                  <span className="tool-block-label">Arguments</span>
                  <div className="tool-chip-row">
                    {Object.entries(toolRun.args)
                      .slice(0, 4)
                      .map(([key, value]) => (
                        <span key={key} className="tool-chip">
                          {key}: {formatValue(value)}
                        </span>
                      ))}
                  </div>
                </div>
              ) : null}
              {toolRun.result ? (
                <div className="tool-block">
                  <span className="tool-block-label">Result</span>
                  <p className="tool-result">{summarizeText(toolRun.result, 180)}</p>
                </div>
              ) : null}
            </article>
          ))}
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
              ref={composerInputRef}
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

function formatSessionTimestamp(lastSavedAt?: number): string {
  if (!lastSavedAt) {
    return "just now";
  }

  const elapsedMs = Date.now() - lastSavedAt;
  if (elapsedMs < 60_000) {
    return "just now";
  }

  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  if (elapsedDays < 7) {
    return `${elapsedDays}d ago`;
  }

  return new Date(lastSavedAt).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function describeEvent(event: DesktopEvent): string {
  switch (event.type) {
    case "session:started":
      return `Started ${event.sessionId}`;
    case "session:status":
      return `Session ${event.status}`;
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

function emptyWorkstream(): SessionWorkstream {
  return {
    todos: [],
    toolRuns: [],
  };
}

function createTurnTodos(prompt: string): WorkTodo[] {
  return [
    {
      id: "request",
      label: "Understand the request",
      note: summarizeText(prompt, 96),
      state: "done",
    },
    {
      id: "tools",
      label: "Inspect files and run tools",
      note: "Waiting for the next action.",
      state: "active",
    },
    {
      id: "response",
      label: "Draft the response",
      note: "Will start once the agent has enough context.",
      state: "pending",
    },
  ];
}

function completeTurnTodos(
  todos: WorkTodo[],
  toolRuns: ToolRunCard[],
): WorkTodo[] {
  return todos.map((todo) => {
    if (todo.id === "tools") {
      return {
        ...todo,
        state: "done",
        note:
          toolRuns.length > 0
            ? "Tool work finished successfully."
            : "No tool calls were needed for this reply.",
      };
    }

    if (todo.id === "response") {
      return {
        ...todo,
        state: "done",
        note: "Reply delivered to the conversation.",
      };
    }

    return {
      ...todo,
      state: "done",
    };
  });
}

function setTodoState(
  todos: WorkTodo[],
  id: WorkTodo["id"],
  state: WorkTodoState,
  note: string,
): WorkTodo[] {
  return todos.map((todo) => (todo.id === id ? { ...todo, state, note } : todo));
}

function finalizeToolRun(
  toolRuns: ToolRunCard[],
  event: Extract<DesktopEvent, { type: "tool:end" }>,
): ToolRunCard[] {
  let updated = false;
  const next = toolRuns.map((toolRun) => {
    if (!updated && toolRun.toolName === event.toolName && toolRun.status === "running") {
      updated = true;
      return {
        ...toolRun,
        status: "success",
        result: event.result,
        args: event.args ?? toolRun.args,
      };
    }

    return toolRun;
  });

  if (updated) {
    return next;
  }

  return [
    {
      id: `${event.toolName}-${Date.now()}`,
      toolName: event.toolName,
      args: event.args ?? {},
      status: "success",
      result: event.result,
    },
    ...toolRuns,
  ].slice(0, MAX_TOOL_RUNS);
}

function failLatestToolRun(toolRuns: ToolRunCard[], message: string): ToolRunCard[] {
  let updated = false;
  return toolRuns.map((toolRun) => {
    if (!updated && toolRun.status === "running") {
      updated = true;
      return {
        ...toolRun,
        status: "error",
        result: message,
      };
    }

    return toolRun;
  });
}

function getTodoProgress(todos: WorkTodo[]): number {
  if (todos.length === 0) {
    return 0;
  }

  const completed = todos.filter((todo) => todo.state === "done").length;
  return Math.round((completed / todos.length) * 100);
}

function labelForRole(role: DesktopMessage["role"]): string {
  switch (role) {
    case "user":
      return "You";
    case "agent":
      return "Joone";
    default:
      return "System";
  }
}

function capitalizeStatus(status: "idle" | "processing" | "closed"): string {
  if (status === "processing") {
    return "Thinking";
  }

  return status[0].toUpperCase() + status.slice(1);
}

function summarizeText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit - 3)}...`;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return summarizeText(value, 40);
  }

  if (value == null) {
    return "null";
  }

  try {
    return summarizeText(JSON.stringify(value), 40);
  } catch {
    return summarizeText(String(value), 40);
  }
}

function iconForTodo(state: WorkTodoState): string {
  switch (state) {
    case "done":
      return "Done";
    case "active":
      return "Now";
    case "blocked":
      return "Hold";
    default:
      return "Next";
  }
}
