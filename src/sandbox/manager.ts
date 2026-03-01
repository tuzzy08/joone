import { Sandbox } from "e2b";

/**
 * Result of a command execution in the sandbox.
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Options for creating a SandboxManager.
 */
export interface SandboxManagerOptions {
  /** E2B API key. If not provided, reads from E2B_API_KEY env var. */
  apiKey?: string;
  /** Sandbox template to use. Defaults to E2B's base template. */
  template?: string;
  /** Sandbox timeout in milliseconds. Defaults to 5 minutes. */
  timeoutMs?: number;
}

/**
 * Manages the lifecycle of an E2B cloud sandbox.
 *
 * - `create()` initializes a new sandbox
 * - `exec(cmd)` runs a shell command inside the sandbox
 * - `uploadFile(path, content)` writes a file to the sandbox filesystem
 * - `destroy()` kills the sandbox and releases resources
 */
export class SandboxManager {
  private sandbox: Sandbox | null = null;
  private readonly apiKey?: string;
  private readonly template?: string;
  private readonly timeoutMs: number;

  constructor(opts: SandboxManagerOptions = {}) {
    this.apiKey = opts.apiKey;
    this.template = opts.template;
    this.timeoutMs = opts.timeoutMs ?? 300_000; // 5 minutes default
  }

  /**
   * Creates a new E2B sandbox.
   * @returns The sandbox ID.
   */
  async create(): Promise<string> {
    const createOpts = {
      apiKey: this.apiKey,
      timeoutMs: this.timeoutMs,
    };

    if (this.template) {
      this.sandbox = await Sandbox.create(this.template, createOpts);
    } else {
      this.sandbox = await Sandbox.create(createOpts);
    }

    return this.sandbox.sandboxId;
  }

  /**
   * Destroys the active sandbox.
   */
  async destroy(): Promise<void> {
    if (this.sandbox) {
      await this.sandbox.kill();
      this.sandbox = null;
    }
  }

  /**
   * Returns whether a sandbox is currently active.
   */
  isActive(): boolean {
    return this.sandbox !== null;
  }

  /**
   * Executes a shell command in the sandbox.
   *
   * @param command The shell command to run.
   * @returns The command result (stdout, stderr, exitCode).
   * @throws If the sandbox is not active.
   */
  async exec(command: string): Promise<CommandResult> {
    if (!this.sandbox) {
      throw new Error(
        "Sandbox is not active. Call create() before exec()."
      );
    }

    const result = await this.sandbox.commands.run(command);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  /**
   * Uploads a file to the sandbox filesystem.
   *
   * @param filePath Absolute path inside the sandbox (e.g., "/workspace/src/foo.ts").
   * @param content File content as a string.
   */
  async uploadFile(filePath: string, content: string): Promise<void> {
    if (!this.sandbox) {
      throw new Error(
        "Sandbox is not active. Call create() before uploadFile()."
      );
    }

    await this.sandbox.files.write(filePath, content);
  }

  /**
   * Returns the underlying E2B Sandbox instance for advanced operations.
   * @throws If the sandbox is not active.
   */
  getSandbox(): Sandbox {
    if (!this.sandbox) {
      throw new Error("Sandbox is not active.");
    }
    return this.sandbox;
  }
}
