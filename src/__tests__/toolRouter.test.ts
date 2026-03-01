import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolRouter, ToolTarget } from "../tools/router.js";

describe("Tool Router", () => {
  let router: ToolRouter;

  beforeEach(() => {
    router = new ToolRouter();
  });

  // ─── Test #20: Routes write_file to host ───

  it("routes write_file to the host", () => {
    expect(router.getTarget("write_file")).toBe(ToolTarget.HOST);
  });

  // ─── Test #21: Routes read_file to host ───

  it("routes read_file to the host", () => {
    expect(router.getTarget("read_file")).toBe(ToolTarget.HOST);
  });

  // ─── Test #22: Routes bash to sandbox ───

  it("routes bash to the sandbox", () => {
    expect(router.getTarget("bash")).toBe(ToolTarget.SANDBOX);
  });

  // ─── Test #23: Routes run_tests to sandbox ───

  it("routes run_tests to the sandbox", () => {
    expect(router.getTarget("run_tests")).toBe(ToolTarget.SANDBOX);
  });

  // ─── Test #24: Routes install_deps to sandbox ───

  it("routes install_deps to the sandbox", () => {
    expect(router.getTarget("install_deps")).toBe(ToolTarget.SANDBOX);
  });

  // ─── Test #25: Routes search_tools to host ───

  it("routes search_tools to the host", () => {
    expect(router.getTarget("search_tools")).toBe(ToolTarget.HOST);
  });

  // ─── Test #26: Unknown tools default to sandbox (safe) ───

  it("defaults unknown tools to sandbox for safety", () => {
    expect(router.getTarget("unknown_tool")).toBe(ToolTarget.SANDBOX);
  });
});
