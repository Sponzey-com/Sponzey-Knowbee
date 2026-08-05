import {
  validateWebDocument,
  validateWebSearchResults,
  type WebDocument,
  type WebSearchResult,
} from "./web-retrieval.js"
import type { ToolResult } from "../tools/types.js"

export interface WebSearchMetadataObservation {
  readonly kind: "search_metadata"
  readonly provider: "DuckDuckGo"
  readonly retrievedAt: string
  readonly resultCount: number
  readonly results: readonly WebSearchResult[]
}

export interface WebDocumentObservation {
  readonly kind: "document"
  readonly document: WebDocument
}

export type WebToolResultObservation =
  | WebSearchMetadataObservation
  | WebDocumentObservation

export type WebToolResultObservationProjection =
  | Readonly<{ ok: true; value: WebToolResultObservation }>
  | Readonly<{
      ok: false
      reasonCode:
        | "web_tool_result_failed"
        | "web_tool_result_details_invalid"
        | "web_search_metadata_invalid"
        | "web_document_observation_invalid"
    }>

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    return null
  }
  return new Date(value).toISOString()
}

function frozenSearchResult(result: WebSearchResult): WebSearchResult {
  return Object.freeze({
    ...result,
    sourceEvidence: Object.freeze({ ...result.sourceEvidence }),
  })
}

function frozenDocument(document: WebDocument): WebDocument {
  return Object.freeze({
    ...document,
    sourceEvidence: Object.freeze({ ...document.sourceEvidence }),
  })
}

export function projectWebToolResultObservation(
  toolName: "web_search" | "web_fetch",
  result: ToolResult,
): WebToolResultObservationProjection {
  if (!result.success) {
    return Object.freeze({ ok: false, reasonCode: "web_tool_result_failed" })
  }
  const details = record(result.details)
  if (!details) {
    return Object.freeze({ ok: false, reasonCode: "web_tool_result_details_invalid" })
  }
  if (toolName === "web_search") {
    const retrievedAt = isoTimestamp(details.retrievedAt)
    const validated = validateWebSearchResults(details.results)
    if (details.provider !== "DuckDuckGo" || !retrievedAt || !validated.ok) {
      return Object.freeze({ ok: false, reasonCode: "web_search_metadata_invalid" })
    }
    const results = Object.freeze(validated.value.map(frozenSearchResult))
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        kind: "search_metadata",
        provider: "DuckDuckGo",
        retrievedAt,
        resultCount: results.length,
        results,
      }),
    })
  }

  const validated = validateWebDocument(details.document)
  if (
    !validated.ok ||
    /<!doctype\s+html|<html\b|<script\b/iu.test(validated.value.markdown)
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_document_observation_invalid" })
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      kind: "document",
      document: frozenDocument(validated.value),
    }),
  })
}
