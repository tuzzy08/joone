import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const cliIndexPath = path.resolve("src/cli/index.ts");

describe("CLI entrypoint imports", () => {
  it("keeps heavyweight runtime modules lazily imported", () => {
    const source = fs.readFileSync(cliIndexPath, "utf8");

    expect(source).not.toContain(
      'import { createModel } from "./modelFactory.js";',
    );
    expect(source).not.toContain(
      'import { installProvider, uninstallProvider } from "./providers.js";',
    );
  });

  it("exposes a startup benchmark flag", () => {
    const source = fs.readFileSync(cliIndexPath, "utf8");

    expect(source).toContain('.option("--benchmark-startup"');
  });

  it("prints the benchmark report after the TUI exits", () => {
    const source = fs.readFileSync(cliIndexPath, "utf8");

    expect(source).toContain("let pendingStartupBenchmarkReport");
    expect(source).toContain("await waitUntilExit();");
    expect(source).toContain("if (pendingStartupBenchmarkReport)");
  });
});
