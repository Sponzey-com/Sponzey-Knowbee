import { isIP } from "node:net"
import { load } from "cheerio"
import {
  projectWebSearchMarkdown,
  validateWebSearchQuery,
  validateWebSearchResults,
  type WebSearchResult,
} from "../contracts/web-retrieval.js"
import type {
  WebSearchFailureReason,
  WebSearchPort,
} from "../runs/web-search-port.js"
import { evaluatePublicNetworkTarget } from "../security/network-target-policy.js"

export interface DuckDuckGoProviderDescriptor {
  endpoint: string
  userAgent: string
  timeoutMs: number
  maxResponseBytes: number
}

export interface DuckDuckGoHtmlSearchDependencies {
  fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>
  now?: () => Date
  descriptor?: DuckDuckGoProviderDescriptor
}

export const DEFAULT_DUCKDUCKGO_PROVIDER: Readonly<DuckDuckGoProviderDescriptor> =
  Object.freeze({
    endpoint: "https://html.duckduckgo.com/html/",
    userAgent: "Sponzey Knowbee/0.1.0",
    timeoutMs: 15_000,
    maxResponseBytes: 1_000_000,
  })

const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
])

function compactText(value: string): string {
  return value.trim().replace(/\s+/gu, " ")
}

function publicCandidateUrl(rawHref: string): URL | null {
  let parsed: URL
  try {
    parsed = new URL(rawHref, DEFAULT_DUCKDUCKGO_PROVIDER.endpoint)
    if (
      parsed.hostname.toLowerCase().endsWith("duckduckgo.com") &&
      parsed.pathname === "/l/"
    ) {
      const target = parsed.searchParams.get("uddg")
      if (!target) return null
      parsed = new URL(target)
    }
  } catch {
    return null
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/gu, "").toLowerCase()
  if (isIP(hostname) !== 0) {
    const decision = evaluatePublicNetworkTarget({
      rawUrl: parsed.toString(),
      resolvedAddresses: [hostname],
    })
    if (!decision.allowed) return null
  } else if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    return null
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    parsed.username ||
    parsed.password
  ) {
    return null
  }

  parsed.hash = ""
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_QUERY_KEYS.has(key.toLowerCase())) parsed.searchParams.delete(key)
  }
  return parsed
}

export function parseDuckDuckGoHtmlResults(input: {
  html: string
  maxResults: number
  fetchedAt: string
}): WebSearchResult[] {
  const $ = load(input.html)
  const results: WebSearchResult[] = []
  const urls = new Set<string>()

  $(".result").each((_index, element) => {
    if (results.length >= input.maxResults) return false
    const node = $(element)
    if (node.hasClass("result--ad") || node.find(".result__badge--ad").length > 0) {
      return
    }
    const anchor = node.find(".result__a").first()
    const title = compactText(anchor.text())
    const snippet = compactText(node.find(".result__snippet").first().text())
    const parsed = publicCandidateUrl(anchor.attr("href") ?? "")
    if (!parsed || !title) return
    const url = parsed.toString()
    if (urls.has(url)) return
    urls.add(url)
    const domain = parsed.hostname.toLowerCase()
    const rank = results.length + 1
    results.push({
      evidenceRef: `web-result:${rank}`,
      rank,
      title,
      url,
      domain,
      snippet,
      sourceEvidence: {
        method: "fast_text_search",
        sourceKind: "search_index",
        reliability: "medium",
        sourceUrl: url,
        sourceDomain: domain,
        sourceTimestamp: null,
        fetchTimestamp: input.fetchedAt,
        freshnessPolicy: "latest_approximate",
        adapterId: "duckduckgo-html",
        adapterVersion: "1",
        parserVersion: "duckduckgo-html-v1",
        adapterStatus: "active",
      },
    })
  })
  return results
}

function failure(
  reasonCode: WebSearchFailureReason,
  retryable: boolean,
): Awaited<ReturnType<WebSearchPort>> {
  return { ok: false, reasonCode, retryable }
}

function providerFailure(status: number): Awaited<ReturnType<WebSearchPort>> {
  if (status === 429) return failure("web_search_rate_limited", true)
  if (status >= 500) return failure("web_search_provider_unavailable", true)
  return failure("web_search_provider_rejected", false)
}

function buildRequestUrl(
  descriptor: DuckDuckGoProviderDescriptor,
  input: {
    query: string
    locale: string
    safeSearch: "strict" | "moderate"
  },
): string {
  const url = new URL(descriptor.endpoint)
  url.searchParams.set("q", input.query)
  url.searchParams.set("kl", input.locale.toLowerCase())
  url.searchParams.set("kp", input.safeSearch === "strict" ? "1" : "-1")
  return url.toString()
}

export function createDuckDuckGoHtmlSearchAdapter(
  dependencies: DuckDuckGoHtmlSearchDependencies = {},
): WebSearchPort {
  const fetcher = dependencies.fetcher ?? globalThis.fetch
  const now = dependencies.now ?? (() => new Date())
  const descriptor = Object.freeze(
    dependencies.descriptor ?? DEFAULT_DUCKDUCKGO_PROVIDER,
  )

  return async (input) => {
    const validated = validateWebSearchQuery(input)
    if (!validated.ok) return failure("web_search_evidence_invalid", false)
    if (input.signal.aborted) return failure("web_search_cancelled", false)

    const timeoutController = new AbortController()
    const timeout = setTimeout(() => timeoutController.abort(), descriptor.timeoutMs)
    const onAbort = () => timeoutController.abort()
    input.signal.addEventListener("abort", onAbort, { once: true })

    try {
      const response = await fetcher(buildRequestUrl(descriptor, validated.value), {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": descriptor.userAgent,
        },
        redirect: "error",
        signal: timeoutController.signal,
      })
      if (response.status !== 200) return providerFailure(response.status)
      const contentLength = Number(response.headers.get("content-length"))
      if (
        Number.isFinite(contentLength) &&
        contentLength > descriptor.maxResponseBytes
      ) {
        return failure("web_search_response_too_large", true)
      }
      const html = await response.text()
      if (new TextEncoder().encode(html).byteLength > descriptor.maxResponseBytes) {
        return failure("web_search_response_too_large", true)
      }
      const retrievedAt = now().toISOString()
      const results = parseDuckDuckGoHtmlResults({
        html,
        maxResults: validated.value.maxResults,
        fetchedAt: retrievedAt,
      })
      if (results.length === 0) {
        const $ = load(html)
        if ($(".no-results").length > 0) {
          return failure("web_search_no_results", false)
        }
        return failure("web_search_markup_changed", true)
      }
      const validatedResults = validateWebSearchResults(results)
      if (!validatedResults.ok) return failure("web_search_evidence_invalid", false)
      return {
        ok: true,
        provider: "DuckDuckGo",
        retrievedAt,
        results: validatedResults.value,
        markdown: projectWebSearchMarkdown({
          query: validated.value.query,
          provider: "DuckDuckGo",
          retrievedAt,
          results: validatedResults.value,
        }),
      }
    } catch {
      if (input.signal.aborted) return failure("web_search_cancelled", false)
      if (timeoutController.signal.aborted) return failure("web_search_timeout", true)
      return failure("web_search_network_failed", true)
    } finally {
      clearTimeout(timeout)
      input.signal.removeEventListener("abort", onAbort)
    }
  }
}
