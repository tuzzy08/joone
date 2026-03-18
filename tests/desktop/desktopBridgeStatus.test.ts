import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Desktop bridge status", () => {
  it("adds bridge status to the desktop bridge contract", () => {
    const source = fs.readFileSync(
      path.resolve("desktop/src/bridge/types.ts"),
      "utf8",
    );

    expect(source).toContain("export interface DesktopBridgeStatus");
    expect(source).toContain("getStatus(): Promise<DesktopBridgeStatus>");
  });

  it("implements health-aware status in the browser and HTTP bridges", () => {
    const browser = fs.readFileSync(
      path.resolve("desktop/src/bridge/browserBridge.ts"),
      "utf8",
    );
    const http = fs.readFileSync(
      path.resolve("desktop/src/bridge/httpBridge.ts"),
      "utf8",
    );

    expect(browser).toContain("mode: \"browser\"");
    expect(browser).toContain("backend: \"mock\"");
    expect(http).toContain("mode: \"http\"");
    expect(http).toContain("/health");
    expect(http).toContain("backend: \"runtime\"");
  });

  it("surfaces the active bridge and health in the desktop app shell", () => {
    const source = fs.readFileSync(
      path.resolve("desktop/src/App.tsx"),
      "utf8",
    );

    expect(source).toContain("Bridge:");
    expect(source).toContain("Runtime:");
    expect(source).toContain("getStatus");
  });
});
