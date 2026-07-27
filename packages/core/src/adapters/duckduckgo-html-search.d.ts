import { type WebSearchResult } from "../contracts/web-retrieval.js";
import type { WebSearchPort } from "../runs/web-search-port.js";
export interface DuckDuckGoProviderDescriptor {
    endpoint: string;
    userAgent: string;
    timeoutMs: number;
    maxResponseBytes: number;
}
export interface DuckDuckGoHtmlSearchDependencies {
    fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>;
    now?: () => Date;
    descriptor?: DuckDuckGoProviderDescriptor;
}
export declare const DEFAULT_DUCKDUCKGO_PROVIDER: Readonly<DuckDuckGoProviderDescriptor>;
export declare function parseDuckDuckGoHtmlResults(input: {
    html: string;
    maxResults: number;
    fetchedAt: string;
}): WebSearchResult[];
export declare function createDuckDuckGoHtmlSearchAdapter(dependencies?: DuckDuckGoHtmlSearchDependencies): WebSearchPort;
//# sourceMappingURL=duckduckgo-html-search.d.ts.map