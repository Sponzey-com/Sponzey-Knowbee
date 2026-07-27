export type WebRetrievalMethod =
  | "official_api"
  | "direct_fetch"
  | "fast_text_search"
  | "browser_search"
export type SourceKind =
  | "official"
  | "first_party"
  | "search_index"
  | "third_party"
  | "browser_evidence"
  | "unknown"
export type SourceReliability = "high" | "medium" | "low" | "unknown"
export type SourceFreshnessPolicy = "normal" | "latest_approximate" | "strict_timestamp"
export type SourceFreshnessVerdict = "fresh" | "stale" | "unknown"
export type SourceFreshnessReasonCode =
  | "strict_source_age_within_limit"
  | "strict_source_age_exceeded"
  | "strict_source_timestamp_missing"
  | "strict_source_timestamp_invalid"
  | "strict_source_timestamp_future"
  | "freshness_not_strict"

export interface SourceFreshnessAssessment {
  policyVersion: "strict-source-age-v1"
  freshnessVerdict: SourceFreshnessVerdict
  freshnessReasonCode: SourceFreshnessReasonCode
  normalizedSourceTimestamp: string | null
  sourceAgeMs: number | null
}

export interface SourceEvidence {
  method: WebRetrievalMethod
  sourceKind: SourceKind
  reliability: SourceReliability
  sourceUrl?: string | null
  sourceDomain?: string | null
  sourceLabel?: string | null
  sourceTimestamp?: string | null
  fetchTimestamp: string
  freshnessPolicy?: SourceFreshnessPolicy
  policyVersion?: "strict-source-age-v1"
  freshnessVerdict?: SourceFreshnessVerdict
  freshnessReasonCode?: SourceFreshnessReasonCode
  normalizedSourceTimestamp?: string | null
  sourceAgeMs?: number | null
  adapterId?: string | null
  adapterVersion?: string | null
  parserVersion?: string | null
  adapterStatus?: "active" | "degraded" | null
}

export interface WebRetrievalTransitionReceipt {
  schemaVersion: 1
  kind: "discovery" | "direct_fetch_attempt"
  candidateRefs: string[]
}

export type WebRetrievalTransitionAdmission =
  | { allowed: true; pendingCandidateCount: number }
  | {
      allowed: false
      reasonCode: "web_direct_fetch_required"
      pendingCandidateCount: number
    }

export interface WebSearchQuery {
  query: string
  locale: string
  safeSearch: "strict" | "moderate"
  maxResults: number
}

export interface WebRetrievalCandidate {
  readonly evidenceRef: string
  readonly sourceUrl: string
  readonly sourceDomain: string
  readonly sourceTimestamp: string | null
  readonly fetchedAt: string
}

export interface WebSearchResult {
  evidenceRef: string
  rank: number
  title: string
  url: string
  domain: string
  snippet: string
  sourceEvidence: SourceEvidence
}

export interface WebDocument {
  evidenceRef: string
  title: string
  url: string
  markdown: string
  truncated: boolean
  sourceEvidence: SourceEvidence
}

export type WebRetrievalValidationReason =
  | "web_search_query_empty"
  | "web_search_query_too_long"
  | "web_search_locale_invalid"
  | "web_search_safe_search_invalid"
  | "web_search_result_limit_invalid"
  | "web_search_results_empty"
  | "web_search_result_count_invalid"
  | "web_search_result_invalid"
  | "web_search_result_url_duplicate"
  | "web_document_invalid"
  | "web_evidence_url_invalid"
  | "web_evidence_provenance_missing"
  | "web_evidence_provenance_mismatch"

export type WebRetrievalValidation<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: WebRetrievalValidationReason }

function compactText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null
  const compact = value.trim().replace(/\s+/gu, " ")
  return compact.length > 0 && compact.length <= maxLength ? compact : null
}

function publicUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null
  try {
    const parsed = new URL(value)
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password ||
      !parsed.hostname
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function evidenceMatchesUrl(evidence: SourceEvidence, parsed: URL): boolean {
  const sourceUrl = publicUrl(evidence.sourceUrl)
  const sourceDomain = evidence.sourceDomain?.trim().toLowerCase()
  return (
    sourceUrl?.toString() === parsed.toString() &&
    sourceUrl.hostname.toLowerCase() === parsed.hostname.toLowerCase() &&
    sourceDomain === parsed.hostname.toLowerCase() &&
    Number.isFinite(Date.parse(evidence.fetchTimestamp))
  )
}

export function validateWebSearchQuery(value: unknown): WebRetrievalValidation<WebSearchQuery> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reasonCode: "web_search_query_empty" }
  }
  const input = value as Partial<WebSearchQuery>
  const query = typeof input.query === "string" ? input.query.trim() : ""
  if (!query) return { ok: false, reasonCode: "web_search_query_empty" }
  if (query.length > 512) return { ok: false, reasonCode: "web_search_query_too_long" }
  const locale = compactText(input.locale, 32)
  if (!locale) return { ok: false, reasonCode: "web_search_locale_invalid" }
  if (input.safeSearch !== "strict" && input.safeSearch !== "moderate") {
    return { ok: false, reasonCode: "web_search_safe_search_invalid" }
  }
  if (!Number.isInteger(input.maxResults) || (input.maxResults ?? 0) < 1 || (input.maxResults ?? 0) > 16) {
    return { ok: false, reasonCode: "web_search_result_limit_invalid" }
  }
  return {
    ok: true,
    value: {
      query,
      locale,
      safeSearch: input.safeSearch,
      maxResults: input.maxResults as number,
    },
  }
}

