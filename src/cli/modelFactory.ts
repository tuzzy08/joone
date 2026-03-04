import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { pathToFileURL } from "node:url";
import * as path from "node:path";
import { JooneConfig } from "./config.js";
import { getProviderDir, PROVIDER_PACKAGE_MAP } from "./providers.js";

/**
 * Providers that do NOT require an API key (e.g. local models).
 */
const NO_KEY_PROVIDERS = new Set(["ollama"]);

import { createRequire } from "node:module";

/**
 * Attempts to dynamically import a provider package.
 * First tries the user-local ~/.joone/providers/node_modules directory.
 * If that fails, falls back to a standard require/import for bundled setups.
 */
async function loadProviderPackage(provider: string): Promise<any> {
  const packageName = PROVIDER_PACKAGE_MAP[provider];
  if (!packageName) {
    throw new Error(`Unknown package name for provider: ${provider}`);
  }

  // 1. Try user-local plugin directory
  const localPluginPath = path.join(getProviderDir(), "node_modules", packageName);
  try {
    // Node.js ESM cannot import absolute directories (ERR_UNSUPPORTED_DIR_IMPORT).
    // We must use createRequire to resolve the actual package.json "main" or "exports" entry point.
    const require = createRequire(import.meta.url);
    const resolvedPath = require.resolve(localPluginPath);
    return await import(pathToFileURL(resolvedPath).href);
  } catch (err: any) {
    // Ignore MODULE_NOT_FOUND or similar errors and fallback
    if (err.code !== "ERR_MODULE_NOT_FOUND" && !err.message.includes("Cannot find module")) {
       // console.debug(`Failed to load from plugin dir:`, err.message);
    }
  }

  // 2. Fallback to standard resolution (for npx, bundled versions, etc)
  try {
    return await import(packageName);
  } catch (err: any) {
    throw new Error(`Provider "${provider}" requires the ${packageName} package.\nRun: joone provider add ${provider}`);
  }
}

/**
 * Model Factory
 *
 * Creates a LangChain BaseChatModel based on the JooneConfig.
 * Uses dynamic imports so only the selected provider's package is loaded.
 */
export async function createModel(config: JooneConfig): Promise<BaseChatModel> {
  const { provider, model, apiKey, maxTokens, temperature } = config;

  // API key validation for cloud providers
  if (!NO_KEY_PROVIDERS.has(provider) && !apiKey) {
    throw new Error(
      `API key is required for provider "${provider}". Run: joone config`
    );
  }

  try {
    switch (provider) {
      case "anthropic": {
        const pkg = await loadProviderPackage(provider);
        const ChatAnthropic = pkg.ChatAnthropic || pkg.default?.ChatAnthropic;
        return new ChatAnthropic({
          modelName: model,
          anthropicApiKey: apiKey,
          maxTokens,
          temperature,
        });
      }

      case "openai": {
        const pkg = await loadProviderPackage(provider);
        const ChatOpenAI = pkg.ChatOpenAI || pkg.default?.ChatOpenAI;
        return new ChatOpenAI({
          modelName: model,
          openAIApiKey: apiKey,
          maxTokens,
          temperature,
        });
      }

      case "google": {
        const pkg = await loadProviderPackage(provider);
        // Specifically for Google, LangChain frequently uses ChatGoogleGenerativeAI
        const ChatGoogle = pkg.ChatGoogleGenerativeAI || pkg.default?.ChatGoogleGenerativeAI || pkg.ChatGoogleGenAI || pkg.default?.ChatGoogleGenAI;
        
        if (!apiKey) {
          throw new Error("API key is required for provider \"google\". Run: joone config");
        }

        return new ChatGoogle({
          model: model,
          apiKey: apiKey,
          maxOutputTokens: maxTokens,
          temperature,
        });
      }

      case "mistral": {
        const { ChatMistralAI } = await loadProviderPackage(provider);
        return new ChatMistralAI({
          modelName: model,
          apiKey: apiKey,
          maxTokens,
          temperature,
        });
      }

      case "groq": {
        const { ChatGroq } = await loadProviderPackage(provider);
        return new ChatGroq({
          modelName: model,
          apiKey: apiKey,
          maxTokens,
          temperature,
        });
      }

      case "deepseek": {
        const { ChatDeepSeek } = await loadProviderPackage(provider);
        return new ChatDeepSeek({
          modelName: model,
          apiKey: apiKey,
          maxTokens,
          temperature,
        });
      }

      case "fireworks": {
        const { ChatFireworks } = await loadProviderPackage(provider);
        return new ChatFireworks({
          modelName: model,
          fireworksApiKey: apiKey,
          maxTokens,
          temperature,
        });
      }

      case "together": {
        const { ChatTogetherAI } = await loadProviderPackage(provider);
        return new ChatTogetherAI({
          modelName: model,
          togetherAIApiKey: apiKey,
          maxTokens,
          temperature,
        });
      }

      case "ollama": {
        const { ChatOllama } = await loadProviderPackage(provider);
        return new ChatOllama({
          model: model,
          maxTokens,
          temperature,
        });
      }

      default:
        throw new Error(
          `Unsupported provider: "${provider}". Supported providers: anthropic, openai, google, mistral, groq, deepseek, fireworks, together, ollama.`
        );
    }
  } catch (e: unknown) {
    // If LangChain itself throws an API key error (sometimes they do runtime checks)
    if (e instanceof Error && e.message.includes("API key")) throw e;
    throw e; // Rethrow the loadProviderPackage message or other unexpected errors
  }
}
