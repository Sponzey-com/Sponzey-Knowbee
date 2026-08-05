export type WebRetrievalProviderState = "reachable" | "rate_limited" | "unreachable" | "unknown";
export interface WebRetrievalHealthProjection {
    status: "ready" | "degraded" | "unavailable";
    searchRegistered: boolean;
    fetchRegistered: boolean;
    reasonCode: "web_search_rate_limited" | "web_search_provider_unreachable" | "web_search_provider_unknown" | "web_retrieval_tool_missing" | null;
}
export declare function buildWebRetrievalHealthProjection(input: {
    registeredToolNames: readonly string[];
    providerState: WebRetrievalProviderState;
}): WebRetrievalHealthProjection;
//# sourceMappingURL=web-retrieval-health.d.ts.map