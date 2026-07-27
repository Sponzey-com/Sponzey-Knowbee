import { createHash } from "node:crypto"
import { isIP } from "node:net"

import type { SourceFreshnessPolicy } from "./web-retrieval.js"
import type { WebResearchLinkCandidate } from "./web-research-link-candidate.js"

interface InitialWebResearchExecutionScope {
  readonly runId: string
  readonly ownerAgentId: string
  readonly receiptId: string
  readonly selectedCapabilityId: string
  readonly toolNames: readonly string[]
}

export type InitialWebResearchAction =
  | Readonly<{
      kind: "execute_search"
      query: string
      freshnessPolicy: SourceFreshnessPolicy
    }>
  | Readonly<{
      kind: "execute_fetch"
      sourceUrl: string
      freshnessPolicy: SourceFreshnessPolicy
      candidateOrigin: "user_url" | "search_result" | "fetched_document_link"
      candidateId?: string
      parentEvidenceRef?: string
      discoveryFingerprint?: `sha256:${string}`
    }>

export interface InitialWebResearchMethodReceipt {
  readonly schemaVersion: 1
  readonly diagnosedBy: "llm_tool_call"
  readonly receiptId: `receipt:web-method:${string}`
  readonly runId: string
  readonly capabilityReceiptId: string
  readonly proposalFingerprint: `sha256:${string}`
}

export type InitialWebResearchMethodAdmission =
  | Readonly<{
      ok: true
      action: InitialWebResearchAction
      receipt: InitialWebResearchMethodReceipt
    }>
  | Readonly<{
      ok: false
      reasonCode:
        | "web_initial_method_scope_mismatch"
        | "web_initial_method_proposal_invalid"
        | "web_initial_method_fetch_candidate_missing"
        | "web_initial_method_fetch_candidate_invalid"
    }>

const URL_CANDIDATE_PATTERN = /https?:\/\/[^\s<>"']+/giu
const TRAILING_SENTENCE_PUNCTUATION = /[),.;!?]+$/u

function freshness(value: unknown): SourceFreshnessPolicy {
  return value === "latest_approximate" || value === "strict_timestamp"
    ? value
    : "normal"
}

function canonicalPublicUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      !url.hostname ||
      url.hostname === "localhost" ||
      url.hostname.endsWith(".localhost")
    ) {
      return null
    }
    const hostname = url.hostname.replace(/^\[|\]$/gu, "")
    // Literal IP targets are never admitted here. DNS and redirect admission remain
    // the responsibility of the web-fetch boundary immediately before network I/O.
    if (isIP(hostname)) return null
    return url.toString()
  } catch {
    return null
  }
}

function userUrlCandidates(userRequest: string): ReadonlySet<string> {
  const candidates = new Set<string>()
  for (const match of userRequest.matchAll(URL_CANDIDATE_PATTERN)) {
    const raw = match[0]?.replace(TRAILING_SENTENCE_PUNCTUATION, "")
    if (!raw) continue
    const canonical = canonicalPublicUrl(raw)
    if (canonical) candidates.add(canonical)
  }
  return candidates
}

export function readUserWebUrlCandidates(userRequest: string): readonly string[] {
  return [...userUrlCandidates(userRequest)]
}

function fingerprint(value: unknown): `sha256:${string}` {
  const digest = createHash("sha256").update(JSON.stringify(value)).digest("hex")
  return `sha256:${digest}`
}

function rejected(
  reasonCode: Extract<InitialWebResearchMethodAdmission, { ok: false }>["reasonCode"],
): InitialWebResearchMethodAdmission {
  return Object.freeze({ ok: false, reasonCode })
}

export function admitInitialWebResearchMethod(input: Readonly<{
  runId: string
  ownerAgentId: string
  scope: InitialWebResearchExecutionScope
  userRequest: string
  observedFetchCandidates?: readonly WebResearchLinkCandidate[]
  observedSearchResults?: readonly Readonly<{
    sourceUrl: string
    evidenceRef: string
  }>[]
  toolName: string
  params: Readonly<Record<string, unknown>>
}>): InitialWebResearchMethodAdmission {
  const runId = input.runId.trim()
  const ownerAgentId = input.ownerAgentId.trim()
  if (
    !runId ||
    !ownerAgentId ||
    input.scope.runId !== runId ||
    input.scope.ownerAgentId !== ownerAgentId ||
    !input.scope.receiptId.trim() ||
    !input.scope.toolNames.includes(input.toolName)
  ) {
    return rejected("web_initial_method_scope_mismatch")
  }

  let action: InitialWebResearchAction
  if (input.toolName === "web_search") {
    const query = typeof input.params.query === "string" ? input.params.query.trim() : ""
    if (!query || query.length > 512) {
      return rejected("web_initial_method_proposal_invalid")
    }
    action = Object.freeze({
      kind: "execute_search" as const,
      query,
      freshnessPolicy: freshness(input.params.freshnessPolicy),
    })
  } else if (input.toolName === "web_fetch") {
    const rawUrl = typeof input.params.url === "string" ? input.params.url.trim() : ""
    if (!rawUrl) return rejected("web_initial_method_proposal_invalid")
    const sourceUrl = canonicalPublicUrl(rawUrl)
    if (!sourceUrl) return rejected("web_initial_method_fetch_candidate_invalid")
    const observedCandidate = input.observedFetchCandidates?.find(
      (candidate) => candidate.sourceUrl === sourceUrl,
    )
    const observedSearchResult = input.observedSearchResults?.find(
      (candidate) => canonicalPublicUrl(candidate.sourceUrl) === sourceUrl,
    )
    const fromUser = userUrlCandidates(input.userRequest).has(sourceUrl)
    if (!fromUser && !observedSearchResult && !observedCandidate) {
      return rejected("web_initial_method_fetch_candidate_missing")
    }
    action = Object.freeze({
      kind: "execute_fetch" as const,
      sourceUrl,
      freshnessPolicy: freshness(input.params.freshnessPolicy),
      candidateOrigin: fromUser
        ? "user_url" as const
        : observedSearchResult
          ? "search_result" as const
          : "fetched_document_link" as const,
      ...(observedCandidate
        ? {
            candidateId: observedCandidate.candidateId,
            parentEvidenceRef: observedCandidate.discovery.parentEvidenceRef,
            discoveryFingerprint: observedCandidate.discovery.discoveryFingerprint,
          }
        : observedSearchResult
          ? { parentEvidenceRef: observedSearchResult.evidenceRef }
        : {}),
    })
  } else {
    return rejected("web_initial_method_proposal_invalid")
  }

  const proposalFingerprint = fingerprint({
    runId,
    capabilityReceiptId: input.scope.receiptId,
    action,
  })
  const receiptDigest = proposalFingerprint.slice("sha256:".length, "sha256:".length + 32)
  return Object.freeze({
    ok: true,
    action,
    receipt: Object.freeze({
      schemaVersion: 1 as const,
      diagnosedBy: "llm_tool_call" as const,
      receiptId: `receipt:web-method:${receiptDigest}` as const,
      runId,
      capabilityReceiptId: input.scope.receiptId,
      proposalFingerprint,
    }),
  })
}
