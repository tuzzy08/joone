import { describe, expect, it } from "vitest";

import { isDirectDesktopScriptExecution } from "../../src/desktop/cliEntry.js";

describe("Desktop CLI entry detection", () => {
  it("treats Windows argv paths as direct execution of the current module", () => {
    expect(
      isDirectDesktopScriptExecution(
        "file:///D:/a/joone/joone/src/desktop/releaseMetadata.ts",
        "D:\\a\\joone\\joone\\src\\desktop\\releaseMetadata.ts",
      ),
    ).toBe(true);
  });

  it("treats POSIX argv paths as direct execution of the current module", () => {
    expect(
      isDirectDesktopScriptExecution(
        "file:///home/runner/work/joone/src/desktop/releaseMetadata.ts",
        "/home/runner/work/joone/src/desktop/releaseMetadata.ts",
      ),
    ).toBe(true);
  });
});
