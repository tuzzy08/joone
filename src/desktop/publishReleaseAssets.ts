import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";

import {
  validateDesktopBundles,
  type DesktopBundleRunner,
} from "./validateBundles.js";

export type ReleaseUploadExecutor = (
  command: string,
  args: string[],
  options: ExecFileSyncOptionsWithStringEncoding,
) => string;

interface PublishDesktopReleaseAssetsOptions {
  rootDir?: string;
  runner?: DesktopBundleRunner;
  tag: string;
  bundles?: string[];
  exec?: ReleaseUploadExecutor;
}

const resolveBundles = ({
  rootDir = process.cwd(),
  runner,
  bundles,
}: Pick<PublishDesktopReleaseAssetsOptions, "rootDir" | "runner" | "bundles">): string[] => {
  if (bundles && bundles.length > 0) {
    return bundles;
  }

  if (!runner) {
    throw new Error("publishDesktopReleaseAssets requires either bundles or runner.");
  }

  return validateDesktopBundles({ rootDir, runner });
};

export const publishDesktopReleaseAssets = ({
  rootDir = process.cwd(),
  runner,
  tag,
  bundles,
  exec = execFileSync,
}: PublishDesktopReleaseAssetsOptions): string[] => {
  const releaseBundles = resolveBundles({ rootDir, runner, bundles });

  exec("gh", ["release", "upload", tag, ...releaseBundles, "--clobber"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: "pipe",
  });

  return releaseBundles;
};

const parseTagArg = (): string => {
  const tagFlagIndex = process.argv.indexOf("--tag");
  const tagValue = tagFlagIndex >= 0 ? process.argv[tagFlagIndex + 1] : undefined;

  if (!tagValue) {
    throw new Error("Missing required --tag value.");
  }

  return tagValue;
};

const parseRunnerArg = (): DesktopBundleRunner => {
  const runnerFlagIndex = process.argv.indexOf("--runner");
  const runnerValue =
    runnerFlagIndex >= 0 ? process.argv[runnerFlagIndex + 1] : undefined;

  if (
    runnerValue === "windows-latest" ||
    runnerValue === "ubuntu-22.04" ||
    runnerValue === "macos-latest"
  ) {
    return runnerValue;
  }

  throw new Error(
    "Missing or unsupported --runner value. Expected one of windows-latest, ubuntu-22.04, macos-latest.",
  );
};

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const bundles = publishDesktopReleaseAssets({
    runner: parseRunnerArg(),
    tag: parseTagArg(),
  });

  for (const bundle of bundles) {
    console.log(bundle);
  }
}
