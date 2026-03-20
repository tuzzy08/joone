import { describe, expect, it, vi } from "vitest";

import { pruneDesktopReleaseAssets } from "../../src/desktop/pruneReleaseAssets.js";

describe("Desktop release pruning", () => {
  it("deletes non-canonical release assets before the bundle upload step", () => {
    const exec = vi
      .fn()
      .mockReturnValueOnce(
        JSON.stringify({
          assets: [
            { id: 1, name: "joone-desktop_0.1.0_windows_x64.msi" },
            { id: 2, name: "Joone.Desktop_0.1.0_x64_en-US.msi" },
            { id: 3, name: "Joone.Desktop_0.1.0_amd64.AppImage" },
          ],
        }),
      )
      .mockReturnValue("");

    const deleted = pruneDesktopReleaseAssets({
      tag: "joone-desktop-v0.1.0",
      keepPrefix: "joone-desktop_0.1.0_",
      exec,
    });

    expect(deleted).toEqual([
      "Joone.Desktop_0.1.0_x64_en-US.msi",
      "Joone.Desktop_0.1.0_amd64.AppImage",
    ]);
    expect(exec).toHaveBeenNthCalledWith(
      2,
      "gh",
      ["release", "delete-asset", "joone-desktop-v0.1.0", "2", "--yes"],
      expect.objectContaining({ encoding: "utf8", stdio: "pipe" }),
    );
    expect(exec).toHaveBeenNthCalledWith(
      3,
      "gh",
      ["release", "delete-asset", "joone-desktop-v0.1.0", "3", "--yes"],
      expect.objectContaining({ encoding: "utf8", stdio: "pipe" }),
    );
  });

  it("skips pruning when the release does not exist yet", () => {
    const exec = vi.fn(() => {
      throw new Error("release not found");
    });

    expect(
      pruneDesktopReleaseAssets({
        tag: "joone-desktop-v0.1.0",
        keepPrefix: "joone-desktop_0.1.0_",
        exec,
      }),
    ).toEqual([]);
  });
});
