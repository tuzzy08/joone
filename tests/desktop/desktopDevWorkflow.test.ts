import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Desktop dev workflow", () => {
  it("routes desktop:web:dev through a dedicated launcher", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));

    expect(pkg.scripts["desktop:web:dev"]).toContain("src/desktop/webDev.ts");
  });

  it("launches Vite with the runtime server URL injected", () => {
    const source = fs.readFileSync(
      path.resolve("src/desktop/webDev.ts"),
      "utf8",
    );

    expect(source).toContain("desktop:runtime:dev");
    expect(source).toContain("VITE_JOONE_DESKTOP_API_URL");
    expect(source).toContain("desktop/vite.config.ts");
  });
});
