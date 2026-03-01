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

    case "google": {
      try {
        // @ts-ignore
        const { ChatGoogleGenAI } = await import("@langchain/google-genai");
        return new ChatGoogleGenAI({
          modelName: model,
          apiKey: apiKey,
          maxOutputTokens: maxTokens,
          temperature,
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("API key")) throw e;
        throw new Error(
          `Provider "google" requires the @langchain/google-genai package.\nRun: npm install @langchain/google-genai`
        );
      }
    }

    case "mistral": {
      try {
        // @ts-ignore
        const { ChatMistralAI } = await import("@langchain/mistralai");
        return new ChatMistralAI({
          modelName: model,
          apiKey: apiKey,
          maxTokens,
          temperature,
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("API key")) throw e;
        throw new Error(
          `Provider "mistral" requires the @langchain/mistralai package.\nRun: npm install @langchain/mistralai`
        );
      }
    }

    case "groq": {
      try {
        // @ts-ignore
        const { ChatGroq } = await import("@langchain/groq");
        return new ChatGroq({
          modelName: model,
          apiKey: apiKey,
          maxTokens,
          temperature,
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("API key")) throw e;
        throw new Error(
          `Provider "groq" requires the @langchain/groq package.\nRun: npm install @langchain/groq`
        );
      }
    }

    case "deepseek": {
      try {
        // @ts-ignore
        const { ChatDeepSeek } = await import("@langchain/deepseek");
        return new ChatDeepSeek({
          modelName: model,
          apiKey: apiKey,
          maxTokens,
          temperature,
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("API key")) throw e;
        throw new Error(
          `Provider "deepseek" requires the @langchain/deepseek package.\nRun: npm install @langchain/deepseek`
        );
      }
    }

    case "fireworks": {
      try {
        // @ts-ignore
        const { ChatFireworks } = await import("@langchain/community/chat_models/fireworks");
        return new ChatFireworks({
          modelName: model,
          fireworksApiKey: apiKey,
          maxTokens,
          temperature,
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("API key")) throw e;
        throw new Error(
          `Provider "fireworks" requires the @langchain/community package.\nRun: npm install @langchain/community`
        );
      }
    }

    case "together": {
      try {
        // @ts-ignore
        const { ChatTogetherAI } = await import("@langchain/community/chat_models/togetherai");
        return new ChatTogetherAI({
          modelName: model,
          togetherAIApiKey: apiKey,
          maxTokens,
          temperature,
        });
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes("API key")) throw e;
        throw new Error(
          `Provider "together" requires the @langchain/community package.\nRun: npm install @langchain/community`
        );
      }
    }

    case "ollama": {
      try {
        // @ts-ignore
        const { ChatOllama } = await import("@langchain/ollama");
        return new ChatOllama({
          model: model,
          maxTokens,
          temperature,
        });
      } catch (e: unknown) {
        throw new Error(
          `Provider "ollama" requires the @langchain/ollama package.\nRun: npm install @langchain/ollama`
        );
      }
    }

    default:
      throw new Error(
        `Unsupported provider: "${provider}". Supported providers: anthropic, openai, google, mistral, groq, deepseek, fireworks, together, ollama.`
      );
  }
}
