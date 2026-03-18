import express from "express";
import { createServer } from "node:http";
import type { Request, Response } from "express";
import type { RuntimeEvent } from "../runtime/types.js";

interface RuntimeLike {
  loadConfig(): Promise<unknown>;
  saveConfig(config: unknown): Promise<void>;
  listSessions(): Promise<unknown>;
  startSession(): Promise<unknown>;
  resumeSession(sessionId: string): Promise<unknown>;
  submitMessage(sessionId: string, text: string): Promise<unknown>;
  closeSession(sessionId: string): Promise<void>;
  subscribe(sessionId: string, listener: (event: RuntimeEvent) => void): () => void;
}

interface CreateDesktopRuntimeServerOptions {
  runtime: RuntimeLike;
  port?: number;
}

export async function createDesktopRuntimeServer({
  runtime,
  port = 0,
}: CreateDesktopRuntimeServerOptions) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_request: Request, response: Response) => {
    response.json({ ok: true });
  });

  app.get("/config", async (_request: Request, response: Response) => {
    response.json(await runtime.loadConfig());
  });

  app.post("/config", async (request: Request, response: Response) => {
    await runtime.saveConfig(request.body);
    response.status(204).end();
  });

  app.get("/sessions", async (_request: Request, response: Response) => {
    response.json(await runtime.listSessions());
  });

  app.post("/sessions", async (_request: Request, response: Response) => {
    response.json(await runtime.startSession());
  });

  app.post("/sessions/:sessionId/resume", async (request: Request, response: Response) => {
    response.json(await runtime.resumeSession(asSessionId(request.params.sessionId)));
  });

  app.post("/sessions/:sessionId/messages", async (request: Request, response: Response) => {
    response.json(
      await runtime.submitMessage(asSessionId(request.params.sessionId), request.body.text),
    );
  });

  app.delete("/sessions/:sessionId", async (request: Request, response: Response) => {
    await runtime.closeSession(asSessionId(request.params.sessionId));
    response.status(204).end();
  });

  app.get("/sessions/:sessionId/events", (request: Request, response: Response) => {
    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache");
    response.setHeader("Connection", "keep-alive");
    response.flushHeaders();

    const unsubscribe = runtime.subscribe(asSessionId(request.params.sessionId), (event) => {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    request.on("close", () => {
      unsubscribe();
      response.end();
    });
  });

  const server = createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve desktop runtime server address");
  }

  return {
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

function asSessionId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}
