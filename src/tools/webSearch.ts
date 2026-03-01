import { DynamicToolInterface, ToolResult } from "./index.js";

/**
 * Web Search Tool — wraps the Valyu AI Search SDK.
 *
 * Provides AI-optimized web search and domain-specific search
 * (papers, finance, patents, SEC filings, etc.). Runs on the Host
 * (API call, not a shell command).
 *
 * Requires a Valyu API key in config (`valyuApiKey`).
 */

let _valyuApiKey: string | undefined;

/**
 * Bind the Valyu API key at session start.
 */
export function bindValyuApiKey(key: string | undefined): void {
  _valyuApiKey = key;
}

export const WebSearchTool: DynamicToolInterface = {
  name: "web_search",
  description:
    "Search the web for information. Supports general web search and specialized sources: " +
    "papers (arXiv/PubMed), finance, patents, SEC filings, companies. " +
    "Returns AI-optimized structured results.",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query",
      },
      source: {
        type: "string",
        enum: ["web", "papers", "finance", "patents", "sec", "companies"],
        description:
          'Search source (default: "web"). Use "papers" for academic, "finance" for financial data, etc.',
      },
      maxResults: {
        type: "number",
        description: "Maximum number of results to return (default: 5)",
      },
    },
    required: ["query"],
  },
  execute: async (args: {
    query: string;
    source?: string;
    maxResults?: number;
  }): Promise<ToolResult> => {
    if (!_valyuApiKey) {
      return {
        content:
          "Error: Valyu API key not configured.\n" +
          'Run `joone config` and set your Valyu API key, or add "valyuApiKey" to ~/.joone/config.json.',
        isError: true
      };
    }

    const source = args.source ?? "web";
    const maxResults = args.maxResults ?? 5;

    try {
      // Dynamic import to avoid requiring the dependency at startup
      const { Valyu } = await import("@valyu/ai-sdk");

      const valyu = new Valyu({ apiKey: _valyuApiKey });

      let results: any;

      switch (source) {
        case "web":
          results = await valyu.search({
            query: args.query,
            maxResults,
          });
          break;
        case "papers":
          results = await valyu.paperSearch({
            query: args.query,
            maxResults,
          });
          break;
        case "finance":
          results = await valyu.financeSearch({
            query: args.query,
            maxResults,
          });
          break;
        case "patents":
          results = await valyu.patentSearch({
            query: args.query,
            maxResults,
          });
          break;
        case "sec":
          results = await valyu.secSearch({
            query: args.query,
            maxResults,
          });
          break;
        case "companies":
          results = await valyu.companyResearch({
            query: args.query,
            maxResults,
          });
          break;
        default:
          return {
            content: `Error: Unknown source "${source}". Use: web, papers, finance, patents, sec, companies.`,
            isError: true
          };
      }

      // Format results for the LLM
      if (!results || !results.results || results.results.length === 0) {
        return { content: `No results found for "${args.query}" in ${source} source.` };
      }

      const formatted = results.results
        .map(
          (r: any, i: number) =>
            `${i + 1}. **${r.title || "Untitled"}**\n   ${r.url || ""}\n   ${r.snippet || r.content || ""}`
        )
        .join("\n\n");

      return { content: `Search results for "${args.query}" (${source}):\n\n${formatted}` };
    } catch (error: any) {
      if (error.code === "ERR_MODULE_NOT_FOUND" || error.code === "MODULE_NOT_FOUND") {
        return {
          content:
            "Error: @valyu/ai-sdk is not installed.\n" +
            "Run: npm install @valyu/ai-sdk",
          isError: true
        };
      }
      return { content: `Search error: ${error.message}`, isError: true };
    }
  },
};
