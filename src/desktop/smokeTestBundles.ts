import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  validateDesktopBundles,
  type DesktopBundleRunner,
} from "./validateBundles.js";

export type InstallerSmokeExecutor = (
  command: string,
  args: string[],
  options: ExecFileSyncOptionsWithStringEncoding,
) => string;

interface SmokeTestDesktopBundlesOptions {
  rootDir?: string;
  runner: DesktopBundleRunner;
  exec?: InstallerSmokeExecutor;
}

const createSmokeDirectory = (runner: DesktopBundleRunner): string =>
  fs.mkdtempSync(path.join(os.tmpdir(), `joone-installer-smoke-${runner}-`));

const parseMacMountPoint = (attachOutput: string): string => {
  const lines = attachOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const mountLine = [...lines].reverse().find((line) => line.startsWith("/dev/"));

  if (!mountLine) {
    throw new Error("Unable to determine the mounted DMG path from hdiutil output.");
  }

  const segments = mountLine.split("\t").filter(Boolean);
  const mountPoint = segments.at(-1)?.trim();

  if (!mountPoint || !path.isAbsolute(mountPoint)) {
    throw new Error("Unable to determine the mounted DMG path from hdiutil output.");
  }

  return mountPoint;
};

const ensureAppBundleExists = (mountPoint: string): void => {
  const entries = fs.readdirSync(mountPoint, { withFileTypes: true });
  const appBundle = entries.find(
    (entry) => entry.isDirectory() && entry.name.toLowerCase().endsWith(".app"),
  );

  if (!appBundle) {
    throw new Error(`Expected a macOS app bundle inside mounted DMG at ${mountPoint}.`);
  }
};

const smokeTestWindowsInstaller = (
  bundlePath: string,
  smokeDir: string,
  exec: InstallerSmokeExecutor,
): void => {
  const extractDir = path.join(smokeDir, "msi-extract");
  fs.mkdirSync(extractDir, { recursive: true });

  exec("msiexec", ["/a", bundlePath, "/qn", `TARGETDIR=${extractDir}`], {
    encoding: "utf8",
    stdio: "pipe",
  });
};

const smokeTestLinuxInstaller = (
  bundlePath: string,
  smokeDir: string,
  exec: InstallerSmokeExecutor,
): void => {
  const localBundlePath = path.join(smokeDir, path.basename(bundlePath));
  fs.copyFileSync(bundlePath, localBundlePath);
  fs.chmodSync(localBundlePath, 0o755);

  exec(localBundlePath, ["--appimage-extract"], {
    cwd: smokeDir,
    encoding: "utf8",
    stdio: "pipe",
  });

  const appRunPath = path.join(smokeDir, "squashfs-root", "AppRun");
  if (!fs.existsSync(appRunPath)) {
    throw new Error(`Expected AppImage extraction output at ${appRunPath}.`);
  }
};

const smokeTestMacInstaller = (
  bundlePath: string,
  exec: InstallerSmokeExecutor,
): void => {
  const attachOutput = exec("hdiutil", ["attach", bundlePath, "-nobrowse", "-readonly"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  const mountPoint = parseMacMountPoint(attachOutput);

  try {
    ensureAppBundleExists(mountPoint);
  } finally {
    exec("hdiutil", ["detach", mountPoint], {
      encoding: "utf8",
      stdio: "pipe",
    });
  }
};

export const smokeTestDesktopBundles = ({
  rootDir = process.cwd(),
  runner,
  exec = execFileSync,
}: SmokeTestDesktopBundlesOptions): string[] => {
  const bundles = validateDesktopBundles({ rootDir, runner });
  const bundlePath = bundles[0];

  if (!bundlePath) {
    throw new Error(`No bundle available for smoke testing on ${runner}.`);
  }

  const smokeDir = createSmokeDirectory(runner);

  try {
    if (runner === "windows-latest") {
      smokeTestWindowsInstaller(bundlePath, smokeDir, exec);
    } else if (runner === "ubuntu-22.04") {
      smokeTestLinuxInstaller(bundlePath, smokeDir, exec);
    } else {
      smokeTestMacInstaller(bundlePath, exec);
    }

    return bundles;
  } finally {
    fs.rmSync(smokeDir, { recursive: true, force: true });
  }
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
  const bundles = smokeTestDesktopBundles({ runner: parseRunnerArg() });
  for (const bundle of bundles) {
    console.log(bundle);
  }
}
