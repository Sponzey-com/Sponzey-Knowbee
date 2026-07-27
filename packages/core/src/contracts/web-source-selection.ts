import { createHash } from "node:crypto"

import type { WebSearchMetadataObservation } from "./web-research-observation.js"
import { validateWebSearchResults } from "./web-retrieval.js"

const SHA256 = /^sha256:[a-f0-9]{64}$/u

export interface WebSearchMetadataCandidate {
  readonly candidateRef: string
  readonly rank: number
  readonly title: string
  readonly url: string
  readonly domain: string
  readonly snippet: string
  readonly publishedAt: string | null
  readonly sourceKind: string
}

export interface WebSearchMetadataSnapshot {
  readonly provider: "DuckDuckGo"
  readonly retrievedAt: string
  readonly candidates: readonly WebSearchMetadataCandidate[]
  readonly budgetFingerprint: `sha256:${string}`
  readonly snapshotFingerprint: `sha256:${string}`
}

export interface WebSourceSelection {
  readonly candidateRef: string
  readonly relevanceScore: number
  readonly reason: string
  readonly factKeys: readonly string[]
}

export interface WebSourceSelectionReceipt {
  readonly snapshotFingerprint: `sha256:${string}`
  readonly budgetFingerprint: `sha256:${string}`
  readonly selections: readonly WebSourceSelection[]
}

export type WebSearchMetadataSnapshotResult =
  | Readonly<{ ok: true; value: WebSearchMetadataSnapshot }>
  | Readonly<{ ok: false; reasonCode: "web_search_metadata_snapshot_invalid" }>

export type WebSourceSelectionAdmission =
  | Readonly<{ ok: true; value: WebSourceSelectionReceipt }>
  | Readonly<{
      ok: false
      reasonCode:
        | "web_source_selection_receipt_invalid"
        | "web_source_selection_fingerprint_mismatch"
        | "web_source_selection_count_invalid"
        | "web_source_selection_candidate_invalid"
        | "web_source_selection_score_invalid"
        | "web_source_selection_fact_invalid"
    }>

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`
}

function exactText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text && text.length <= maxLength ? text : null
}

export function createWebSearchMetadataSnapshot(input: Readonly<{
  observation: WebSearchMetadataObservation
  budgetFingerprint: string
}>): WebSearchMetadataSnapshotResult {
  const observation = input.observation
  const validated = validateWebSearchResults(observation?.results)
  if (
    observation?.kind !== "search_metadata" ||
    observation.provider !== "DuckDuckGo" ||
    !Number.isFinite(Date.parse(observation.retrievedAt)) ||
    observation.resultCount !== observation.results.length ||
    observation.results.length > 16 ||
    !validated.ok ||
    !SHA256.test(input.budgetFingerprint)
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_search_metadata_snapshot_invalid" })
  }

  const candidates = Object.freeze(validated.value.map((result) => Object.freeze({
    candidateRef: result.evidenceRef,
    rank: result.rank,
    title: result.title,
    url: result.url,
    domain: result.domain,
    snippet: result.snippet,
    publishedAt: result.sourceEvidence.sourceTimestamp ?? null,
    sourceKind: result.sourceEvidence.sourceKind,
  })))
  const stable = {
    provider: "DuckDuckGo" as const,
    retrievedAt: new Date(observation.retrievedAt).toISOString(),
    candidates,
    budgetFingerprint: input.budgetFingerprint as `sha256:${string}`,
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      ...stable,
      snapshotFingerprint: sha256(JSON.stringify(stable)),
    }),
  })
}

export function admitWebSourceSelection(input: Readonly<{
  receipt: unknown
  snapshot: WebSearchMetadataSnapshot
  requiredFactKeys: readonly string[]
  maxSelections: number
}>): WebSourceSelectionAdmission {
  if (!input.receipt || typeof input.receipt !== "object" || Array.isArray(input.receipt)) {
    return Object.freeze({ ok: false, reasonCode: "web_source_selection_receipt_invalid" })
  }
  const receipt = input.receipt as Record<string, unknown>
  if (
    receipt.snapshotFingerprint !== input.snapshot.snapshotFingerprint ||
    receipt.budgetFingerprint !== input.snapshot.budgetFingerprint
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_source_selection_fingerprint_mismatch" })
  }
  if (
    !Array.isArray(receipt.selections) ||
    receipt.selections.length < 1 ||
    receipt.selections.length > input.maxSelections
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_source_selection_count_invalid" })
  }

  const candidateRefs = new Set(input.snapshot.candidates.map((item) => item.candidateRef))
  const allowedFactKeys = new Set(input.requiredFactKeys)
  const selectedRefs = new Set<string>()
  const selections: WebSourceSelection[] = []
  for (const rawSelection of receipt.selections) {
    if (!rawSelection || typeof rawSelection !== "object" || Array.isArray(rawSelection)) {
      return Object.freeze({ ok: false, reasonCode: "web_source_selection_receipt_invalid" })
    }
    const selection = rawSelection as Record<string, unknown>
    const candidateRef = exactText(selection.candidateRef, 256)
    const reason = exactText(selection.reason, 512)
    if (
      !candidateRef ||
      !reason ||
      !candidateRefs.has(candidateRef) ||
      selectedRefs.has(candidateRef)
    ) {
      return Object.freeze({ ok: false, reasonCode: "web_source_selection_candidate_invalid" })
    }
    if (
      typeof selection.relevanceScore !== "number" ||
      !Number.isFinite(selection.relevanceScore) ||
      selection.relevanceScore < 0 ||
      selection.relevanceScore > 1
    ) {
      return Object.freeze({ ok: false, reasonCode: "web_source_selection_score_invalid" })
    }
    if (
      !Array.isArray(selection.factKeys) ||
      selection.factKeys.length < 1 ||
      selection.factKeys.some((key) =>
        !exactText(key, 128) || !allowedFactKeys.has(key as string))
    ) {
      return Object.freeze({ ok: false, reasonCode: "web_source_selection_fact_invalid" })
    }
    selectedRefs.add(candidateRef)
    selections.push(Object.freeze({
      candidateRef,
      relevanceScore: selection.relevanceScore,
      reason,
      factKeys: Object.freeze([...(selection.factKeys as string[])]),
    }))
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      snapshotFingerprint: input.snapshot.snapshotFingerprint,
      budgetFingerprint: input.snapshot.budgetFingerprint,
      selections: Object.freeze(selections),
    }),
  })
}
