import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { JooneConfig } from "./config.js";

/**
 * Providers that do NOT require an API key (e.g. local models).
 */
const NO_KEY_PROVIDERS = new Set(["ollama"]);

/**
 * Model Factory
 *
 * Creates a LangChain BaseChatModel based on the JooneConfig.
 * Uses dynamic imports so only the selected provider's package is loaded.
 * If a provider package isn't installed, throws a helpful error.
 */
export async function createModel(config: JooneConfig): Promise<BaseChatModel> {
  const { provider, model, apiKey, maxTokens, temperature } = config;

  // API key validation for cloud providers
  if (!NO_KEY_PROVIDERS.has(provider) && !apiKey) {
    throw new Error(
      `API key is required for provider "${provider}". Run: joone config`
    );
  }

  switch (provider) {
    case "anthropic": {
      try {
        const { ChatAnthropic } = await import("@langchain/anthropic");
        return new ChatAnthropic({
          modelName: model,
          anthropicApiKey: apiKey,
          maxTokens,
          temperature,
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("API key")) throw e;
        throw new Error(
          `Provider "anthropic" requires the @langchain/anthropic package.\nRun: npm install @langchain/anthropic`
        );
      }
    }

    case "openai": {
      try {
        const { ChatOpenAI } = await import("@langchain/openai");
        return new ChatOpenAI({
          modelName: model,
          openAIApiKey: apiKey,
          maxTokens,
          temperature,
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("API key")) throw e;
        throw new Error(
          `Provider "openai" requires the @langchain/openai package.\nRun: npm install @langchain/openai`
        );
      }
    }

    default:
      throw new Error(
        `Unsupported provider: "${provider}". Supported providers: anthropic, openai, google, mistral, groq, deepseek, fireworks, together, ollama.`
      );
  }
}
