import { describe, it, expect } from "vitest";
import { JooneConfig, DEFAULT_CONFIG } from "../cli/config.js";
import { createModel } from "../cli/modelFactory.js";

describe("Model Factory", () => {
  // ─── RED Test #4: createModel returns a ChatAnthropic for "anthropic" ───

  it("creates an Anthropic model when provider is 'anthropic'", async () => {
    const config: JooneConfig = {
      ...DEFAULT_CONFIG,
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKey: "sk-ant-test-key",
    };

    const model = await createModel(config);

    // The model should have the correct type identifier
    expect(model).toBeDefined();
    expect(model.constructor.name).toContain("ChatAnthropic");
  }, 15000);

  // ─── RED Test #5: createModel returns a ChatOpenAI for "openai" ───

  it("creates an OpenAI model when provider is 'openai'", async () => {
    const config: JooneConfig = {
      ...DEFAULT_CONFIG,
      provider: "openai",
      model: "gpt-4o",
      apiKey: "sk-openai-test-key",
    };

    const model = await createModel(config);

    expect(model).toBeDefined();
    expect(model.constructor.name).toContain("ChatOpenAI");
  }, 15000);

  // ─── RED Test #6: createModel throws if API key is missing ───

  it("throws a descriptive error when API key is missing for a cloud provider", async () => {
    const config: JooneConfig = {
      ...DEFAULT_CONFIG,
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      apiKey: undefined,
    };

    await expect(createModel(config)).rejects.toThrow(/API key/i);
  });

  // ─── RED Test #7: createModel throws with install command for missing package ───

  it("throws an error with install instructions for unsupported/missing provider", async () => {
    const config: JooneConfig = {
      ...DEFAULT_CONFIG,
      provider: "unknown-provider",
      apiKey: "some-key",
    };

    await expect(createModel(config)).rejects.toThrow(/unsupported provider/i);
  });
});
