import { type DuckDuckGoHtmlSearchDependencies } from "../../adapters/duckduckgo-html-search.js";
import type { SourceFreshnessPolicy } from "../../contracts/web-retrieval.js";
import type { AgentTool } from "../types.js";
interface WebSearchParams {
    query: string;
    maxResults?: number;
    locale?: string;
    safeSearch?: "strict" | "moderate";
    freshnessPolicy?: SourceFreshnessPolicy;
}
export declare function createWebSearchTool(dependencies?: DuckDuckGoHtmlSearchDependencies): AgentTool<WebSearchParams>;
export declare const webSearchTool: AgentTool<WebSearchParams>;
export {};
//# sourceMappingURL=web-search.d.ts.map