export function validateWebSearchResults(
  value: unknown,
): WebRetrievalValidation<readonly WebSearchResult[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reasonCode: "web_search_results_empty" }
  }
  if (value.length > 16) return { ok: false, reasonCode: "web_search_result_count_invalid" }
  const urls = new Set<string>()
  const refs = new Set<string>()
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index] as Partial<WebSearchResult>
    const parsed = publicUrl(item.url)
    if (!parsed) return { ok: false, reasonCode: "web_evidence_url_invalid" }
    if (
      !compactText(item.evidenceRef, 256) ||
      !compactText(item.title, 512) ||
      !compactText(item.domain, 256) ||
      typeof item.snippet !== "string" ||
      item.snippet.length > 2_048 ||
      item.rank !== index + 1
    ) {
      return { ok: false, reasonCode: "web_search_result_invalid" }
    }
    const canonicalUrl = parsed.toString()
    if (urls.has(canonicalUrl)) {
      return { ok: false, reasonCode: "web_search_result_url_duplicate" }
    }
    if (refs.has(item.evidenceRef as string)) {
      return { ok: false, reasonCode: "web_search_result_invalid" }
    }
    if (!item.sourceEvidence) {
      return { ok: false, reasonCode: "web_evidence_provenance_missing" }
    }
    if (
      item.domain?.toLowerCase() !== parsed.hostname.toLowerCase() ||
      !evidenceMatchesUrl(item.sourceEvidence, parsed)
    ) {
      return { ok: false, reasonCode: "web_evidence_provenance_mismatch" }
    }
    urls.add(canonicalUrl)
    refs.add(item.evidenceRef as string)
  }
  return { ok: true, value: value as readonly WebSearchResult[] }
}

export function validateWebDocument(value: unknown): WebRetrievalValidation<WebDocument> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reasonCode: "web_document_invalid" }
  }
  const document = value as Partial<WebDocument>
  const parsed = publicUrl(document.url)
  if (!parsed) return { ok: false, reasonCode: "web_evidence_url_invalid" }
  if (
    !compactText(document.evidenceRef, 256) ||
    !compactText(document.title, 512) ||
    typeof document.markdown !== "string" ||
    !document.markdown.trim() ||
    document.markdown.length > 200_000 ||
    typeof document.truncated !== "boolean"
  ) {
    return { ok: false, reasonCode: "web_document_invalid" }
  }
  if (!document.sourceEvidence) {
    return { ok: false, reasonCode: "web_evidence_provenance_missing" }
  }
  if (!evidenceMatchesUrl(document.sourceEvidence, parsed)) {
    return { ok: false, reasonCode: "web_evidence_provenance_mismatch" }
  }
  return { ok: true, value: document as WebDocument }
}

export function projectWebSearchMarkdown(input: {
  query: string
  provider: "DuckDuckGo"
  retrievedAt: string
  results: readonly WebSearchResult[]
}): string {
  const query = compactText(input.query, 512) ?? ""
  const results = [...input.results].sort((left, right) => left.rank - right.rank)
  const lines = [
    "<!-- untrusted-web-evidence -->",
    "# Web Search Results",
    "",
    `- Query: ${query}`,
    `- Provider: ${input.provider}`,
    `- Retrieved at: ${input.retrievedAt}`,
    `- Result count: ${results.length}`,
  ]
  for (const item of results) {
    lines.push(
      "",
      `## ${item.rank}. ${compactText(item.title, 512) ?? "Untitled"}`,
      "",
      `- URL: ${item.url}`,
      `- Domain: ${item.domain}`,
      `- Snippet: ${compactText(item.snippet, 2_048) ?? ""}`,
    )
  }
  return `${lines.join("\n")}\n`
}

export function projectWebDocumentMarkdown(document: WebDocument): string {
  const evidence = document.sourceEvidence
  return [
    "<!-- untrusted-web-evidence -->",
    `# ${compactText(document.title, 512) ?? "Untitled"}`,
    "",
    document.markdown.trim(),
    "",
    "---",
    "",
    `- Source: ${document.url}`,
    `- Source timestamp: ${evidence.sourceTimestamp ?? "unknown"}`,
    `- Retrieved at: ${evidence.fetchTimestamp}`,
    `- Freshness: ${evidence.freshnessVerdict ?? "unknown"}`,
    `- Truncated: ${String(document.truncated)}`,
    "",
  ].join("\n")
}
