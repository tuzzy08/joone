import { SandboxManager } from "./manager.js";

/**
 * LazyInstaller handles on-demand tool installation inside the sandbox.
 *
 * - In DEV mode (no custom template), tools are installed lazily on first use.
 * - In PROD mode (custom template like "joone-base"), tools are pre-baked —
 *   the installer detects this and skips installation.
 *
 * Install state is cached per session so each tool is installed at most once.
 */
export class LazyInstaller {
  private geminiCliInstalled = false;
  private osvScannerInstalled = false;
  private readonly usingCustomTemplate: boolean;

  constructor(usingCustomTemplate: boolean) {
    this.usingCustomTemplate = usingCustomTemplate;

    // If using a custom template, assume all tools are pre-installed
    if (usingCustomTemplate) {
      this.geminiCliInstalled = true;
      this.osvScannerInstalled = true;
    }
  }

  /**
   * Ensures Gemini CLI + security extension are available in the sandbox.
   * Installs them if needed (dev mode). No-op if using a custom template.
   *
   * @returns true if Gemini CLI is now available.
   */
  async ensureGeminiCli(sandbox: SandboxManager): Promise<boolean> {
    if (this.geminiCliInstalled) return true;

    try {
      // Check if already installed
      const check = await sandbox.exec("gemini --version");
      if (check.exitCode === 0) {
        this.geminiCliInstalled = true;
        return true;
      }
    } catch {
      // Not installed — proceed to install
    }

    try {
      // Install Gemini CLI globally
      const install = await sandbox.exec(
        "npm install -g @google/gemini-cli 2>&1"
      );
      if (install.exitCode !== 0) {
        return false;
      }

      // Install security extension
      const ext = await sandbox.exec(
        "gemini extensions install https://github.com/gemini-cli-extensions/security 2>&1"
      );
      if (ext.exitCode !== 0) {
        // CLI installed but extension failed — still partially useful
        this.geminiCliInstalled = true;
        return true;
      }

      this.geminiCliInstalled = true;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensures OSV-Scanner is available in the sandbox.
   * Falls back gracefully — callers should use npm audit if this returns false.
   *
   * @returns true if osv-scanner is now available.
   */
  async ensureOsvScanner(sandbox: SandboxManager): Promise<boolean> {
    if (this.osvScannerInstalled) return true;

    try {
      const check = await sandbox.exec("osv-scanner --version");
      if (check.exitCode === 0) {
        this.osvScannerInstalled = true;
        return true;
      }
    } catch {
      // Not installed
    }

    try {
      // Try to install via go or download binary
      const install = await sandbox.exec(
        "curl -sSfL https://github.com/google/osv-scanner/releases/latest/download/osv-scanner_linux_amd64 -o /usr/local/bin/osv-scanner && chmod +x /usr/local/bin/osv-scanner 2>&1"
      );
      if (install.exitCode === 0) {
        this.osvScannerInstalled = true;
        return true;
      }
    } catch {
      // Install failed
    }

    return false;
  }

  /**
   * Returns whether Gemini CLI is installed (cached state).
   */
  isGeminiCliReady(): boolean {
    return this.geminiCliInstalled;
  }

  /**
   * Returns whether OSV-Scanner is installed (cached state).
   */
  isOsvScannerReady(): boolean {
    return this.osvScannerInstalled;
  }
}
