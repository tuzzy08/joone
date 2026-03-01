import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SandboxManager } from "../sandbox/manager.js";

// Mock the e2b SDK since we don't want real sandbox creation in tests
vi.mock("e2b", () => {
  const mockSandbox = {
    sandboxId: "test-sandbox-123",
    commands: {
      run: vi.fn().mockResolvedValue({
        stdout: "mock output",
        stderr: "",
        exitCode: 0,
      }),
    },
    files: {
      write: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue("file content"),
      list: vi.fn().mockResolvedValue([]),
    },
    kill: vi.fn().mockResolvedValue(undefined),
    isRunning: vi.fn().mockResolvedValue(true),
    setTimeout: vi.fn().mockResolvedValue(undefined),
  };

  return {
    Sandbox: {
      create: vi.fn().mockResolvedValue(mockSandbox),
    },
  };
});

describe("SandboxManager", () => {
  let manager: SandboxManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SandboxManager({ apiKey: "test-e2b-key" });
  });

  afterEach(async () => {
    // Ensure sandbox is cleaned up after each test
    try {
      await manager.destroy();
    } catch {
      // Already destroyed or never created
    }
  });

  // ─── Test #15: SandboxManager.create() initializes a sandbox ───

  it("creates a sandbox and returns the sandbox ID", async () => {
    const sandboxId = await manager.create();

    expect(sandboxId).toBe("test-sandbox-123");
    expect(manager.isActive()).toBe(true);
  });

  // ─── Test #16: SandboxManager.destroy() cleans up the sandbox ───

  it("destroys the sandbox and marks it as inactive", async () => {
    await manager.create();
    expect(manager.isActive()).toBe(true);

    await manager.destroy();
    expect(manager.isActive()).toBe(false);
  });

  // ─── Test #17: SandboxManager.exec() runs a command in the sandbox ───

  it("executes a command in the sandbox and returns output", async () => {
    await manager.create();

    const result = await manager.exec("echo hello");

    expect(result.stdout).toBe("mock output");
    expect(result.exitCode).toBe(0);
  });

  // ─── Test #18: SandboxManager.exec() throws if sandbox not active ───

  it("throws an error if exec is called before create", async () => {
    await expect(manager.exec("echo hello")).rejects.toThrow(
      /sandbox is not active/i
    );
  });

  // ─── Test #19: SandboxManager.uploadFile() writes a file to the sandbox ───

  it("uploads a file to the sandbox filesystem", async () => {
    await manager.create();

    await manager.uploadFile("/workspace/src/foo.ts", "const x = 1;");

    // Verify the E2B files.write was called
    const { Sandbox } = await import("e2b");
    const mockSandbox = await Sandbox.create();
    expect(mockSandbox.files.write).toHaveBeenCalledWith(
      "/workspace/src/foo.ts",
      "const x = 1;"
    );
  });
});
