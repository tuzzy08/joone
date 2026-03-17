import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const appPath = path.resolve("src/ui/App.tsx");

describe("App shutdown lifecycle", () => {
  it("lets the CLI own process termination after a soft exit", () => {
    const source = fs.readFileSync(appPath, "utf8");

    expect(source).not.toContain("process.exit(0);");
  });

  it("keeps heavyweight LangChain runtime imports out of the initial UI module load", () => {
    const source = fs.readFileSync(appPath, "utf8");

    expect(source).toContain('import type { ExecutionHarness }');
    expect(source).not.toContain('import { ExecutionHarness }');
    expect(source).not.toContain('from "@langchain/core/messages"');
    expect(source).not.toContain('from "@langchain/langgraph"');
  });
});
