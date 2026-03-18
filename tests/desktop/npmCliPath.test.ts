import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolveNpmCliPath } from "../../src/desktop/npmCli.js";

describe("resolveNpmCliPath", () => {
  it("prefers npm_execpath when npm provides it", () => {
    expect(
      resolveNpmCliPath({
        npm_execpath: "C:\\tools\\npm\\bin\\npm-cli.js",
      }),
    ).toBe("C:\\tools\\npm\\bin\\npm-cli.js");
  });

  it("falls back to the installed npm package path", () => {
    const resolved = resolveNpmCliPath({});

    expect(path.basename(resolved)).toBe("npm-cli.js");
    expect(resolved).toContain(`${path.sep}npm${path.sep}bin${path.sep}`);
  });
});
