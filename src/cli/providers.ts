import spawn from "cross-spawn";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

/**
 * Returns the absolute path to the user-local providers directory.
 */
export function getProviderDir(): string {
  return path.join(os.homedir(), ".joone", "providers");
}

/**
 * Maps the internal Joone provider name to the official LangChain NPM package name.
 */
export const PROVIDER_PACKAGE_MAP: Record<string, string> = {
  anthropic: "@langchain/anthropic",
  openai: "@langchain/openai",
  google: "@langchain/google-genai",
  mistral: "@langchain/mistralai",
  groq: "@langchain/groq",
  deepseek: "@langchain/deepseek",
  fireworks: "@langchain/community",
  together: "@langchain/community",
  ollama: "@langchain/ollama"
};

/**
 * Installs the NPM package for the given provider into the user-local `~/.joone/providers` directory.
 * @param provider The internal Joone provider name (e.g., "google")
 */
export async function installProvider(provider: string): Promise<void> {
  const packageName = PROVIDER_PACKAGE_MAP[provider];
  if (!packageName) {
    throw new Error(`Unknown provider: "${provider}"`);
  }

  const providerDir = getProviderDir();
  
  // Ensure the directory exists
  if (!fs.existsSync(providerDir)) {
    fs.mkdirSync(providerDir, { recursive: true });
  }

  return new Promise((resolve, reject) => {
    // We use --no-save to avoid creating a package.json and --no-package-lock to avoid lockfiles
    // in this isolated directory, keeping it clean and fast.
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const args = ["install", packageName, "--prefix", providerDir, "--no-save", "--no-package-lock"];
    
    // Using cross-spawn automatically handles Windows command resolution securely without shell:true
    const child = spawn(npmCmd, args, {
      stdio: "ignore", // Suppress NPM's verbose output during install
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to install ${packageName} (npm install exited with code ${code})`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn npm install: ${err.message}`));
    });
  });
}

/**
 * Uninstalls the NPM package for the given provider from the user-local `~/.joone/providers` directory.
 * @param provider The internal Joone provider name (e.g., "google")
 */
export async function uninstallProvider(provider: string): Promise<void> {
  const packageName = PROVIDER_PACKAGE_MAP[provider];
  if (!packageName) {
    throw new Error(`Unknown provider: "${provider}"`);
  }

  const providerDir = getProviderDir();
  
  // If the directory doesn't exist, it's already uninstalled implicitly
  if (!fs.existsSync(providerDir)) {
    return;
  }

  return new Promise((resolve, reject) => {
    const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const args = ["uninstall", packageName, "--prefix", providerDir, "--no-save", "--no-package-lock"];
    
    const child = spawn(npmCmd, args, {
      stdio: "ignore",
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to uninstall ${packageName} (npm uninstall exited with code ${code})`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn npm uninstall: ${err.message}`));
    });
  });
}
