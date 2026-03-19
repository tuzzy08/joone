import * as fs from "node:fs";
import * as path from "node:path";

export type DesktopBundlePlatform = "msi" | "appimage" | "dmg";
export type DesktopBundleRunner =
  | "windows-latest"
  | "ubuntu-22.04"
  | "macos-latest";

const RUNNER_TO_PLATFORM: Record<DesktopBundleRunner, DesktopBundlePlatform> = {
  "windows-latest": "msi",
  "ubuntu-22.04": "appimage",
  "macos-latest": "dmg",
};

const PLATFORM_GLOBS: Record<DesktopBundlePlatform, RegExp> = {
  msi: /\.msi$/i,
  appimage: /\.AppImage$/i,
  dmg: /\.dmg$/i,
};

interface ValidateDesktopBundlesOptions {
  rootDir?: string;
  runner: DesktopBundleRunner;
}

const collectFiles = (directory: string): string[] => {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(entryPath);
    }

    return [entryPath];
  });
};

export const validateDesktopBundles = ({
  rootDir = process.cwd(),
  runner,
}: ValidateDesktopBundlesOptions): string[] => {
  const platform = RUNNER_TO_PLATFORM[runner];
  const bundleDirectory = path.join(
    rootDir,
    "src-tauri",
    "target",
    "release",
    "bundle",
    platform,
  );
  const expectedPattern = PLATFORM_GLOBS[platform];
  const bundles = collectFiles(bundleDirectory).filter((filePath) =>
    expectedPattern.test(filePath),
  );

  if (bundles.length === 0) {
    throw new Error(
      `Expected at least one desktop ${platform} bundle in ${bundleDirectory} for ${runner}.`,
    );
  }

  return bundles;
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

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const bundles = validateDesktopBundles({ runner: parseRunnerArg() });
  for (const bundle of bundles) {
    console.log(bundle);
  }
}
