import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Desktop error handling", () => {
  it("surfaces bridge failures inside the desktop shell", () => {
    const source = fs.readFileSync(path.resolve("desktop/src/App.tsx"), "utf8");

    expect(source).toContain("Last error:");
    expect(source).toContain("reportError");
    expect(source).toContain("setLastError");
  });

  it("wraps the desktop app in an explicit error boundary", () => {
    const entry = fs.readFileSync(path.resolve("desktop/src/main.tsx"), "utf8");
    const boundary = fs.readFileSync(
      path.resolve("desktop/src/DesktopErrorBoundary.tsx"),
      "utf8",
    );

    expect(entry).toContain("DesktopErrorBoundary");
    expect(boundary).toContain("componentDidCatch");
    expect(boundary).toContain("Desktop shell crashed");
  });
});
