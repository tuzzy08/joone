import { invoke } from "@tauri-apps/api/core";
import { createHttpDesktopBridge } from "./httpBridge";
import type { DesktopBridge, DesktopBridgeStatus, DesktopConfig } from "./types";

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
      return (await getBridge()).listSessions();
    },
    async startSession() {
      return (await getBridge()).startSession();
    },
    async resumeSession(sessionId) {
      return (await getBridge()).resumeSession(sessionId);
    },
    async submitMessage(sessionId, text) {
      return (await getBridge()).submitMessage(sessionId, text);
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
