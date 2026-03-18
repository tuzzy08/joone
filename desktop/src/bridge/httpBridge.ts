import type {
  DesktopBridge,
  DesktopConfig,
  DesktopEvent,
  DesktopSessionSnapshot,
} from "./types";

export function createHttpDesktopBridge(baseUrl: string): DesktopBridge {
  return {
    async loadConfig() {
      return getJson<DesktopConfig>(`${baseUrl}/config`);
    },
    async saveConfig(config) {
      await fetch(`${baseUrl}/config`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(config),
      });
    },
    async listSessions() {
      return getJson<DesktopSessionSnapshot[]>(`${baseUrl}/sessions`);
    },
    async startSession() {
      return postJson<DesktopSessionSnapshot>(`${baseUrl}/sessions`, {});
    },
    async resumeSession(sessionId) {
      return postJson<DesktopSessionSnapshot>(
        `${baseUrl}/sessions/${sessionId}/resume`,
        {},
      );
    },
    async submitMessage(sessionId, text) {
      return postJson<DesktopSessionSnapshot>(
        `${baseUrl}/sessions/${sessionId}/messages`,
        { text },
      );
    },
    async closeSession(sessionId) {
      await fetch(`${baseUrl}/sessions/${sessionId}`, { method: "DELETE" });
    },
    subscribe(sessionId, listener) {
      const source = new EventSource(`${baseUrl}/sessions/${sessionId}/events`);
      source.onmessage = (event) => {
        listener(JSON.parse(event.data) as DesktopEvent);
      };
      return () => source.close();
    },
  };
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  return response.json();
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}
