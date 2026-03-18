import { afterEach, describe, expect, it } from "vitest";
import { createDesktopRuntimeServer } from "../../src/desktop/server.js";

describe("Desktop runtime server", () => {
  const closers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (closers.length > 0) {
      const close = closers.pop();
      if (close) {
        await close();
      }
    }
  });

  it("serves health and runtime-backed config/session routes", async () => {
    const server = await createDesktopRuntimeServer({
      runtime: {
        async loadConfig() {
          return {
            provider: "anthropic",
            model: "claude-sonnet-4-20250514",
            streaming: true,
          };
        },
        async saveConfig() {
          return;
        },
        async listSessions() {
          return [];
        },
        async startSession() {
          return {
            sessionId: "desktop-server-session",
            provider: "anthropic",
            model: "claude-sonnet-4-20250514",
            messages: [],
            metrics: {
              totalTokens: 0,
              cacheHitRate: 0,
              toolCallCount: 0,
              turnCount: 0,
              totalCost: 0,
            },
          };
        },
        async resumeSession(sessionId: string) {
          return {
            sessionId,
            provider: "anthropic",
            model: "claude-sonnet-4-20250514",
            messages: [],
            metrics: {
              totalTokens: 0,
              cacheHitRate: 0,
              toolCallCount: 0,
              turnCount: 0,
              totalCost: 0,
            },
          };
        },
        async submitMessage(sessionId: string, text: string) {
          return {
            sessionId,
            provider: "anthropic",
            model: "claude-sonnet-4-20250514",
            messages: [{ role: "user", content: text }],
            metrics: {
              totalTokens: text.length,
              cacheHitRate: 0,
              toolCallCount: 0,
              turnCount: 1,
              totalCost: 0,
            },
          };
        },
        async closeSession() {
          return;
        },
        subscribe() {
          return () => {};
        },
      },
    });

    closers.push(server.close);

    const health = await fetch(`${server.url}/health`);
    expect(await health.json()).toEqual({ ok: true });

    const config = await fetch(`${server.url}/config`);
    expect(await config.json()).toMatchObject({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    });

    const session = await fetch(`${server.url}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(await session.json()).toMatchObject({
      sessionId: "desktop-server-session",
    });
  });
});
