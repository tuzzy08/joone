import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  smokeTestDesktopBundles,
  type InstallerSmokeExecutor,
} from "../../src/desktop/smokeTestBundles.js";

const tempRoots: string[] = [];

const createTempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "joone-installer-smoke-"));
  tempRoots.push(root);
  return root;
};

const createBundle = (
  root: string,
  platform: "msi" | "appimage" | "dmg",
  fileName: string,
) => {
  const directory = path.join(root, "src-tauri", "target", "release", "bundle", platform);
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, fileName);
  fs.writeFileSync(filePath, "bundle");
  return filePath;
};

describe("Desktop installer smoke tests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses administrative extraction for Windows MSI bundles", () => {
    const root = createTempRoot();
    const bundle = createBundle(root, "msi", "Joone Desktop.msi");
    const exec = vi.fn<InstallerSmokeExecutor>().mockReturnValue("");

    smokeTestDesktopBundles({
      rootDir: root,
      runner: "windows-latest",
      exec,
    });

    expect(exec).toHaveBeenCalledWith(
      "msiexec",
      expect.arrayContaining(["/a", bundle, "/qn"]),
      expect.objectContaining({
        stdio: "pipe",
      }),
    );
    expect(exec.mock.calls[0]?.[1].some((arg) => arg.startsWith("TARGETDIR="))).toBe(true);
  });

  it("extracts Linux AppImage bundles in a temp workspace", () => {
    const root = createTempRoot();
    const bundle = createBundle(root, "appimage", "Joone Desktop.AppImage");
    const exec = vi.fn<InstallerSmokeExecutor>().mockImplementation((_command, _args, options) => {
      fs.mkdirSync(path.join(options.cwd, "squashfs-root"), { recursive: true });
      fs.writeFileSync(path.join(options.cwd, "squashfs-root", "AppRun"), "");
      return "";
    });

    smokeTestDesktopBundles({
      rootDir: root,
      runner: "ubuntu-22.04",
      exec,
    });

    expect(exec).toHaveBeenCalledWith(
      expect.stringMatching(/\.AppImage$/),
      ["--appimage-extract"],
      expect.objectContaining({
        stdio: "pipe",
      }),
    );
  });

  it("attaches and detaches macOS DMGs while checking for an app bundle", () => {
    const root = createTempRoot();
    const bundle = createBundle(root, "dmg", "Joone Desktop.dmg");
    const mountPoint = path.join(root, "Volumes", "Joone Desktop");
    const exec = vi.fn<InstallerSmokeExecutor>().mockImplementation((command, args) => {
      if (command === "hdiutil" && args[0] === "attach") {
        fs.mkdirSync(mountPoint, { recursive: true });
        fs.mkdirSync(path.join(mountPoint, "Joone Desktop.app"), { recursive: true });
        return `/dev/disk4\tGUID_partition_scheme\n/dev/disk4s1\tApple_HFS\t${mountPoint}\n`;
      }

      return "";
    });

    smokeTestDesktopBundles({
      rootDir: root,
      runner: "macos-latest",
      exec,
    });

    expect(exec).toHaveBeenNthCalledWith(
      1,
      "hdiutil",
      ["attach", bundle, "-nobrowse", "-readonly"],
      expect.objectContaining({
        encoding: "utf8",
        stdio: "pipe",
      }),
    );
    expect(exec).toHaveBeenNthCalledWith(
      2,
      "hdiutil",
      ["detach", mountPoint],
      expect.objectContaining({
        encoding: "utf8",
        stdio: "pipe",
      }),
    );
  });
});
