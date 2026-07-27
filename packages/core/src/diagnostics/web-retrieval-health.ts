export type WebRetrievalProviderState =
  | "reachable"
  | "rate_limited"
  | "unreachable"
  | "unknown"

export interface WebRetrievalHealthProjection {
  status: "ready" | "degraded" | "unavailable"
  searchRegistered: boolean
  fetchRegistered: boolean
  reasonCode:
    | "web_search_rate_limited"
    | "web_search_provider_unreachable"
    | "web_search_provider_unknown"
    | "web_retrieval_tool_missing"
    | null
}

export function buildWebRetrievalHealthProjection(input: {
  registeredToolNames: readonly string[]
  providerState: WebRetrievalProviderState
}): WebRetrievalHealthProjection {
  const tools = new Set(input.registeredToolNames)
  const searchRegistered = tools.has("web_search")
  const fetchRegistered = tools.has("web_fetch")
  if (!searchRegistered || !fetchRegistered) {
    return {
      status: "unavailable",
      searchRegistered,
      fetchRegistered,
      reasonCode: "web_retrieval_tool_missing",
    }
  }
  if (input.providerState === "reachable") {
    return {
      status: "ready",
      searchRegistered,
      fetchRegistered,
      reasonCode: null,
    }
  }
  const reasonCode =
    input.providerState === "rate_limited"
      ? "web_search_rate_limited"
      : input.providerState === "unreachable"
        ? "web_search_provider_unreachable"
        : "web_search_provider_unknown"
  return {
    status: "degraded",
    searchRegistered,
    fetchRegistered,
    reasonCode,
  }
}
