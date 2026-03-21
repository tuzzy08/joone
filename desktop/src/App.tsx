import React, { useEffect, useMemo, useRef, useState } from "react";
import { getDesktopBridge } from "./bridge";
import {
  PROVIDER_MODELS,
  SUPPORTED_PROVIDERS,
} from "../../src/desktop/providerCatalog.js";
import { ShellSidebar } from "./components/ShellSidebar";
import { SettingsModal } from "./components/SettingsModal";
import { ProviderConnectionModal } from "./components/ProviderConnectionModal";
import { ComposerFooter } from "./components/ComposerFooter";
import type {
  DesktopBridge,
  DesktopBridgeStatus,
  DesktopConfig,
  DesktopEvent,
  DesktopProviderConnection,
  DesktopProviderConnectionResult,
  DesktopSessionSnapshot,
  DesktopUpdateCheckResult,
  DesktopWorkspaceContext,
} from "./bridge/types";

const MAX_TOOL_RUNS = 6;

type SettingsSection = "general" | "providers";

type PendingHitlPrompt =
  | {
      type: "question";
      id: string;
      sessionId: string;
      question: string;
      options?: string[];
    }
  | {
      type: "permission";
      id: string;
      sessionId: string;
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
  const [bridgeStatus, setBridgeStatus] = useState<DesktopBridgeStatus | null>(null);
  const [workspaceContext, setWorkspaceContext] = useState<DesktopWorkspaceContext | null>(null);
  const [sessions, setSessions] = useState<DesktopSessionSnapshot[]>([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSection>("general");
  const [activeSession, setActiveSession] = useState<DesktopSessionSnapshot | null>(null);
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState("Idle");
  const [input, setInput] = useState("");
  const [activity, setActivity] = useState<string[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pendingHitlPrompts, setPendingHitlPrompts] = useState<PendingHitlPrompt[]>([]);
  const [hitlAnswer, setHitlAnswer] = useState("");
  const [sessionWorkstreams, setSessionWorkstreams] = useState<
    Record<string, SessionWorkstream>
  >({});
  const [attentionBySession, setAttentionBySession] = useState<Record<string, string>>({});
  const [providerModalProvider, setProviderModalProvider] = useState<string | null>(null);
  const [providerModalDraft, setProviderModalDraft] = useState<DesktopProviderConnection>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [providerFeedback, setProviderFeedback] = useState<
    Record<string, DesktopProviderConnectionResult>
  >({});
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateResult, setUpdateResult] = useState<DesktopUpdateCheckResult | null>(null);

  const retryActionRef = useRef<(() => Promise<void>) | null>(null);
  const conversationRef = useRef<HTMLElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const autoCheckedUpdatesRef = useRef(false);

  useEffect(() => {
    void runAction(
      () =>
        hydrateShell(
          bridge,
          setConfig,
          setDraftConfig,
          setBridgeStatus,
          setWorkspaceContext,
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
    if (!config?.updates.autoCheck || autoCheckedUpdatesRef.current) {
      return;
    }

    autoCheckedUpdatesRef.current = true;
    void checkForUpdates();
  }, [config?.updates.autoCheck]);

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
          todos: setTodoState(current.todos, "tools", "active", `Running ${event.toolName}.`),
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
          todos: setTodoState(current.todos, "tools", "done", `${event.toolName} completed.`),
          toolRuns: finalizeToolRun(current.toolRuns, event),
        }));
      }

      if (event.type === "session:completed") {
        setStatus("Idle");
        setAttentionBySession((current) => {
          const next = { ...current };
          if (!pendingHitlPrompts.some((prompt) => prompt.sessionId === event.sessionId)) {
            delete next[event.sessionId];
          }
          return next;
        });
        notifyForEvent(event);
        updateSessionWorkstream(event.sessionId, (current) => ({
          ...current,
          todos: completeTurnTodos(current.todos, current.toolRuns),
        }));
      }

      if (event.type === "session:error") {
        setAttentionBySession((current) => ({
          ...current,
          [event.sessionId]: "Needs attention",
        }));
        updateSessionWorkstream(event.sessionId, (current) => ({
          todos: current.todos.map((todo) =>
            todo.state === "done" ? todo : { ...todo, state: "blocked", note: event.message },
          ),
          toolRuns: failLatestToolRun(current.toolRuns, event.message),
        }));
        notifyForEvent(event);
        reportError(new Error(event.message), "Runtime error");
      }

      if (event.type === "hitl:question") {
        setPendingHitlPrompts((prev) => [
          ...prev,
          {
            type: "question",
            id: event.id,
            sessionId: event.sessionId,
            question: event.question,
            options: event.options,
          },
        ]);
        setAttentionBySession((current) => ({
          ...current,
          [event.sessionId]: "Pending approval",
        }));
        setStatus("Awaiting input");
        notifyForEvent(event);
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
            sessionId: event.sessionId,
            toolName: event.toolName,
            args: event.args,
          },
        ]);
        setAttentionBySession((current) => ({
          ...current,
          [event.sessionId]: "Pending approval",
        }));
        setStatus("Awaiting input");
        notifyForEvent(event);
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
  }, [activeSession, bridge, pendingHitlPrompts, config]);

  useEffect(() => {
    scrollToConversationEnd();
  }, [
    activeSession?.sessionId,
    activeSession?.messages.length,
    sessionWorkstreams[activeSession?.sessionId ?? ""]?.toolRuns.length,
    sessionWorkstreams[activeSession?.sessionId ?? ""]?.todos.length,
  ]);

  useEffect(() => {
    if (pendingHitlPrompts.length > 0 || resumingSessionId) {
      return;
    }

    focusComposer();
  }, [activeSession?.sessionId, pendingHitlPrompts.length, resumingSessionId]);

  const activeHitlPrompt = pendingHitlPrompts[0];
  const activeWorkstream = activeSession
    ? sessionWorkstreams[activeSession.sessionId] ?? emptyWorkstream()
    : emptyWorkstream();
  const activeProgress = getTodoProgress(activeWorkstream.todos);
  const isRestoringSession = Boolean(
    resumingSessionId && activeSession?.sessionId !== resumingSessionId,
  );
  const hasActiveMessages = (activeSession?.messages ?? []).length > 0;
  const providerOptions = SUPPORTED_PROVIDERS;
  const availableModels = draftConfig
    ? PROVIDER_MODELS[draftConfig.provider] ?? []
    : [];
  const providerModalOption = providerOptions.find(
    (provider) => provider.value === providerModalProvider,
  ) ?? null;
  const providerModalModels = providerModalProvider
    ? PROVIDER_MODELS[providerModalProvider] ?? availableModels
    : [];
  const configDirty =
    config != null &&
    draftConfig != null &&
    JSON.stringify(config) !== JSON.stringify(draftConfig);
  const permissionModeLabel = mapPermissionMode(
    workspaceContext?.permissionMode ?? draftConfig?.permissionMode ?? "auto",
  );
  const modelLabel = activeSession?.model ?? draftConfig?.model ?? "No model";
  const gitBranchLabel = workspaceContext?.gitBranch ?? "No repo";
  const runtimeLabel = bridgeStatus?.healthy
    ? `${bridgeStatus.runtimeOwner ?? bridgeStatus.backend} ready`
    : `${bridgeStatus?.runtimeOwner ?? "runtime"} offline`;
  const currentTheme = draftConfig?.appearance ?? config?.appearance ?? "light";
  const activeSessionTitle = activeSession ? describeSession(activeSession) : "No active session";
  const activeAttention = activeSession ? attentionBySession[activeSession.sessionId] : null;

  async function startSession() {
    await runAction(async () => {
      const session = normalizeSession(await bridge.startSession());
      setActiveSession(session);
      setSessions((prev) => upsertSession(prev, session));
      setAttentionBySession((current) => {
        const next = { ...current };
        delete next[session.sessionId];
        return next;
      });
      ensureSessionWorkstream(session.sessionId);
      setStatus("Idle");
    }, "Failed to start session");
  }

  async function resumeSession(sessionId: string) {
    setResumingSessionId(sessionId);
    await runAction(async () => {
      try {
        const session = normalizeSession(await bridge.resumeSession(sessionId));
        setActiveSession(session);
        setSessions((prev) => upsertSession(prev, session));
        ensureSessionWorkstream(session.sessionId);
        setStatus("Idle");
      } finally {
        setResumingSessionId(null);
      }
    }, `Failed to resume ${sessionId}`);
  }

  async function submit() {
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

      setAttentionBySession((current) => {
        const next = { ...current };
        delete next[session.sessionId];
        return next;
      });
      setStatus("Thinking");
      setInput("");
      updateSessionWorkstream(session.sessionId, (current) => ({
        todos: createTurnTodos(prompt),
        toolRuns: current.toolRuns,
      }));

      const next = normalizeSession(await bridge.submitMessage(session.sessionId, prompt));
      setActiveSession(next);
      setSessions((prev) => upsertSession(prev, next));
    }, "Failed to send message");
  }

  async function saveSettings() {
    if (!draftConfig) {
      return;
    }

    await runAction(async () => {
      await bridge.saveConfig(draftConfig);
      setConfig(draftConfig);
      setWorkspaceContext((current) =>
        current
          ? {
              ...current,
              permissionMode: draftConfig.permissionMode ?? current.permissionMode,
            }
          : current,
      );
      setShowSettingsModal(false);
      setStatus("Idle");
      setActivity((prev) => [
        `Settings saved for ${draftConfig.provider} / ${draftConfig.model}.`,
        ...prev,
      ].slice(0, 10));
    }, "Failed to save settings");
  }

  async function answerHitl() {
    if (!activeHitlPrompt || !hitlAnswer.trim()) {
      return;
    }

    await runAction(async () => {
      await bridge.answerHitl(activeHitlPrompt.id, hitlAnswer.trim());
      const remaining = pendingHitlPrompts.slice(1);
      setPendingHitlPrompts(remaining);
      setHitlAnswer("");
      setStatus("Thinking");
      setAttentionBySession((current) => {
        const next = { ...current };
        const stillPending = remaining.some(
          (prompt) => prompt.sessionId === activeHitlPrompt.sessionId,
        );
        if (!stillPending) {
          delete next[activeHitlPrompt.sessionId];
        }
        return next;
      });
    }, "Failed to answer HITL prompt");
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
      const nextModel =
        current.providerConnections[provider]?.defaultModel ??
        nextModels[0]?.value ??
        current.model;

      return {
        ...current,
        provider,
        model: nextModel,
      };
    });
  }

  function openProviderModal(provider: string) {
    if (!draftConfig) {
      return;
    }

    setProviderModalProvider(provider);
    setProviderModalDraft({
      ...draftConfig.providerConnections[provider],
      defaultModel:
        draftConfig.providerConnections[provider]?.defaultModel ??
        PROVIDER_MODELS[provider]?.[0]?.value,
    });
  }

  function saveProviderModal() {
    if (!providerModalProvider || !draftConfig) {
      return;
    }

    updateDraftConfig((current) => ({
      ...current,
      providerConnections: {
        ...current.providerConnections,
        [providerModalProvider]: {
          ...current.providerConnections[providerModalProvider],
          ...providerModalDraft,
          connected: Boolean(providerModalDraft.apiKey || providerModalDraft.baseUrl),
        },
      },
    }));
    setProviderModalProvider(null);
  }

  function disconnectProvider(provider: string) {
    updateDraftConfig((current) => ({
      ...current,
      providerConnections: {
        ...current.providerConnections,
        [provider]: {
          ...current.providerConnections[provider],
          apiKey: undefined,
          baseUrl: undefined,
          connected: false,
        },
      },
    }));
    setProviderFeedback((current) => ({
      ...current,
      [provider]: {
        ok: true,
        message: `${provider} disconnected.`,
      },
    }));
  }

  async function testProviderConnection(provider: string) {
    if (!draftConfig) {
      return;
    }

    setTestingProvider(provider);
    await runAction(async () => {
      const result = await bridge.testProviderConnection(
        provider,
        draftConfig.providerConnections[provider] ?? {},
      );
      setProviderFeedback((current) => ({
        ...current,
        [provider]: result,
      }));
      if (result.ok) {
        updateDraftConfig((current) => ({
          ...current,
          providerConnections: {
            ...current.providerConnections,
            [provider]: {
              ...current.providerConnections[provider],
              connected: true,
            },
          },
        }));
      }
    }, `Failed to test ${provider} connection`);
    setTestingProvider(null);
  }

  async function checkForUpdates() {
    setCheckingUpdates(true);
    await runAction(async () => {
      setUpdateResult(await bridge.checkForUpdates());
    }, "Failed to check for updates");
    setCheckingUpdates(false);
  }

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
    if (!conversationRef.current) {
      return;
    }

    requestAnimationFrame(() => {
      conversationRef.current?.scrollTo({
        top: conversationRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  function focusComposer() {
    requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  }

  function runAction(action: () => Promise<void>, context: string) {
    retryActionRef.current = action;
    return action()
      .then(() => {
        retryActionRef.current = null;
        setLastError(null);
        setStatus((current) => (current === "Error" ? "Idle" : current));
      })
      .catch((error) => {
        reportError(error, context);
      });
  }

  function reportError(error: unknown, context: string) {
    const message = error instanceof Error ? error.message : String(error);
    const nextError = `${context}: ${message}`;
    setLastError(nextError);
    setStatus("Error");
    setActivity((prev) => [`Error: ${nextError}`, ...prev].slice(0, 10));
  }

  function notifyForEvent(event: DesktopEvent) {
    if (!config) {
      return;
    }

    if (event.type === "hitl:permission" && config.notifications.permissions) {
      void sendSystemNotification("Agent needs approval", `Approve ${event.toolName} to continue.`);
    }
    if (event.type === "hitl:question" && config.notifications.permissions) {
      void sendSystemNotification("Agent needs an answer", event.question);
    }
    if (event.type === "session:error" && config.notifications.needsAttention) {
      void sendSystemNotification("Agent needs attention", event.message);
    }
    if (event.type === "session:completed" && config.notifications.completionSummary) {
      void sendSystemNotification("Agent completed its pass", "The current task is ready for review.");
    }
  }

  return (
    <div className="app-shell" data-theme={currentTheme}>
      <ShellSidebar
        expanded={sidebarExpanded}
        sessions={sessions}
        activeSessionId={activeSession?.sessionId}
        resumingSessionId={resumingSessionId}
        showAllSessions={showAllSessions}
        attentionBySession={attentionBySession}
        onToggleSidebar={() => setSidebarExpanded((current) => !current)}
        onStartSession={() => void startSession()}
        onResumeSession={(sessionId) => void resumeSession(sessionId)}
        onToggleShowAll={() => setShowAllSessions((current) => !current)}
        onOpenSettings={() => {
          setActiveSettingsSection("general");
          setShowSettingsModal(true);
        }}
        updateAvailable={Boolean(updateResult?.available)}
      />

      <main className="workspace-shell">
        <header className="thread-header">
          <div>
            <p className="thread-kicker">
              {isRestoringSession ? "Restoring saved thread" : "Current session"}
            </p>
            <h1>{activeSessionTitle}</h1>
          </div>
          <div className="thread-header__meta">
            {activeAttention ? <span className="header-attention">{activeAttention}</span> : null}
            <span className="header-status">{status}</span>
          </div>
        </header>

        <section className="conversation" ref={conversationRef}>
          {isRestoringSession ? (
            <article className="conversation-state conversation-state--loading">
              <strong>Restoring session conversation...</strong>
              <p>Pulling the latest thread state back into the workspace.</p>
            </article>
          ) : !activeSession ? (
            <article className="conversation-state">
              <strong>Pick up where you left off</strong>
              <p>Start a fresh session or resume a saved thread from the sidebar.</p>
            </article>
          ) : !hasActiveMessages ? (
            <article className="conversation-state">
              <strong>This session is ready for the next message.</strong>
              <p>Send a prompt below to kick off the agent workstream.</p>
            </article>
          ) : null}

          {(activeSession?.messages ?? []).map((message, index) => (
            <article
              key={`${message.role}-${index}-${message.content.slice(0, 16)}`}
              className={`bubble bubble-${message.role}`}
            >
              <span className="bubble-label">{message.role}</span>
              <p>{message.content}</p>
            </article>
          ))}

          {activeSession ? (
            <article className="work-card todo-card">
              <div className="work-card-header">
                <div>
                  <span className="eyebrow">Workstream</span>
                  <strong>Agent workstream</strong>
                </div>
                <span className="status-chip">{activeProgress}% complete</span>
              </div>
              <div className="todo-list">
                {activeWorkstream.todos.map((todo) => (
                  <div key={todo.id} className={`todo-step todo-step--${todo.state}`}>
                    <strong>{todo.label}</strong>
                    <div>
                      <span className="todo-state">{todo.state}</span>
                      <p>{todo.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {activeWorkstream.toolRuns.map((toolRun) => (
            <article
              key={toolRun.id}
              className={`work-card tool-card tool-card--${toolRun.status}`}
            >
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
              <pre className="tool-args">{JSON.stringify(toolRun.args, null, 2)}</pre>
              {toolRun.result ? <p className="tool-result">{toolRun.result}</p> : null}
            </article>
          ))}
        </section>

        {activeHitlPrompt ? (
          <section className="hitl-card">
            <div className="work-card-header">
              <div>
                <span className="eyebrow">Action required</span>
                <strong>
                  {activeHitlPrompt.type === "question"
                    ? activeHitlPrompt.question
                    : `Approve ${activeHitlPrompt.toolName}`}
                </strong>
              </div>
              <span className="status-chip status-chip--error">
                Pending prompts: {pendingHitlPrompts.length}
              </span>
            </div>
            {activeHitlPrompt.type === "permission" ? (
              <pre className="tool-args">{JSON.stringify(activeHitlPrompt.args, null, 2)}</pre>
            ) : null}
            <textarea
              className="composer-input"
              value={hitlAnswer}
              onChange={(event) => setHitlAnswer(event.target.value)}
              placeholder="Type your answer or approval..."
              rows={3}
            />
            <div className="composer-actions">
              <button type="button" className="primary-button" onClick={() => void answerHitl()}>
                Submit Answer
              </button>
            </div>
          </section>
        ) : null}

        <section className="composer-shell">
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <textarea
              ref={composerInputRef}
              className="composer-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask Joone to inspect, edit, run, or explain..."
              rows={4}
            />
            <div className="composer-actions">
              <button type="submit" className="primary-button">
                Send
              </button>
            </div>
          </form>

          <ComposerFooter
            modelLabel={modelLabel}
            permissionLabel={permissionModeLabel}
            gitBranchLabel={gitBranchLabel}
            runtimeLabel={runtimeLabel}
            onOpenProviders={() => {
              setActiveSettingsSection("providers");
              setShowSettingsModal(true);
            }}
            onOpenGeneral={() => {
              setActiveSettingsSection("general");
              setShowSettingsModal(true);
            }}
          />
        </section>
      </main>

      {lastError ? (
        <div className="toast-stack">
          <div className="toast">
            <strong>Last error</strong>
            <p>{lastError}</p>
            <div className="toast-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  const retry = retryActionRef.current;
                  if (retry) {
                    void runAction(retry, "Retry failed");
                  }
                }}
              >
                Retry last action
              </button>
              <button
                type="button"
                className="ghost-link"
                onClick={() => setLastError(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <SettingsModal
        open={showSettingsModal}
        section={activeSettingsSection}
        draftConfig={draftConfig}
        providerOptions={providerOptions}
        availableModels={availableModels}
        configDirty={configDirty}
        checkingUpdates={checkingUpdates}
        testingProvider={testingProvider}
        updateResult={updateResult}
        providerFeedback={providerFeedback}
        onClose={() => setShowSettingsModal(false)}
        onSave={() => void saveSettings()}
        onSetSection={setActiveSettingsSection}
        onDraftChange={updateDraftConfig}
        onSyncProvider={syncDraftProvider}
        onOpenProviderModal={openProviderModal}
        onDisconnectProvider={disconnectProvider}
        onTestProvider={(provider) => void testProviderConnection(provider)}
        onCheckUpdates={() => void checkForUpdates()}
      />

      <ProviderConnectionModal
        provider={providerModalOption}
        connection={providerModalDraft}
        models={providerModalModels}
        onClose={() => setProviderModalProvider(null)}
        onChange={(patch) =>
          setProviderModalDraft((current) => ({
            ...current,
            ...patch,
          }))
        }
        onSave={saveProviderModal}
      />
    </div>
  );
}

async function hydrateShell(
  bridge: DesktopBridge,
  setConfig: (config: DesktopConfig) => void,
  setDraftConfig: (config: DesktopConfig) => void,
  setBridgeStatus: (status: DesktopBridgeStatus) => void,
  setWorkspaceContext: (workspace: DesktopWorkspaceContext) => void,
  setSessions: (sessions: DesktopSessionSnapshot[]) => void,
  setActivity: React.Dispatch<React.SetStateAction<string[]>>,
) {
  const [bridgeStatus, workspaceContext, config, sessions] = await Promise.all([
    bridge.getStatus(),
    bridge.getWorkspaceContext(),
    bridge.loadConfig(),
    bridge.listSessions(),
  ]);

  setConfig(config);
  setDraftConfig(config);
  setBridgeStatus(bridgeStatus);
  setWorkspaceContext(workspaceContext);
  setSessions(sessions.map((session) => normalizeSession(session)));
  setActivity([
    `Desktop shell ready via ${bridgeStatus.mode} bridge (${bridgeStatus.backend}).`,
  ]);
}

async function sendSystemNotification(title: string, body: string) {
  if (typeof Notification === "undefined") {
    return;
  }

  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }

  if (Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

function emptyWorkstream(): SessionWorkstream {
  return {
    todos: [
      {
        id: "request",
        label: "Review request",
        note: "Waiting for the next instruction.",
        state: "pending",
      },
      {
        id: "tools",
        label: "Run tools",
        note: "No tool calls have started yet.",
        state: "pending",
      },
      {
        id: "response",
        label: "Draft response",
        note: "No response in progress.",
        state: "pending",
      },
    ],
    toolRuns: [],
  };
}

function createTurnTodos(prompt: string): WorkTodo[] {
  return [
    {
      id: "request",
      label: "Review request",
      note: summarizeText(prompt, 90),
      state: "done",
    },
    {
      id: "tools",
      label: "Run tools",
      note: "Preparing the right tool sequence.",
      state: "active",
    },
    {
      id: "response",
      label: "Draft response",
      note: "Waiting for tool results.",
      state: "pending",
    },
  ];
}

function setTodoState(
  todos: WorkTodo[],
  id: WorkTodo["id"],
  state: WorkTodoState,
  note: string,
): WorkTodo[] {
  return todos.map((todo) => (todo.id === id ? { ...todo, state, note } : todo));
}

function completeTurnTodos(todos: WorkTodo[], toolRuns: ToolRunCard[]): WorkTodo[] {
  const hadToolFailure = toolRuns.some((toolRun) => toolRun.status === "error");

  return todos.map((todo) => {
    if (todo.id === "tools") {
      return {
        ...todo,
        state: hadToolFailure ? "blocked" : "done",
        note: hadToolFailure ? "A tool run needs review." : "Tool activity wrapped up cleanly.",
      };
    }

    if (todo.id === "response") {
      return {
        ...todo,
        state: hadToolFailure ? "blocked" : "done",
        note: hadToolFailure
          ? "The response was interrupted by a runtime issue."
          : "Response is ready for review.",
      };
    }

    return todo;
  });
}

function getTodoProgress(todos: WorkTodo[]): number {
  const completed = todos.filter((todo) => todo.state === "done").length;
  return Math.round((completed / todos.length) * 100);
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
        status: "success" as const,
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

function normalizeSession(session: DesktopSessionSnapshot): DesktopSessionSnapshot {
  return {
    ...session,
    description: session.description ?? describeSession(session),
    messages: session.messages ?? [],
    metrics: session.metrics ?? {
      totalTokens: 0,
      cacheHitRate: 0,
      toolCallCount: 0,
      turnCount: 0,
      totalCost: 0,
    },
  };
}

function upsertSession(
  sessions: DesktopSessionSnapshot[],
  incoming: DesktopSessionSnapshot,
): DesktopSessionSnapshot[] {
  const next = sessions.filter((session) => session.sessionId !== incoming.sessionId);
  return [incoming, ...next].sort(
    (left, right) => (right.lastSavedAt ?? 0) - (left.lastSavedAt ?? 0),
  );
}

function describeSession(session: DesktopSessionSnapshot): string {
  const label = session.description?.trim();
  if (label) {
    return label;
  }

  return session.sessionId;
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
    case "agent:token":
      return "Streaming response";
    case "tool:start":
      return `Running ${event.toolName}`;
    case "tool:end":
      return `${event.toolName} finished`;
    case "hitl:question":
      return "Awaiting answer";
    case "hitl:permission":
      return `Awaiting approval for ${event.toolName}`;
    case "session:state":
      return `State updated for ${event.sessionId}`;
    default:
      return event.type;
  }
}

function capitalizeStatus(status: "idle" | "processing" | "closed"): string {
  if (status === "processing") {
    return "Thinking";
  }

  return status[0].toUpperCase() + status.slice(1);
}

function summarizeText(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function mapPermissionMode(value: "auto" | "ask_all" | "ask_dangerous"): string {
  if (value === "ask_all") {
    return "Human in the loop";
  }
  if (value === "ask_dangerous") {
    return "Ask for dangerous actions";
  }
  return "Full access";
}
