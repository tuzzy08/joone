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
  /** OpenSandbox API key for sandbox fallback provisioning. */
  openSandboxApiKey?: string;
  /** OpenSandbox API Domain for fallback. */
  openSandboxDomain?: string;
  /** Gemini API key for SecurityScanTool (Gemini CLI inside sandbox). */
  geminiApiKey?: string;
  /** Valyu API key for web search. */
  valyuApiKey?: string;
  /** LangSmith API key for tracing (optional). */
  langsmithApiKey?: string;
  /** LangSmith project name (optional, default: "joone"). */
  langsmithProject?: string;
  /** Tool permission mode: 'auto' (no prompts), 'ask_dangerous' (prompt for destructive tools), 'ask_all' (prompt for everything). */
  permissionMode?: "auto" | "ask_dangerous" | "ask_all";
  /** Override model for context compaction (default: auto-selected fast model from same provider). */
  compactModel?: string;
  /** Override model for sub-agents (default: auto-selected fast model from same provider). */
  subAgentModel?: string;
  /** Execution mode: 'host' (local shell) or 'sandbox' (secure cloud). */
  executionMode?: "host" | "sandbox";
  /** Desktop appearance preference. */
  appearance?: "light" | "dark";
  /** Desktop notification preferences. */
  notifications?: {
    permissions: boolean;
    completionSummary: boolean;
    needsAttention: boolean;
  };
  /** Desktop update preferences. */
  updates?: {
    autoCheck: boolean;
  };
  /** Persisted provider-specific connection settings for the desktop app. */
  providerConnections?: Record<
    string,
    {
      apiKey?: string;
      baseUrl?: string;
      connected?: boolean;
      defaultModel?: string;
    }
  >;
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
  permissionMode: "auto",
  executionMode: "host",
  appearance: "light",
  notifications: {
    permissions: true,
    completionSummary: true,
    needsAttention: true,
  },
  updates: {
    autoCheck: true,
  },
  providerConnections: {
    anthropic: {
      connected: false,
      defaultModel: "claude-sonnet-4-20250514",
    },
  },
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
    try {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<JooneConfig>;
      config = migrateConfig({ ...DEFAULT_CONFIG, ...parsed });
    } catch (err) {
      console.warn(`Warning: Failed to parse config at ${configPath}. Using defaults.`);
      config = { ...DEFAULT_CONFIG };
    }
  }
  config = migrateConfig(config);
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
  const normalized = migrateConfig(config);
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  fs.writeFileSync(configPath, JSON.stringify(normalized, null, 2), {
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

function migrateConfig(config: JooneConfig): JooneConfig {
  const defaultNotifications = DEFAULT_CONFIG.notifications ?? {
    permissions: true,
    completionSummary: true,
    needsAttention: true,
  };
  const defaultUpdates = DEFAULT_CONFIG.updates ?? {
    autoCheck: true,
  };
  const providerConnections = {
    ...(DEFAULT_CONFIG.providerConnections ?? {}),
    ...(config.providerConnections ?? {}),
  };

  // Keep the active provider's nested connection settings in sync with the
  // legacy top-level provider/model/apiKey fields so older config files and
  // newer desktop settings can coexist without data loss.
  const activeConnection = {
    ...(providerConnections[config.provider] ?? {}),
  };

  if (!activeConnection.defaultModel) {
    activeConnection.defaultModel = config.model;
  }
  if (config.apiKey && !activeConnection.apiKey) {
    activeConnection.apiKey = config.apiKey;
  }
  if (activeConnection.connected === undefined) {
    activeConnection.connected = false;
  }

  providerConnections[config.provider] = activeConnection;

  return {
    ...DEFAULT_CONFIG,
    ...config,
    appearance: config.appearance ?? DEFAULT_CONFIG.appearance,
    notifications: {
      permissions: config.notifications?.permissions ?? defaultNotifications.permissions,
      completionSummary:
        config.notifications?.completionSummary ?? defaultNotifications.completionSummary,
      needsAttention:
        config.notifications?.needsAttention ?? defaultNotifications.needsAttention,
    },
    updates: {
      autoCheck: config.updates?.autoCheck ?? defaultUpdates.autoCheck,
    },
    providerConnections,
    apiKey: activeConnection.apiKey ?? config.apiKey,
    model: activeConnection.defaultModel ?? config.model,
  };
}
