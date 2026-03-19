import type { JooneRuntimeService } from "../runtime/service.js";

export const DESKTOP_RUNTIME_EVENTS = [
  "session:started",
  "session:state",
  "agent:token",
  "tool:start",
  "tool:end",
  "hitl:question",
  "hitl:permission",
  "session:error",
  "session:completed",
] as const;

export function createDesktopRuntimeBridge(runtime: JooneRuntimeService) {
  return {
    async loadConfig() {
      return runtime.loadConfig();
    },
    async saveConfig(config: Awaited<ReturnType<typeof runtime.loadConfig>>) {
      return runtime.saveConfig(config);
    },
    async answerHitl(id: string, answer: string) {
      return runtime.answerHitl(id, answer);
    },
    async listSessions() {
      return runtime.listSessions();
    },
    async startSession() {
      return runtime.startSession();
    },
    async resumeSession(sessionId: string) {
      return runtime.resumeSession(sessionId);
    },
    async submitMessage(sessionId: string, text: string) {
      return runtime.submitMessage(sessionId, text);
    },
    async cancelSession(sessionId: string) {
      return runtime.cancelSession(sessionId);
    },
    async closeSession(sessionId: string) {
      return runtime.closeSession(sessionId);
    },
    subscribe(sessionId: string, listener: Parameters<JooneRuntimeService["subscribe"]>[1]) {
      return runtime.subscribe(sessionId, listener);
    },
  };
}
