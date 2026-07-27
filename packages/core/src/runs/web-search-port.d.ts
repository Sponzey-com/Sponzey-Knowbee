import type { WebSearchQuery, WebSearchResult } from "../contracts/web-retrieval.js";
export interface WebSearchInput extends WebSearchQuery {
    signal: AbortSignal;
}
export type WebSearchFailureReason = "web_search_cancelled" | "web_search_timeout" | "web_search_network_failed" | "web_search_provider_rejected" | "web_search_rate_limited" | "web_search_provider_unavailable" | "web_search_response_too_large" | "web_search_no_results" | "web_search_markup_changed" | "web_search_evidence_invalid";
export type WebSearchOutcome = {
    ok: true;
    provider: "DuckDuckGo";
    retrievedAt: string;
    results: readonly WebSearchResult[];
    markdown: string;
} | {
    ok: false;
    reasonCode: WebSearchFailureReason;
    retryable: boolean;
};
export type WebSearchPort = (input: WebSearchInput) => Promise<WebSearchOutcome>;
//# sourceMappingURL=web-search-port.d.ts.map