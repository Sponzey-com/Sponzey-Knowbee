import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"

import {
  createDuckDuckGoHtmlSearchAdapter,
  parseDuckDuckGoHtmlResults,
} from "../packages/core/src/adapters/duckduckgo-html-search.ts"

const fixture = readFileSync(
  "tests/fixtures/duckduckgo/search-results.html",
  "utf8",
)
const now = () => new Date("2026-07-24T04:00:00.000Z")

describe("task003 DuckDuckGo HTML search adapter", () => {
  it("parses organic results, unwraps redirects, removes duplicates, and projects Markdown", async () => {
    let requestedUrl = ""
    const fetcher = vi.fn(async (url: string | URL) => {
      requestedUrl = String(url)
      return new Response(fixture, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    })
    const search = createDuckDuckGoHtmlSearchAdapter({ fetcher, now })

    const outcome = await search({
      query: "Knowbee documentation",
      locale: "ko-KR",
      safeSearch: "moderate",
      maxResults: 8,
      signal: new AbortController().signal,
    })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(requestedUrl).toContain("html.duckduckgo.com/html/")
    expect(requestedUrl).toContain("q=Knowbee+documentation")
    expect(requestedUrl).toContain("kl=ko-kr")
    expect(outcome.results).toHaveLength(2)
    expect(outcome.results[0]).toMatchObject({
      rank: 1,
      title: "Example result",
      url: "https://example.com/article",
      domain: "example.com",
      snippet: "A public result.",
    })
    expect(outcome.results[1]).toMatchObject({
      rank: 2,
      url: "https://docs.example.org/knowbee",
    })
    expect(outcome.markdown).toContain("<!-- untrusted-web-evidence -->")
    expect(outcome.markdown).toContain("- Provider: DuckDuckGo")
    expect(outcome.markdown).not.toContain("Sponsored result")
    expect(JSON.stringify(outcome)).not.toContain("127.0.0.1")
  })

  it("keeps parser behavior deterministic and bounded", () => {
    const results = parseDuckDuckGoHtmlResults({
      html: fixture,
      maxResults: 1,
      fetchedAt: "2026-07-24T04:00:00.000Z",
    })

    expect(results).toHaveLength(1)
    expect(results[0]?.rank).toBe(1)
    expect(results[0]?.sourceEvidence).toMatchObject({
      adapterId: "duckduckgo-html",
      sourceKind: "search_index",
      fetchTimestamp: "2026-07-24T04:00:00.000Z",
    })
  })

  it.each([
    [202, "web_search_provider_rejected"],
    [403, "web_search_provider_rejected"],
    [429, "web_search_rate_limited"],
    [503, "web_search_provider_unavailable"],
  ] as const)("maps HTTP %s to %s", async (status, reasonCode) => {
    const search = createDuckDuckGoHtmlSearchAdapter({
      fetcher: async () => new Response("provider body", { status }),
      now,
    })
    const outcome = await search({
      query: "private-query-token",
      locale: "en-US",
      safeSearch: "strict",
      maxResults: 5,
      signal: new AbortController().signal,
    })

    expect(outcome).toEqual({ ok: false, reasonCode, retryable: status >= 429 })
    expect(JSON.stringify(outcome)).not.toContain("private-query-token")
    expect(JSON.stringify(outcome)).not.toContain("provider body")
  })

  it("distinguishes no-results from changed markup", async () => {
    const emptySearch = createDuckDuckGoHtmlSearchAdapter({
      fetcher: async () => new Response('<div class="no-results">No results.</div>', { status: 200 }),
      now,
    })
    const changedSearch = createDuckDuckGoHtmlSearchAdapter({
      fetcher: async () => new Response("<main>unexpected provider page</main>", { status: 200 }),
      now,
    })
    const input = {
      query: "query",
      locale: "en-US",
      safeSearch: "moderate" as const,
      maxResults: 5,
      signal: new AbortController().signal,
    }

    expect(await emptySearch(input)).toEqual({
      ok: false,
      reasonCode: "web_search_no_results",
      retryable: false,
    })
    expect(await changedSearch(input)).toEqual({
      ok: false,
      reasonCode: "web_search_markup_changed",
      retryable: true,
    })
  })

  it("returns cancellation without calling the provider", async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi.fn(async () => new Response(fixture))
    const search = createDuckDuckGoHtmlSearchAdapter({ fetcher, now })

    expect(await search({
      query: "query",
      locale: "en-US",
      safeSearch: "moderate",
      maxResults: 5,
      signal: controller.signal,
    })).toEqual({
      ok: false,
      reasonCode: "web_search_cancelled",
      retryable: false,
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("redacts network failures and rejects oversized responses", async () => {
    const failed = createDuckDuckGoHtmlSearchAdapter({
      fetcher: async () => {
        throw new Error("token=secret /Users/private/file")
      },
      now,
    })
    const oversized = createDuckDuckGoHtmlSearchAdapter({
      fetcher: async () => new Response("x".repeat(128), { status: 200 }),
      now,
      descriptor: {
        endpoint: "https://html.duckduckgo.com/html/",
        userAgent: "Knowbee test",
        timeoutMs: 1000,
        maxResponseBytes: 64,
      },
    })
    const input = {
      query: "query",
      locale: "en-US",
      safeSearch: "moderate" as const,
      maxResults: 5,
      signal: new AbortController().signal,
    }

    expect(await failed(input)).toEqual({
      ok: false,
      reasonCode: "web_search_network_failed",
      retryable: true,
    })
    expect(await oversized(input)).toEqual({
      ok: false,
      reasonCode: "web_search_response_too_large",
      retryable: true,
    })
  })
})
