import * as fs from "node:fs";
import * as path from "node:path";
import { SandboxManager } from "./manager.js";

/**
 * Tracks file changes on the host and syncs them to the sandbox.
 *
 * Strategy: Upload-on-execute.
 * Before each sandbox command, only changed files are uploaded.
 */
export class FileSync {
  /** Files that have been modified since the last sync. */
  private dirtyFiles = new Map<string, string>(); // hostPath → sandboxPath

  /** The base directory on the host that maps to /workspace in sandbox. */
  private readonly projectRoot: string;

  /** The base path inside the sandbox. */
  private readonly sandboxRoot: string;

  constructor(projectRoot: string, sandboxRoot: string = "/workspace") {
    this.projectRoot = projectRoot;
    this.sandboxRoot = sandboxRoot;
  }

  /**
   * Mark a file as dirty (changed on host, needs sync to sandbox).
   *
   * @param hostPath Absolute path on the host filesystem.
   */
  markDirty(hostPath: string): void {
    const relative = path.relative(this.projectRoot, hostPath);
    const sandboxPath = path.posix.join(this.sandboxRoot, relative.replace(/\\/g, "/"));
    this.dirtyFiles.set(hostPath, sandboxPath);
  }

  /**
   * Returns the number of files pending sync.
   */
  pendingCount(): number {
    return this.dirtyFiles.size;
  }

  /**
   * Syncs all dirty files to the sandbox.
   * Reads each file from the host and uploads it to the sandbox.
   *
   * @param sandbox The active SandboxManager.
   * @returns Number of files synced.
   */
  async syncToSandbox(sandbox: SandboxManager): Promise<number> {
    let synced = 0;

    for (const [hostPath, sandboxPath] of this.dirtyFiles) {
      try {
        const content = fs.readFileSync(hostPath, "utf-8");
        await sandbox.uploadFile(sandboxPath, content);
        synced++;
      } catch (error: any) {
        if (error.code === "ENOENT") {
          // File was deleted from the host before it could be synced.
          // We safely ignore this to prevent crashing the sync loop.
        } else {
          console.error(`Error reading ${hostPath} for sync:`, error.message);
        }
      }
    }

    this.dirtyFiles.clear();
    return synced;
  }

  /**
   * Performs an initial full sync of the project directory.
   * Uploads all files (excluding node_modules, .git, dist).
   *
   * @param sandbox The active SandboxManager.
   * @returns Number of files synced.
   */
  async initialSync(sandbox: SandboxManager): Promise<number> {
    const EXCLUDE_DIRS = new Set(["node_modules", ".git", "dist", ".next", "__pycache__"]);
    let synced = 0;

    const walkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!EXCLUDE_DIRS.has(entry.name)) {
            walkDir(fullPath);
          }
        } else if (entry.isFile()) {
          this.markDirty(fullPath);
        }
      }
    };

    walkDir(this.projectRoot);
    synced = await this.syncToSandbox(sandbox);
    return synced;
  }
}
