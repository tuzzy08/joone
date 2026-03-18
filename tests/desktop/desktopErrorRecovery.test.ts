import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Desktop error recovery", () => {
  it("adds toast-style recovery actions for desktop failures", () => {
    const source = fs.readFileSync(path.resolve("desktop/src/App.tsx"), "utf8");
    const styles = fs.readFileSync(path.resolve("desktop/src/styles.css"), "utf8");

    expect(source).toContain("retryActionRef");
    expect(source).toContain("Retry last action");
    expect(source).toContain("Dismiss");
    expect(styles).toContain(".toast-stack");
    expect(styles).toContain(".toast");
  });
});
