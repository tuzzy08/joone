import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Desktop installer smoke workflow", () => {
  it("runs installer smoke checks after bundle validation", () => {
    const source = fs.readFileSync(
      path.resolve(".github/workflows/desktop-build.yml"),
      "utf8",
    );

    expect(source).toContain("Smoke test desktop installers");
    expect(source).toContain("tsx src/desktop/smokeTestBundles.ts");
    expect(source).toContain("${{ matrix.platform }}");
  });
});
