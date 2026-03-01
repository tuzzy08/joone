/**
 * Type declaration for @valyu/ai-sdk.
 *
 * This is a minimal stub so TypeScript compiles without requiring the
 * package to be installed. The actual SDK is dynamically imported at runtime.
 */
declare module "@valyu/ai-sdk" {
  interface ValyuOptions {
    apiKey: string;
  }

  interface SearchParams {
    query: string;
    maxResults?: number;
  }

  interface SearchResult {
    title?: string;
    url?: string;
    snippet?: string;
    content?: string;
  }

  interface SearchResponse {
    results: SearchResult[];
  }

  export class Valyu {
    constructor(options: ValyuOptions);
    search(params: SearchParams): Promise<SearchResponse>;
    paperSearch(params: SearchParams): Promise<SearchResponse>;
    financeSearch(params: SearchParams): Promise<SearchResponse>;
    patentSearch(params: SearchParams): Promise<SearchResponse>;
    secSearch(params: SearchParams): Promise<SearchResponse>;
    companyResearch(params: SearchParams): Promise<SearchResponse>;
  }
}
