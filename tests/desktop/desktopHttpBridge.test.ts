import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Desktop HTTP bridge", () => {
  it("adds an HTTP bridge for local runtime-backed development", () => {
    const source = fs.readFileSync(
      path.resolve("desktop/src/bridge/httpBridge.ts"),
      "utf8",
    );

    expect(source).toContain("createHttpDesktopBridge");
    expect(source).toContain("fetch");
    expect(source).toContain("EventSource");
  });

  it("allows the desktop shell to prefer the HTTP bridge when configured", () => {
    const source = fs.readFileSync(
      path.resolve("desktop/src/bridge/index.ts"),
      "utf8",
    );

    expect(source).toContain("VITE_JOONE_DESKTOP_API_URL");
    expect(source).toContain("createHttpDesktopBridge");
  });

  it("declares the desktop Vite environment variables", () => {
    const source = fs.readFileSync(
      path.resolve("desktop/src/vite-env.d.ts"),
      "utf8",
    );

    expect(source).toContain("interface ImportMetaEnv");
    expect(source).toContain("VITE_JOONE_DESKTOP_API_URL");
  });
});
