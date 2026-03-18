import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createHttpDesktopBridge } from "./httpBridge";
import type {
  DesktopBridge,
  DesktopBridgeStatus,
  DesktopConfig,
  DesktopEvent,
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
      let subscribed = false;

      // Tauri mode receives runtime SSE traffic via native events instead of
      // exposing the HTTP stream directly to the frontend.
      void listen(`runtime-event:${sessionId}`, (event) => {
        listener(event.payload as DesktopEvent);
      }).then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        activeUnsubscribe = unlisten;
      });

      void invoke("runtime_subscribe_session", {
        sessionId,
      }).then(() => {
        if (cancelled) {
          void invoke("runtime_unsubscribe_session", { sessionId });
          return;
        }
        subscribed = true;
      });

      return () => {
        cancelled = true;
        if (subscribed) {
          void invoke("runtime_unsubscribe_session", { sessionId });
        }
        activeUnsubscribe?.();
      };
    },
  };
}
