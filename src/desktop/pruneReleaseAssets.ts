import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";

import { isDirectDesktopScriptExecution } from "./cliEntry.js";

interface ReleaseAsset {
  id: number;
  name: string;
}

interface ReleaseViewResponse {
  assets?: ReleaseAsset[];
}

export type ReleasePruneExecutor = (
  command: string,
  args: string[],
  options: ExecFileSyncOptionsWithStringEncoding,
) => string;

interface PruneDesktopReleaseAssetsOptions {
  rootDir?: string;
  tag: string;
  keepPrefix: string;
  exec?: ReleasePruneExecutor;
}

const buildExecOptions = (
  rootDir: string,
): ExecFileSyncOptionsWithStringEncoding => ({
  cwd: rootDir,
  encoding: "utf8",
  stdio: "pipe",
});

export const pruneDesktopReleaseAssets = ({
  rootDir = process.cwd(),
  tag,
  keepPrefix,
  exec = execFileSync,
}: PruneDesktopReleaseAssetsOptions): string[] => {
  let response: ReleaseViewResponse;

  try {
    response = JSON.parse(
      exec("gh", ["release", "view", tag, "--json", "assets"], buildExecOptions(rootDir)),
    ) as ReleaseViewResponse;
  } catch {
    return [];
  }

  const assets = response.assets ?? [];
  const staleAssets = assets.filter((asset) => !asset.name.startsWith(keepPrefix));

  for (const asset of staleAssets) {
    exec(
      "gh",
      ["release", "delete-asset", tag, String(asset.id), "--yes"],
      buildExecOptions(rootDir),
    );
  }

  return staleAssets.map((asset) => asset.name);
};

const parseTagArg = (): string => {
  const tagFlagIndex = process.argv.indexOf("--tag");
  const tagValue = tagFlagIndex >= 0 ? process.argv[tagFlagIndex + 1] : undefined;

  if (!tagValue) {
    throw new Error("Missing required --tag value.");
  }

  return tagValue;
};

const parseKeepPrefixArg = (): string => {
  const prefixFlagIndex = process.argv.indexOf("--keep-prefix");
  const prefixValue =
    prefixFlagIndex >= 0 ? process.argv[prefixFlagIndex + 1] : undefined;

  if (!prefixValue) {
    throw new Error("Missing required --keep-prefix value.");
  }

  return prefixValue;
};

if (isDirectDesktopScriptExecution(import.meta.url)) {
  const deleted = pruneDesktopReleaseAssets({
    tag: parseTagArg(),
    keepPrefix: parseKeepPrefixArg(),
  });

  for (const asset of deleted) {
    console.log(asset);
  }
}
