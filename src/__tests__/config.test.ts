import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// We will import these once they exist — test-first.
import { loadConfig, saveConfig, DEFAULT_CONFIG } from "../cli/config.js";

describe("Config Manager", () => {
  // Use a temp directory so we never touch the real ~/.joone
  let tempDir: string;
  let configPath: string;
  let savedAnthropicKey: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "joone-test-"));
    configPath = path.join(tempDir, "config.json");
    // Isolate from vitest.config.ts env vars
    savedAnthropicKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    // Restore env var
    if (savedAnthropicKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedAnthropicKey;
    }
  });

  // ─── RED Test #1: loadConfig returns defaults when file doesn't exist ───

  it("returns default config when config file does not exist", () => {
    const config = loadConfig(configPath);

    expect(config.provider).toBe("anthropic");
    expect(config.model).toBe("claude-sonnet-4-20250514");
    expect(config.apiKey).toBeUndefined();
    expect(config.maxTokens).toBe(4096);
    expect(config.temperature).toBe(0);
    expect(config.streaming).toBe(true);
  });

  // ─── RED Test #2: saveConfig roundtrips with loadConfig ───

  it("saves config to disk and loads it back correctly", () => {
    const custom = {
      ...DEFAULT_CONFIG,
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-test-key-123",
      streaming: false,
    };

    saveConfig(configPath, custom);

    // File should exist now
    expect(fs.existsSync(configPath)).toBe(true);

    // Load it back — should match what was saved
    const loaded = loadConfig(configPath);
    expect(loaded.provider).toBe("openai");
    expect(loaded.model).toBe("gpt-4o");
    expect(loaded.apiKey).toBe("sk-test-key-123");
    expect(loaded.streaming).toBe(false);
    // Fields we didn't override should keep defaults
    expect(loaded.maxTokens).toBe(4096);
    expect(loaded.temperature).toBe(0);
  });

  // ─── RED Test #3: loadConfig uses env var fallback for API key ───

  it("falls back to ANTHROPIC_API_KEY env var when apiKey is missing from config", () => {
    // Save a config WITHOUT an apiKey
    const noKeyConfig = {
      ...DEFAULT_CONFIG,
      provider: "anthropic",
    };
    saveConfig(configPath, noKeyConfig);

    // Set the env var
    const originalEnv = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-from-env";

    try {
      const config = loadConfig(configPath);
      expect(config.apiKey).toBe("sk-ant-from-env");
    } finally {
      // Restore env
      if (originalEnv === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = originalEnv;
      }
    }
  });
});
