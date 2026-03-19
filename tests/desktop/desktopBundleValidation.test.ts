import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  validateDesktopBundles,
  type DesktopBundlePlatform,
} from "../../src/desktop/validateBundles.js";

const tempRoots: string[] = [];

const createTempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "joone-bundles-"));
  tempRoots.push(root);
  return root;
};

const createBundle = (
  root: string,
  platform: DesktopBundlePlatform,
  extension: string,
) => {
  const directory = path.join(root, "src-tauri", "target", "release", "bundle", platform);
  fs.mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, `Joone Desktop.${extension}`);
  fs.writeFileSync(filePath, "bundle");
  return filePath;
};

describe("Desktop bundle validation", () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts the expected bundle output for each supported desktop platform", () => {
    const root = createTempRoot();
    const windowsBundle = createBundle(root, "msi", "msi");
    const linuxBundle = createBundle(root, "appimage", "AppImage");
    const macBundle = createBundle(root, "dmg", "dmg");

    expect(validateDesktopBundles({ rootDir: root, runner: "windows-latest" })).toEqual(
      [windowsBundle],
    );
    expect(validateDesktopBundles({ rootDir: root, runner: "ubuntu-22.04" })).toEqual(
      [linuxBundle],
    );
    expect(validateDesktopBundles({ rootDir: root, runner: "macos-latest" })).toEqual(
      [macBundle],
    );
  });

  it("throws a descriptive error when the expected bundle for a runner is missing", () => {
    const root = createTempRoot();

    expect(() =>
      validateDesktopBundles({ rootDir: root, runner: "windows-latest" }),
    ).toThrowError(/Expected at least one desktop msi bundle/);
  });
});
