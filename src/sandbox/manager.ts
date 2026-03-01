import { Sandbox as E2BSandbox } from "e2b";
import { Sandbox as OSandbox, ConnectionConfig } from "@alibaba-group/opensandbox";

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
  /** OpenSandbox API key for the fallback. If not provided, reads from OPENSANDBOX_API_KEY env var. */
  openSandboxApiKey?: string;
  /** OpenSandbox API domain connection string. Defaults to localhost:8080. */
  openSandboxDomain?: string;
  /** Sandbox template to use. Defaults to E2B's base template. */
  template?: string;
  /** Sandbox timeout in milliseconds. Defaults to 5 minutes. */
  timeoutMs?: number;
}

/**
 * Unifies E2B and OpenSandbox under a single interface.
 */
interface ISandboxWrapper {
  kill(): Promise<void>;
  exec(command: string): Promise<CommandResult>;
  uploadFile(path: string, content: string): Promise<void>;
  getInternalInstance(): E2BSandbox | OSandbox;
  getId(): string;
  getProviderName(): "e2b" | "opensandbox";
}

class E2BSandboxWrapper implements ISandboxWrapper {
  constructor(private sandbox: E2BSandbox) {}

  async kill(): Promise<void> {
    await this.sandbox.kill();
  }

  async exec(command: string): Promise<CommandResult> {
    const result = await this.sandbox.commands.run(command);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  async uploadFile(path: string, content: string): Promise<void> {
    await this.sandbox.files.write(path, content);
  }

  getInternalInstance(): E2BSandbox {
    return this.sandbox;
  }

  getId(): string {
    return this.sandbox.sandboxId;
  }

  getProviderName(): "e2b" | "opensandbox" {
    return "e2b";
  }
}

class OpenSandboxWrapper implements ISandboxWrapper {
  constructor(private sandbox: OSandbox) {}

  async kill(): Promise<void> {
    await this.sandbox.kill();
  }

  async exec(command: string): Promise<CommandResult> {
    const execution = await this.sandbox.commands.run(command);
    
    // Process logs. OpenSandbox separates output into arrays of messages.
    const stdout = execution.logs.stdout.map(m => m.text).join("");
    const stderr = execution.logs.stderr.map(m => m.text).join("");
    
    // If there is an error block on the execution response, it means it failed.
    const exitCode = execution.error ? 1 : 0;

    return { stdout, stderr, exitCode };
  }

  async uploadFile(path: string, content: string): Promise<void> {
    await this.sandbox.files.writeFiles([{
        path,
        data: content,
        mode: 0o644
    }]);
  }

  getInternalInstance(): OSandbox {
    return this.sandbox;
  }

  getId(): string {
    return this.sandbox.id || "opensandbox-local";
  }

  getProviderName(): "e2b" | "opensandbox" {
    return "opensandbox";
  }
}

/**
 * Manages the lifecycle of a cloud or local sandbox.
 * Attempts to use E2B first. If E2B fails (e.g., networking/auth error), 
 * it automatically falls back to OpenSandbox (local docker).
 */
export class SandboxManager {
  private wrapper: ISandboxWrapper | null = null;
  private readonly e2bApiKey?: string;
  private readonly osApiKey?: string;
  private readonly osDomain?: string;
  private readonly template?: string;
  private readonly timeoutMs: number;

  constructor(opts: SandboxManagerOptions = {}) {
    this.e2bApiKey = opts.apiKey;
    this.osApiKey = opts.openSandboxApiKey;
    this.osDomain = opts.openSandboxDomain; // defaults via SDK if undefined
    this.template = opts.template;
    this.timeoutMs = opts.timeoutMs ?? 300_000; // 5 minutes default
  }

  /**
   * Creates a new sandboxed execution environment.
   * @returns The sandbox ID.
   */
  async create(): Promise<string> {
    if (this.wrapper) {
      await this.destroy();
    }

    // 1. Attempt E2B Primary Sandbox
    try {
      const createOpts = {
        apiKey: this.e2bApiKey,
        timeoutMs: this.timeoutMs,
      };

      const e2bInstance = this.template
        ? await E2BSandbox.create(this.template, createOpts)
        : await E2BSandbox.create(createOpts);

      this.wrapper = new E2BSandboxWrapper(e2bInstance);
      return this.wrapper.getId();

    } catch (e2bError: any) {
      console.warn(`[SandboxManager] E2B initialization failed: ${e2bError.message}. Falling back to OpenSandbox...`);

      // 2. Attempt OpenSandbox Fallback
      try {
        const configOpts: { apiKey?: string; domain?: string } = {};
        if (this.osApiKey) configOpts.apiKey = this.osApiKey;
        if (this.osDomain) configOpts.domain = this.osDomain;
        // else defaults locally to localhost:8080 without API key (Docker setup)

        const config = new ConnectionConfig(configOpts);
        const osInstance = await OSandbox.create({
          connectionConfig: config,
          image: this.template || "ubuntu:22.04", // Fallback to basic ubuntu if E2B template is specified
          timeoutSeconds: Math.floor(this.timeoutMs / 1000)
        });

        this.wrapper = new OpenSandboxWrapper(osInstance);
        return this.wrapper.getId();

      } catch (osError: any) {
        throw new Error(`CRITICAL: Both E2B and OpenSandbox initialization failed.\nE2B Error: ${e2bError.message}\nOpenSandbox Error: ${osError.message}`);
      }
    }
  }

  /**
   * Destroys the active sandbox.
   */
  async destroy(): Promise<void> {
    if (this.wrapper) {
      await this.wrapper.kill();
      this.wrapper = null;
    }
  }

  /**
   * Returns whether a sandbox is currently active.
   */
  isActive(): boolean {
    return this.wrapper !== null;
  }

  /**
   * Executes a shell command in the sandbox.
   *
   * @param command The shell command to run.
   * @returns The command result (stdout, stderr, exitCode).
   * @throws If the sandbox is not active.
   */
  async exec(command: string): Promise<CommandResult> {
    if (!this.wrapper) {
      throw new Error("Sandbox is not active. Call create() before exec().");
    }
    return await this.wrapper.exec(command);
  }

  /**
   * Uploads a file to the sandbox filesystem.
   *
   * @param filePath Absolute path inside the sandbox (e.g., "/workspace/src/foo.ts").
   * @param content File content as a string.
   */
  async uploadFile(filePath: string, content: string): Promise<void> {
    if (!this.wrapper) {
      throw new Error("Sandbox is not active. Call create() before uploadFile().");
    }
    await this.wrapper.uploadFile(filePath, content);
  }

  /**
   * Returns the underlying E2B or OpenSandbox instance for advanced operations.
   * @throws If the sandbox is not active.
   */
  getSandbox(): E2BSandbox | OSandbox {
    if (!this.wrapper) {
      throw new Error("Sandbox is not active.");
    }
    return this.wrapper.getInternalInstance();
  }
}
