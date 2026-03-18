import { invoke } from "@tauri-apps/api/core";
import { createHttpDesktopBridge } from "./httpBridge";
import type {
  DesktopBridge,
  DesktopBridgeStatus,
  DesktopConfig,
  DesktopSessionSnapshot,
} from "./types";

export function createTauriDesktopBridge(): DesktopBridge {
  let bridgePromise: Promise<DesktopBridge> | undefined;
  let baseUrlPromise: Promise<string> | undefined;

  const getBridge = () => {
    if (!bridgePromise) {
      bridgePromise = getBaseUrl().then((baseUrl) => createHttpDesktopBridge(baseUrl));
    }

    return bridgePromise;
  };

  const getBaseUrl = () => {
    if (!baseUrlPromise) {
      baseUrlPromise = invoke<string>("runtime_base_url");
    }

    return baseUrlPromise;
  };

  return {
    async getStatus() {
      return invoke<DesktopBridgeStatus>("runtime_status");
    },
    async loadConfig() {
      return invoke<DesktopConfig>("runtime_load_config");
    },
    async saveConfig(config) {
      await (await getBridge()).saveConfig(config);
    },
    async listSessions() {
      return invoke<DesktopSessionSnapshot[]>("runtime_list_sessions");
    },
    async startSession() {
      return invoke<DesktopSessionSnapshot>("runtime_start_session");
    },
    async resumeSession(sessionId) {
      return invoke<DesktopSessionSnapshot>("runtime_resume_session", {
        sessionId,
      });
    },
    async submitMessage(sessionId, text) {
      return invoke<DesktopSessionSnapshot>("runtime_submit_message", {
        sessionId,
        text,
      });
    },
    async closeSession(sessionId) {
      await (await getBridge()).closeSession(sessionId);
    },
    subscribe(sessionId, listener) {
      let activeUnsubscribe: (() => void) | undefined;
      let cancelled = false;

      void getBridge().then((bridge) => {
        if (cancelled) {
          return;
        }
        activeUnsubscribe = bridge.subscribe(sessionId, listener);
      });

      return () => {
        cancelled = true;
        activeUnsubscribe?.();
      };
    },
  };
}
