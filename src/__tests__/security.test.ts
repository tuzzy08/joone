import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SecurityScanTool,
  DepScanTool,
  bindSecuritySandbox,
} from "../tools/security.js";
import { SandboxManager } from "../sandbox/manager.js";
import { LazyInstaller } from "../sandbox/bootstrap.js";

// Helpers
const createMockSandbox = (active = true) => ({
  exec: vi.fn(),
  isActive: vi.fn().mockReturnValue(active),
  create: vi.fn(),
  destroy: vi.fn(),
  uploadFile: vi.fn(),
  getSandbox: vi.fn(),
});

describe("SecurityScanTool", () => {
  let mockSandbox: ReturnType<typeof createMockSandbox>;
  let installer: LazyInstaller;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSandbox = createMockSandbox();
    // Use custom template mode so ensureGeminiCli is instant
    installer = new LazyInstaller(true);
    bindSecuritySandbox(
      mockSandbox as unknown as SandboxManager,
      installer
    );
  });

  // ─── Test #39: Runs security:analyze and returns report ───

  it("runs gemini security:analyze and returns the report", async () => {
    mockSandbox.exec.mockResolvedValueOnce({
      exitCode: 0,
      stdout: "## Security Report\n\nNo critical vulnerabilities found.",
      stderr: "",
    });

    const result = await SecurityScanTool.execute({ target: "changes" });

    expect(result.content).toContain("Security Report");
    expect(mockSandbox.exec).toHaveBeenCalledWith(
      expect.stringContaining("security:analyze")
    );
  });

  // ─── Test #40: Returns error for file scan without path ───

  it("returns error when target is 'file' but no path provided", async () => {
    const result = await SecurityScanTool.execute({ target: "file" });

    expect(result.content).toMatch(/path.*required/i);
  });

  // ─── Test #41: Handles failed scans gracefully ───

  it("returns failure info when scan exits with non-zero code", async () => {
    mockSandbox.exec.mockResolvedValueOnce({
      exitCode: 1,
      stdout: "",
      stderr: "Some error occurred",
    });

    const result = await SecurityScanTool.execute({ target: "changes" });

    expect(result.content).toContain("failed");
    expect(result.content).toContain("Some error occurred");
  });
});

describe("DepScanTool", () => {
  let mockSandbox: ReturnType<typeof createMockSandbox>;
  let installer: LazyInstaller;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSandbox = createMockSandbox();
    installer = new LazyInstaller(true); // pre-baked template
    bindSecuritySandbox(
      mockSandbox as unknown as SandboxManager,
      installer
    );
  });

  // ─── Test #42: OSV-Scanner returns vulnerability report ───

  it("runs osv-scanner and returns the report", async () => {
    mockSandbox.exec.mockResolvedValueOnce({
      exitCode: 0,
      stdout: "Found 2 vulnerabilities:\n- CVE-2024-1234\n- CVE-2024-5678",
      stderr: "",
    });

    const result = await DepScanTool.execute({ format: "summary" });

    expect(result.content).toContain("CVE-2024-1234");
    expect(result.content).toContain("CVE-2024-5678");
  });

  // ─── Test #43: Falls back to npm audit when OSV-Scanner fails ───

  it("falls back to npm audit if osv-scanner returns empty output", async () => {
    // OSV-Scanner: empty output
    mockSandbox.exec
      .mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "error" })
      // npm audit fallback
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "found 0 vulnerabilities",
        stderr: "",
      });

    const result = await DepScanTool.execute({ format: "summary" });

    expect(result.content).toContain("0 vulnerabilities");
  });
});
