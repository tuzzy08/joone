import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Desktop packaging validation workflow", () => {
  it("verifies platform bundle outputs after the Tauri build step", () => {
    const source = fs.readFileSync(
      path.resolve(".github/workflows/desktop-build.yml"),
      "utf8",
    );

    expect(source).toContain("Validate bundle outputs");
    expect(source).toContain("tsx src/desktop/validateBundles.ts");
    expect(source).toContain("${{ matrix.platform }}");
  });
});
