import React from "react";
import type { DesktopProviderConnection } from "../bridge/types";
import type { ModelOption, ProviderOption } from "../../../src/desktop/providerCatalog.js";

interface ProviderConnectionModalProps {
  provider: ProviderOption | null;
  connection: DesktopProviderConnection;
  models: ModelOption[];
  onClose: () => void;
  onChange: (patch: Partial<DesktopProviderConnection>) => void;
  onSave: () => void;
}

export function ProviderConnectionModal({
  provider,
  connection,
  models,
  onClose,
  onChange,
  onSave,
}: ProviderConnectionModalProps) {
  if (!provider) {
    return null;
  }

  const usesBaseUrl = provider.value === "ollama";

  return (
    <div className="settings-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="provider-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${provider.label} connection`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="provider-modal__header">
          <div>
            <p className="settings-content__eyebrow">Provider setup</p>
            <h3>{provider.label}</h3>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            Close
          </button>
        </header>

        <div className="provider-modal__body">
          {usesBaseUrl ? (
            <label className="settings-row settings-row--stacked">
              <span>
                <strong>Base URL</strong>
                <p>Point Joone at your local Ollama server.</p>
              </span>
              <input
                className="input"
                value={connection.baseUrl ?? ""}
                onChange={(event) => onChange({ baseUrl: event.target.value })}
                placeholder="http://127.0.0.1:11434"
              />
            </label>
          ) : (
            <label className="settings-row settings-row--stacked">
              <span>
                <strong>API key</strong>
                <p>Saved in the Joone config for this provider.</p>
              </span>
              <input
                className="input"
                type="password"
                value={connection.apiKey ?? ""}
                onChange={(event) => onChange({ apiKey: event.target.value })}
                placeholder={`Paste your ${provider.label} API key`}
              />
            </label>
          )}

          <label className="settings-row settings-row--stacked">
            <span>
              <strong>Default model</strong>
              <p>Used when this provider becomes active.</p>
            </span>
            <select
              className="input"
              value={connection.defaultModel ?? models[0]?.value ?? ""}
              onChange={(event) => onChange({ defaultModel: event.target.value })}
            >
              {models.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <footer className="provider-modal__footer">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary-button" onClick={onSave}>
            Save provider
          </button>
        </footer>
      </div>
    </div>
  );
}
