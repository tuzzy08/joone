import * as fs from "node:fs";
import * as path from "node:path";

/**
 * The shape of the Joone configuration file (~/.joone/config.json).
 */
export interface JooneConfig {
  provider: string;
  model: string;
  apiKey?: string;
  maxTokens: number;
  temperature: number;
  streaming: boolean;
  /** E2B sandbox template. If set, uses a pre-baked template (prod). If unset, uses default + lazy install (dev). */
  sandboxTemplate?: string;
  /** E2B API key for sandbox provisioning. */
  e2bApiKey?: string;
  /** Gemini API key for SecurityScanTool (Gemini CLI inside sandbox). */
  geminiApiKey?: string;
  /** Valyu API key for web search. */
  valyuApiKey?: string;
  /** LangSmith API key for tracing (optional). */
  langsmithApiKey?: string;
  /** LangSmith project name (optional, default: "joone"). */
  langsmithProject?: string;
}

/**
 * Sensible defaults — Anthropic Claude as the default provider.
 */
export const DEFAULT_CONFIG: JooneConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  maxTokens: 4096,
  temperature: 0,
  streaming: true,
};

/**
 * Maps provider names to their expected environment variable for the API key.
 */
const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  mistral: "MISTRAL_API_KEY",
  groq: "GROQ_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  fireworks: "FIREWORKS_API_KEY",
  together: "TOGETHER_API_KEY",
  // Ollama (local) doesn't need an API key
};

/**
 * Loads the Joone config from the specified path.
 * Returns DEFAULT_CONFIG if the file does not exist.
 * Falls back to environment variables for API key if not set in config.
 */
export function loadConfig(configPath: string): JooneConfig {
  let config: JooneConfig;

  if (!fs.existsSync(configPath)) {
    config = { ...DEFAULT_CONFIG };
  } else {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<JooneConfig>;
    config = { ...DEFAULT_CONFIG, ...parsed };
  }

  // Env var fallback: if apiKey is missing, check the provider's env var
  if (!config.apiKey) {
    const envVar = PROVIDER_ENV_VARS[config.provider];
    if (envVar && process.env[envVar]) {
      config.apiKey = process.env[envVar];
    }
  }

  return config;
}

/**
 * Saves the Joone config to the specified path.
 * Creates the parent directory if it doesn't exist.
 * Sets restrictive file permissions (owner-only read/write) for security.
 */
export function saveConfig(configPath: string, config: JooneConfig): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
    encoding: "utf-8",
    mode: 0o600, // Owner read/write only (Linux/macOS)
  });

  // On Unix systems, enforce permissions even if file already existed
  try {
    fs.chmodSync(configPath, 0o600);
  } catch {
    // chmod may fail on Windows — ignore silently
  }
}

/**
 * Returns the expected environment variable name for a provider's API key.
 */
export function getProviderEnvVar(provider: string): string | undefined {
  return PROVIDER_ENV_VARS[provider];
}
