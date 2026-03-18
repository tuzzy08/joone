import { spawn } from "node:child_process";
import { resolveNpmCliPath } from "./npmCli.js";

const nodeExec = process.execPath;
const npmCli = resolveNpmCliPath();

const runtime = spawn(nodeExec, [npmCli, "run", "desktop:runtime:dev"], {
  stdio: "inherit",
  env: process.env,
});

const web = spawn(
  nodeExec,
  [npmCli, "exec", "--", "vite", "--config", "desktop/vite.config.ts", "--host", "0.0.0.0", "--port", "1420"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_JOONE_DESKTOP_API_URL: "http://127.0.0.1:3011",
    },
  },
);

const shutdown = () => {
  runtime.kill();
  web.kill();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

runtime.on("exit", (code) => {
  if (code && code !== 0) {
    web.kill();
    process.exit(code);
  }
});

web.on("exit", (code) => {
  runtime.kill();
  process.exit(code ?? 0);
});
