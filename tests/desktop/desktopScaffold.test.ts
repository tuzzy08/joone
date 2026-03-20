import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Desktop scaffold", () => {
  it("adds desktop build scripts to package.json", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));

    expect(pkg.scripts["desktop:dev"]).toBeTruthy();
    expect(pkg.scripts["desktop:build"]).toBeTruthy();
  });

  it("creates a Tauri backend scaffold", () => {
    expect(fs.existsSync(path.resolve("src-tauri/tauri.conf.json"))).toBe(true);
    expect(fs.existsSync(path.resolve("src-tauri/Cargo.toml"))).toBe(true);
    expect(fs.existsSync(path.resolve("src-tauri/build.rs"))).toBe(true);
    expect(fs.existsSync(path.resolve("src-tauri/icons/icon.ico"))).toBe(true);
    expect(fs.existsSync(path.resolve("src-tauri/icons/icon.png"))).toBe(true);
    expect(fs.existsSync(path.resolve("src-tauri/icons/icon.icns"))).toBe(true);
    expect(fs.existsSync(path.resolve("src-tauri/src/main.rs"))).toBe(true);
  });

  it("declares an explicit cross-platform icon set for Tauri bundling", () => {
    const tauriConfig = JSON.parse(
      fs.readFileSync(path.resolve("src-tauri/tauri.conf.json"), "utf8"),
    );

    expect(tauriConfig.bundle?.icon).toEqual(
      expect.arrayContaining([
        "icons/icon.png",
        "icons/icon.icns",
        "icons/icon.ico",
      ]),
    );
  });

  it("wires the Tauri build script required by generate_context", () => {
    const cargoToml = fs.readFileSync(path.resolve("src-tauri/Cargo.toml"), "utf8");
    const buildRs = fs.readFileSync(path.resolve("src-tauri/build.rs"), "utf8");

    expect(cargoToml).toContain('build = "build.rs"');
    expect(buildRs).toContain("tauri_build::build()");
  });

  it("creates a desktop React app scaffold", () => {
    expect(fs.existsSync(path.resolve("desktop/index.html"))).toBe(true);
    expect(fs.existsSync(path.resolve("desktop/src/main.tsx"))).toBe(true);
    expect(fs.existsSync(path.resolve("desktop/src/App.tsx"))).toBe(true);
  });

  it("defines a desktop IPC bridge around the runtime service", () => {
    const source = fs.readFileSync(path.resolve("src/desktop/ipc.ts"), "utf8");

    expect(source).toContain("createDesktopRuntimeBridge");
    expect(source).toContain("startSession");
    expect(source).toContain("submitMessage");
    expect(source).toContain("closeSession");
    expect(source).toContain("session:started");
    expect(source).toContain("session:completed");
  });
});
