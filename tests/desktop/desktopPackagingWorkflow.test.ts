import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Desktop packaging workflow", () => {
  it("adds a GitHub Actions workflow for cross-platform desktop bundles", () => {
    const workflowPath = path.resolve(".github/workflows/desktop-build.yml");

    expect(fs.existsSync(workflowPath)).toBe(true);

    const source = fs.readFileSync(workflowPath, "utf8");

    expect(source).toContain("workflow_dispatch:");
    expect(source).toContain("windows-latest");
    expect(source).toContain("ubuntu-22.04");
    expect(source).toContain("macos-latest");
    expect(source).toContain("tauri-apps/tauri-action@v1");
    expect(source).toContain("npm ci");
    expect(source).toContain("npm run build");
    expect(source).toContain("libwebkit2gtk-4.1-dev");
    expect(source).toContain("uploadWorkflowArtifacts: true");
  });
});
