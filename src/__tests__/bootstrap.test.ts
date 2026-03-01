import { describe, it, expect, vi, beforeEach } from "vitest";
import { LazyInstaller } from "../sandbox/bootstrap.js";
import { SandboxManager } from "../sandbox/manager.js";

// Mock SandboxManager
const createMockSandbox = () => ({
  exec: vi.fn(),
  isActive: vi.fn().mockReturnValue(true),
  create: vi.fn(),
  destroy: vi.fn(),
  uploadFile: vi.fn(),
  getSandbox: vi.fn(),
});

describe("LazyInstaller", () => {
  let mockSandbox: ReturnType<typeof createMockSandbox>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSandbox = createMockSandbox();
  });

  // ─── Test #34: Custom template skips all installs ───

  it("skips installation when using a custom template", async () => {
    const installer = new LazyInstaller(true);

    expect(installer.isGeminiCliReady()).toBe(true);
    expect(installer.isOsvScannerReady()).toBe(true);

    // Should not call exec at all
    const result = await installer.ensureGeminiCli(
      mockSandbox as unknown as SandboxManager
    );
    expect(result).toBe(true);
    expect(mockSandbox.exec).not.toHaveBeenCalled();
  });

  // ─── Test #35: Dev mode installs Gemini CLI on first use ───

  it("installs Gemini CLI on first call in dev mode", async () => {
    const installer = new LazyInstaller(false);

    // First check fails (not installed), then install succeeds, then extension succeeds
    mockSandbox.exec
      .mockRejectedValueOnce(new Error("not found")) // version check
      .mockResolvedValueOnce({ exitCode: 0, stdout: "installed", stderr: "" }) // npm install
      .mockResolvedValueOnce({ exitCode: 0, stdout: "ok", stderr: "" }); // extension install

    const result = await installer.ensureGeminiCli(
      mockSandbox as unknown as SandboxManager
    );

    expect(result).toBe(true);
    expect(installer.isGeminiCliReady()).toBe(true);
  });

  // ─── Test #36: Caches install state — second call is a no-op ───

  it("does not re-install on second call (cached)", async () => {
    const installer = new LazyInstaller(false);

    // First: fails check, succeeds install + extension
    mockSandbox.exec
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" });

    await installer.ensureGeminiCli(mockSandbox as unknown as SandboxManager);
    mockSandbox.exec.mockClear();

    // Second call — should return immediately
    const result = await installer.ensureGeminiCli(
      mockSandbox as unknown as SandboxManager
    );
    expect(result).toBe(true);
    expect(mockSandbox.exec).not.toHaveBeenCalled();
  });

  // ─── Test #37: Returns false if install fails ───

  it("returns false if Gemini CLI installation fails", async () => {
    const installer = new LazyInstaller(false);

    mockSandbox.exec
      .mockRejectedValueOnce(new Error("not found")) // version check
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "error" }); // install fails

    const result = await installer.ensureGeminiCli(
      mockSandbox as unknown as SandboxManager
    );
    expect(result).toBe(false);
    expect(installer.isGeminiCliReady()).toBe(false);
  });

  // ─── Test #38: OSV-Scanner install attempt ───

  it("installs OSV-Scanner via curl when not available", async () => {
    const installer = new LazyInstaller(false);

    mockSandbox.exec
      .mockRejectedValueOnce(new Error("not found")) // version check
      .mockResolvedValueOnce({ exitCode: 0, stdout: "", stderr: "" }); // curl install

    const result = await installer.ensureOsvScanner(
      mockSandbox as unknown as SandboxManager
    );
    expect(result).toBe(true);
    expect(installer.isOsvScannerReady()).toBe(true);
  });
});
