import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Tauri runtime bridge", () => {
  it("moves startup status and config calls onto real Tauri commands", () => {
    const source = fs.readFileSync(
      path.resolve("desktop/src/bridge/tauriBridge.ts"),
      "utf8",
    );

    expect(source).toContain('invoke<DesktopBridgeStatus>("runtime_status")');
    expect(source).toContain('invoke<DesktopConfig>("runtime_load_config")');
    expect(source).toContain('invoke<string>("runtime_base_url")');
    expect(source).toContain("createHttpDesktopBridge");
    expect(source).not.toContain("return (await getBridge()).loadConfig()");
  });

  it("registers startup commands in the Tauri shell", () => {
    const source = fs.readFileSync(
      path.resolve("src-tauri/src/main.rs"),
      "utf8",
    );

    expect(source).toContain("runtime_base_url");
    expect(source).toContain("runtime_status");
    expect(source).toContain("runtime_load_config");
    expect(source).toContain("generate_handler");
    expect(source).toContain("JOONE_DESKTOP_RUNTIME_URL");
  });
});
