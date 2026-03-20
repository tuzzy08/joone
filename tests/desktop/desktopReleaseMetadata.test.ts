import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

import { loadDesktopReleaseMetadata } from "../../src/desktop/releaseMetadata.js";

describe("Desktop release metadata", () => {
  it("derives consistent desktop release names and artifact patterns from tauri config", () => {
    const metadata = loadDesktopReleaseMetadata();

    expect(metadata.productName).toBe("Joone Desktop");
    expect(metadata.version).toBe("0.1.0");
    expect(metadata.slug).toBe("joone-desktop");
    expect(metadata.releaseTag).toBe("joone-desktop-v0.1.0");
    expect(metadata.releaseName).toBe("Joone Desktop v0.1.0");
    expect(metadata.releaseAssetNamePattern).toBe(
      "joone-desktop_[version]_[platform]_[arch][ext]",
    );
    expect(metadata.workflowArtifactNamePattern).toBe(
      "joone-desktop-[platform]-[arch]-[bundle]",
    );
    expect(metadata.releaseBody).toContain("desktop bundles");
  });

  it("is wired into the release workflow outputs", () => {
    const workflow = fs.readFileSync(
      path.resolve(".github/workflows/desktop-build.yml"),
      "utf8",
    );

    expect(workflow).toContain("Compute desktop release metadata");
    expect(workflow).toContain("tsx src/desktop/releaseMetadata.ts");
    expect(workflow).toContain("id: release_meta");
    expect(workflow).toContain("tagName: ${{ steps.release_meta.outputs.release_tag }}");
    expect(workflow).toContain(
      "releaseName: ${{ steps.release_meta.outputs.release_name }}",
    );
    expect(workflow).toContain(
      "releaseBody: ${{ steps.release_meta.outputs.release_body }}",
    );
    expect(workflow).toContain(
      "releaseAssetNamePattern: ${{ steps.release_meta.outputs.release_asset_name_pattern }}",
    );
    expect(workflow).toContain(
      "workflowArtifactNamePattern: ${{ steps.release_meta.outputs.workflow_artifact_name_pattern }}",
    );
  });
});
