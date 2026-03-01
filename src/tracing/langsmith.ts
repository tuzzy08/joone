/**
 * LangSmith Integration — thin configuration layer.
 *
 * LangChain has built-in LangSmith tracing via environment variables.
 * This module reads from JooneConfig and sets the required env vars
 * so LangChain auto-traces to LangSmith when enabled.
 *
 * Required env vars for LangSmith:
 *   LANGCHAIN_TRACING_V2=true
 *   LANGCHAIN_API_KEY=<key>
 *   LANGCHAIN_PROJECT=<project>  (optional, defaults to "joone")
 */

interface LangSmithConfig {
  apiKey: string;
  project?: string;
}

/**
 * Enables LangSmith tracing by setting the required environment variables.
 * LangChain will automatically detect these and send traces.
 */
export function enableLangSmith(config: LangSmithConfig): void {
  process.env.LANGCHAIN_TRACING_V2 = "true";
  process.env.LANGCHAIN_API_KEY = config.apiKey;
  process.env.LANGCHAIN_PROJECT = config.project ?? "joone";
}

/**
 * Disables LangSmith tracing.
 */
export function disableLangSmith(): void {
  delete process.env.LANGCHAIN_TRACING_V2;
  delete process.env.LANGCHAIN_API_KEY;
  delete process.env.LANGCHAIN_PROJECT;
}

/**
 * Checks if LangSmith tracing is currently enabled.
 */
export function isLangSmithEnabled(): boolean {
  return (
    process.env.LANGCHAIN_TRACING_V2 === "true" &&
    !!process.env.LANGCHAIN_API_KEY
  );
}

/**
 * Attempts to enable LangSmith from JooneConfig values.
 * Returns true if successfully enabled.
 */
export function tryEnableLangSmithFromConfig(config: {
  langsmithApiKey?: string;
  langsmithProject?: string;
}): boolean {
  if (!config.langsmithApiKey) return false;

  enableLangSmith({
    apiKey: config.langsmithApiKey,
    project: config.langsmithProject,
  });
  return true;
}
