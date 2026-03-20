import * as path from "node:path";
import { pathToFileURL } from "node:url";

const toFileHref = (argvPath: string): string => {
  if (/^[A-Za-z]:[\\/]/.test(argvPath)) {
    return pathToFileURL(path.win32.resolve(argvPath)).href;
  }

  if (argvPath.startsWith("/")) {
    return new URL(argvPath, "file://").href;
  }

  return pathToFileURL(path.resolve(argvPath)).href;
};

export const isDirectDesktopScriptExecution = (
  moduleUrl: string,
  argvPath = process.argv[1],
): boolean => {
  if (!argvPath) {
    return false;
  }

  return moduleUrl === toFileHref(argvPath);
};
