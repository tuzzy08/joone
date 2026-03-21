import React from "react";
import type {
  DesktopConfig,
  DesktopProviderConnectionResult,
  DesktopUpdateCheckResult,
} from "../bridge/types";
import type { ModelOption, ProviderOption } from "../../../src/desktop/providerCatalog.js";

type SettingsSection = "general" | "providers";

interface SettingsModalProps {
  open: boolean;
  section: SettingsSection;
  draftConfig: DesktopConfig | null;
  providerOptions: ProviderOption[];
  availableModels: ModelOption[];
  configDirty: boolean;
  checkingUpdates: boolean;
  testingProvider: string | null;
  updateResult: DesktopUpdateCheckResult | null;
  providerFeedback: Record<string, DesktopProviderConnectionResult>;
  onClose: () => void;
  onSave: () => void;
  onSetSection: (section: SettingsSection) => void;
  onDraftChange: (
    patch: Partial<DesktopConfig> | ((current: DesktopConfig) => DesktopConfig),
  ) => void;
  onSyncProvider: (provider: string) => void;
  onOpenProviderModal: (provider: string) => void;
  onDisconnectProvider: (provider: string) => void;
  onTestProvider: (provider: string) => void;
  onCheckUpdates: () => void;
}

export function SettingsModal({
  open,
  section,
  draftConfig,
  providerOptions,
  availableModels,
  configDirty,
  checkingUpdates,
  testingProvider,
  updateResult,
  providerFeedback,
  onClose,
  onSave,
  onSetSection,
  onDraftChange,
  onSyncProvider,
  onOpenProviderModal,
  onDisconnectProvider,
  onTestProvider,
  onCheckUpdates,
}: SettingsModalProps) {
  if (!open || !draftConfig) {
    return null;
  }

  return (
    <div className="settings-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
      >
        <aside className="settings-nav">
          <div>
            <p className="settings-nav__kicker">Control center</p>
            <h2>Settings</h2>
          </div>
          <button
            type="button"
            className={`settings-nav__item ${section === "general" ? "is-active" : ""}`}
            onClick={() => onSetSection("general")}
          >
            General
          </button>
          <button
            type="button"
            className={`settings-nav__item ${section === "providers" ? "is-active" : ""}`}
            onClick={() => onSetSection("providers")}
          >
            Providers
          </button>
        </aside>

        <div className="settings-content">
          <header className="settings-content__header">
            <div>
              <p className="settings-content__eyebrow">
                {section === "general" ? "Appearance and behavior" : "Provider management"}
              </p>
              <h3>{section === "general" ? "General" : "Providers"}</h3>
            </div>
            <button type="button" className="modal-close" onClick={onClose}>
              Close
            </button>
          </header>

          {section === "general" ? (
            <section className="settings-section settings-form">
              <div className="settings-row">
                <div>
                  <strong>Appearance</strong>
                  <p>Choose a focused desktop theme.</p>
                </div>
                <div className="appearance-switch">
                  <button
                    type="button"
                    className={draftConfig.appearance === "light" ? "is-selected" : ""}
                    onClick={() => onDraftChange({ appearance: "light" })}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    className={draftConfig.appearance === "dark" ? "is-selected" : ""}
                    onClick={() => onDraftChange({ appearance: "dark" })}
                  >
                    Dark
                  </button>
                </div>
              </div>

              <div className="settings-row">
                <div>
                  <strong>Permission level</strong>
                  <p>Choose between full access and human review.</p>
                </div>
                <select
                  className="input"
                  value={draftConfig.permissionMode ?? "auto"}
                  onChange={(event) =>
                    onDraftChange({
                      permissionMode: event.target.value as DesktopConfig["permissionMode"],
                    })
                  }
                >
                  <option value="auto">Full access</option>
                  <option value="ask_all">Human in the loop</option>
                  <option value="ask_dangerous">Ask for dangerous actions</option>
                </select>
              </div>

              <label className="toggle-row">
                <span>
                  <strong>Stream responses</strong>
                  <p>Render tokens in real time while the agent works.</p>
                </span>
                <input
                  type="checkbox"
                  checked={draftConfig.streaming}
                  onChange={(event) =>
                    onDraftChange({ streaming: event.target.checked })
                  }
                />
              </label>

              <label className="toggle-row">
                <span>
                  <strong>Permission request notifications</strong>
                  <p>Show a system notification when the agent asks for approval.</p>
                </span>
                <input
                  type="checkbox"
                  checked={draftConfig.notifications.permissions}
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      notifications: {
                        ...current.notifications,
                        permissions: event.target.checked,
                      },
                    }))
                  }
                />
              </label>

              <label className="toggle-row">
                <span>
                  <strong>Completion summaries</strong>
                  <p>Show a brief system notification when the agent finishes a task.</p>
                </span>
                <input
                  type="checkbox"
                  checked={draftConfig.notifications.completionSummary}
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      notifications: {
                        ...current.notifications,
                        completionSummary: event.target.checked,
                      },
                    }))
                  }
                />
              </label>

              <label className="toggle-row">
                <span>
                  <strong>Needs-attention alerts</strong>
                  <p>Notify when the agent blocks on an error or a required answer.</p>
                </span>
                <input
                  type="checkbox"
                  checked={draftConfig.notifications.needsAttention}
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      notifications: {
                        ...current.notifications,
                        needsAttention: event.target.checked,
                      },
                    }))
                  }
                />
              </label>

              <div className="settings-row">
                <div>
                  <strong>Updates</strong>
                  <p>Automatically check GitHub releases for desktop updates.</p>
                </div>
                <label className="toggle-inline">
                  <input
                    type="checkbox"
                    checked={draftConfig.updates.autoCheck}
                    onChange={(event) =>
                      onDraftChange((current) => ({
                        ...current,
                        updates: {
                          ...current.updates,
                          autoCheck: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>Automatically check for updates</span>
                </label>
              </div>

              <div className="settings-row settings-row--stacked">
                <div>
                  <strong>Update status</strong>
                  <p>Check whether a newer packaged desktop build is available.</p>
                </div>
                <div className="update-actions">
                  <button type="button" className="secondary-button" onClick={onCheckUpdates}>
                    {checkingUpdates ? "Checking..." : "Check for updates"}
                  </button>
                  {updateResult ? (
                    <div className="update-result">
                      <strong>{updateResult.available ? "Update available" : "Up to date"}</strong>
                      <p>{updateResult.message}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : (
            <section className="settings-section provider-grid">
              {providerOptions.map((provider) => {
                const connection = draftConfig.providerConnections[provider.value] ?? {};
                const isConnected = Boolean(connection.connected);
                const feedback = providerFeedback[provider.value];
                const models = provider.value === draftConfig.provider
                  ? availableModels
                  : [];

                return (
                  <article key={provider.value} className="provider-card">
                    <div className="provider-card__header">
                      <div>
                        <strong>{provider.label}</strong>
                        <p>{provider.hint}</p>
                      </div>
                      <span className={`provider-status ${isConnected ? "is-connected" : ""}`}>
                        {isConnected ? "Connected" : "Disconnected"}
                      </span>
                    </div>

                    <div className="settings-row">
                      <div>
                        <strong>Active model</strong>
                        <p>Choose the default model for this provider.</p>
                      </div>
                      <select
                        className="input"
                        value={connection.defaultModel ?? draftConfig.model}
                        onChange={(event) => {
                          const nextModel = event.target.value;
                          onDraftChange((current) => ({
                            ...current,
                            provider: provider.value === current.provider ? provider.value : current.provider,
                            model:
                              provider.value === current.provider ? nextModel : current.model,
                            providerConnections: {
                              ...current.providerConnections,
                              [provider.value]: {
                                ...current.providerConnections[provider.value],
                                defaultModel: nextModel,
                              },
                            },
                          }));
                          if (draftConfig.provider !== provider.value) {
                            onSyncProvider(provider.value);
                          }
                        }}
                      >
                        {(models.length > 0 ? models : availableModels).map((model) => (
                          <option key={model.value} value={model.value}>
                            {model.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="provider-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => onOpenProviderModal(provider.value)}
                      >
                        {isConnected ? "Edit connection" : "Connect provider"}
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => onTestProvider(provider.value)}
                      >
                        {testingProvider === provider.value ? "Testing..." : "Test connection"}
                      </button>
                      <button
                        type="button"
                        className="ghost-link"
                        onClick={() => onDisconnectProvider(provider.value)}
                        disabled={!connection.apiKey && !connection.baseUrl && !connection.connected}
                      >
                        Disconnect
                      </button>
                    </div>

                    {feedback ? (
                      <p className={`provider-feedback ${feedback.ok ? "is-success" : "is-error"}`}>
                        {feedback.message}
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </section>
          )}

          <footer className="settings-footer">
            <button type="button" className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={onSave}
              disabled={!configDirty}
            >
              Save Settings
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
