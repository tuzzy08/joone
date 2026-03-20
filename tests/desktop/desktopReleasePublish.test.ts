import { describe, expect, it, vi } from "vitest";

import { publishDesktopReleaseAssets } from "../../src/desktop/publishReleaseAssets.js";

describe("Desktop release publishing", () => {
  it("uploads validated platform bundles to the configured GitHub release", () => {
    const exec = vi.fn(() => "");

    publishDesktopReleaseAssets({
      tag: "joone-desktop-v0.1.0",
      bundles: [
        "C:\\workspace\\src-tauri\\target\\release\\bundle\\msi\\Joone Desktop_0.1.0_x64_en-US.msi",
      ],
      exec,
    });

    expect(exec).toHaveBeenCalledWith(
      "gh",
      [
        "release",
        "upload",
        "joone-desktop-v0.1.0",
        "C:\\workspace\\src-tauri\\target\\release\\bundle\\msi\\Joone Desktop_0.1.0_x64_en-US.msi",
        "--clobber",
      ],
      expect.objectContaining({
        encoding: "utf8",
        stdio: "pipe",
      }),
    );
  });
});
