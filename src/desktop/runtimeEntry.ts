import * as os from "node:os";
import * as path from "node:path";
import { JooneRuntimeService } from "../runtime/service.js";
import { createDesktopRuntimeServer } from "./server.js";

const port = Number(process.env.JOONE_DESKTOP_RUNTIME_PORT ?? "3311");
const cwd = process.env.JOONE_DESKTOP_WORKSPACE ?? process.cwd();
const configPath = path.join(os.homedir(), ".joone", "config.json");

// This entrypoint is used by the packaged Tauri app's bundled Node sidecar.
// It exposes the same HTTP/SSE runtime surface that the local desktop web dev
// flow uses, but under desktop-owned process lifecycle management.
const runtime = new JooneRuntimeService({
  configPath,
  cwd,
});

const server = await createDesktopRuntimeServer({
  runtime,
  port,
});

console.log(`JOONE_RUNTIME_READY ${server.url}`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
