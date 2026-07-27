import { describe, expect, it } from "vitest"
import {
  buildWebRetrievalHealthProjection,
} from "../packages/core/src/diagnostics/web-retrieval-health.ts"

describe("task008 web retrieval health projection", () => {
  it("reports ready only when both tools and provider are ready", () => {
    expect(buildWebRetrievalHealthProjection({
      registeredToolNames: ["web_search", "web_fetch"],
      providerState: "reachable",
    })).toEqual({
      status: "ready",
      searchRegistered: true,
      fetchRegistered: true,
      reasonCode: null,
    })
  })

  it("reports sanitized degraded provider states", () => {
    expect(buildWebRetrievalHealthProjection({
      registeredToolNames: ["web_search", "web_fetch"],
      providerState: "rate_limited",
    })).toEqual({
      status: "degraded",
      searchRegistered: true,
      fetchRegistered: true,
      reasonCode: "web_search_rate_limited",
    })
  })

  it("reports unavailable without leaking internal details", () => {
    const projection = buildWebRetrievalHealthProjection({
      registeredToolNames: ["web_fetch"],
      providerState: "unreachable",
    })
    expect(projection).toEqual({
      status: "unavailable",
      searchRegistered: false,
      fetchRegistered: true,
      reasonCode: "web_retrieval_tool_missing",
    })
    expect(JSON.stringify(projection)).not.toMatch(/endpoint|query|payload|stack|evidence/iu)
  })
})
