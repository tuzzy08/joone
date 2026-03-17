import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  DesktopBridge,
  DesktopConfig,
  DesktopEvent,
  DesktopSessionSnapshot,
} from "./types";

export function createTauriDesktopBridge(): DesktopBridge {
  return {
    async loadConfig() {
      return invoke<DesktopConfig>("runtime_load_config");
    },
    async saveConfig(config) {
      await invoke("runtime_save_config", { config });
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
      await invoke("runtime_close_session", { sessionId });
    },
    subscribe(sessionId, listener) {
      const unlistenPromises = [
        listen<DesktopEvent>("session:started", (event) => {
          if (event.payload.sessionId === sessionId) {
            listener(event.payload);
          }
        }),
        listen<DesktopEvent>("session:state", (event) => {
          if (event.payload.sessionId === sessionId) {
            listener(event.payload);
          }
        }),
        listen<DesktopEvent>("agent:token", (event) => {
          if (event.payload.sessionId === sessionId) {
            listener(event.payload);
          }
        }),
        listen<DesktopEvent>("session:completed", (event) => {
          if (event.payload.sessionId === sessionId) {
            listener(event.payload);
          }
        }),
      ];

      return () => {
        void Promise.all(unlistenPromises).then((unlisteners) => {
          for (const unlisten of unlisteners) {
            unlisten();
          }
        });
      };
    },
  };
}
