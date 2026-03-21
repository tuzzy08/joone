import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Desktop packaged runtime ownership", () => {
  it("prepares a bundled desktop runtime and ships the resources required to launch it", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
    const tauriConfig = JSON.parse(
      fs.readFileSync(path.resolve("src-tauri/tauri.conf.json"), "utf8"),
    );

    expect(pkg.scripts["desktop:prepare-runtime"]).toBeTruthy();
    expect(
      fs.existsSync(path.resolve("src/desktop/prepareRuntimeBundle.ts")),
    ).toBe(true);
    expect(
      fs.existsSync(path.resolve("src/desktop/runtimeEntry.ts")),
    ).toBe(true);
    expect(tauriConfig.bundle?.externalBin).toEqual(
      expect.arrayContaining(["binaries/node-runtime"]),
    );
    expect(tauriConfig.bundle?.resources).toEqual(
      expect.arrayContaining([
        "../dist/**",
        "../node_modules/**",
      ]),
    );
  });

  it("makes the Tauri shell own the desktop runtime lifecycle instead of hard-coding port 3011", () => {
    const source = fs.readFileSync(
      path.resolve("src-tauri/src/main.rs"),
      "utf8",
    );

    expect(source).toContain("ManagedRuntimeState");
    expect(source).toContain("spawn_managed_runtime");
    expect(source).toContain("wait_for_runtime_health");
    expect(source).toContain("runtime_workspace_context");
    expect(source).toContain("kill_runtime_process");
    expect(source).not.toContain('"http://127.0.0.1:3011".to_string()');
  });
});
