import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function resolveNpmCliPath(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (environment.npm_execpath) {
    return environment.npm_execpath;
  }

  // NVM on Windows ships npm alongside the active Node install even when the
  // npm package is not resolvable from the project itself.
  const bundledPath = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }

  const npmPackageJson = require.resolve("npm/package.json");
  return path.join(path.dirname(npmPackageJson), "bin", "npm-cli.js");
}
