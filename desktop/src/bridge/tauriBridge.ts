import { invoke } from "@tauri-apps/api/core";
import { createHttpDesktopBridge } from "./httpBridge";
import type { DesktopBridge } from "./types";

export function createTauriDesktopBridge(): DesktopBridge {
  let bridgePromise: Promise<DesktopBridge> | undefined;

  const getBridge = () => {
    if (!bridgePromise) {
      bridgePromise = invoke<string>("runtime_base_url").then((baseUrl) =>
        createHttpDesktopBridge(baseUrl),
      );
    }

    return bridgePromise;
  };

  return {
    async loadConfig() {
      return (await getBridge()).loadConfig();
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
