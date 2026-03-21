import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const runtimeEntry = path.join(projectRoot, "dist", "desktop", "runtimeEntry.js");
const binariesDir = path.join(projectRoot, "src-tauri", "binaries");

if (!fs.existsSync(runtimeEntry)) {
  throw new Error(
    `Missing compiled desktop runtime entry at ${runtimeEntry}. Run "npm run build" first.`,
  );
}

fs.mkdirSync(binariesDir, { recursive: true });

const targetTriple = resolveTargetTriple();
const extension = process.platform === "win32" ? ".exe" : "";
const destination = path.join(
  binariesDir,
  `node-runtime-${targetTriple}${extension}`,
);

fs.copyFileSync(process.execPath, destination);

if (process.platform !== "win32") {
  fs.chmodSync(destination, 0o755);
}

console.log(`Prepared packaged desktop runtime sidecar: ${destination}`);

function resolveTargetTriple(): string {
  if (process.platform === "win32" && process.arch === "x64") {
    return "x86_64-pc-windows-msvc";
  }
  if (process.platform === "win32" && process.arch === "arm64") {
    return "aarch64-pc-windows-msvc";
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "x86_64-unknown-linux-gnu";
  }
  if (process.platform === "linux" && process.arch === "arm64") {
    return "aarch64-unknown-linux-gnu";
  }
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "aarch64-apple-darwin";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "x86_64-apple-darwin";
  }

  throw new Error(`Unsupported desktop runtime target: ${process.platform}/${process.arch}`);
}
