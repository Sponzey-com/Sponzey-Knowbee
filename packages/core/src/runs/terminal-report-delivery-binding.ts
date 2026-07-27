import { createHash } from "node:crypto"
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"
import {
  buildCanonicalResultReportFacts,
  type CanonicalResultOutcome,
  type CanonicalResultReportFacts,
} from "../contracts/canonical-result-report.js"
import type { CanonicalFinalOutcome } from "./canonical-work-run-projection.js"

export type TerminalReportDeliveryBindingReason =
  | "terminal_report_invalid"
  | "terminal_report_work_mismatch"
  | "terminal_report_outcome_mismatch"

export type TerminalReportDeliveryBinding =
  | {
      ok: true
      facts: CanonicalResultReportFacts
      reportFingerprint: `sha256:${string}`
      reviewInput: string
    }
  | { ok: false; reasonCode: TerminalReportDeliveryBindingReason }

export interface TerminalReportResponseReview {
  ok: boolean
  missingFields: string[]
  missingRequiredFragments: Array<{
    field: string
    value: string
  }>
}

function acceptedReportOutcomes(finalOutcome: CanonicalFinalOutcome): CanonicalResultOutcome[] {
  if (finalOutcome === "partial") return ["partial"]
  if (finalOutcome === "blocked") return ["blocked"]
  if (finalOutcome === "exhausted") return ["blocked", "impossible"]
  return []
}

function fingerprint(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`
}

export function terminalReportRequired(finalOutcome: CanonicalFinalOutcome | undefined): boolean {
  return finalOutcome === "partial" || finalOutcome === "blocked" || finalOutcome === "exhausted"
}

export function bindTerminalReportForDelivery(input: {
  runId: string
  finalOutcome: CanonicalFinalOutcome
  facts: CanonicalResultReportFacts
  draftText: string
}): TerminalReportDeliveryBinding {
  let facts: CanonicalResultReportFacts
  try {
    facts = buildCanonicalResultReportFacts(input.facts)
  } catch {
    return { ok: false, reasonCode: "terminal_report_invalid" }
  }
  if (facts.workId !== canonicalWorkIdForRootRun(input.runId)) {
    return { ok: false, reasonCode: "terminal_report_work_mismatch" }
  }
  if (!acceptedReportOutcomes(input.finalOutcome).includes(facts.outcome)) {
    return { ok: false, reasonCode: "terminal_report_outcome_mismatch" }
  }

  const reviewInput = JSON.stringify({
    schemaVersion: 1,
    result: facts.outcome,
    language: facts.primaryLanguage,
    completedScope: facts.completedScope,
    unresolvedScope: facts.unresolvedScope,
    verifiedReasonFacts: facts.verifiedReasonFacts,
    nextActions: facts.nextActions,
    draftText: input.draftText.trim(),
  })
  return {
    ok: true,
    facts,
    reportFingerprint: fingerprint(JSON.stringify(facts)),
    reviewInput,
  }
}

export function reviewTerminalReportResponse(input: {
  facts: CanonicalResultReportFacts
  responseText: string
}): TerminalReportResponseReview {
  const text = input.responseText.trim()
  const requiredResultWord = input.facts.primaryLanguage === "ko"
    ? input.facts.outcome === "partial"
      ? "부분"
      : input.facts.outcome === "blocked"
        ? "차단"
        : input.facts.outcome === "impossible"
          ? "불가능"
          : "완료"
    : input.facts.outcome
  const fields: Array<[string, string]> = [
    ["result", requiredResultWord],
    ...input.facts.completedScope.map((value, index) => [`completedScope[${index}]`, value] as [string, string]),
    ...input.facts.unresolvedScope.map((value, index) => [`unresolvedScope[${index}]`, value] as [string, string]),
    ...input.facts.verifiedReasonFacts.map((value, index) => [`verifiedReasonFacts[${index}]`, value] as [string, string]),
    ...input.facts.nextActions.map((value, index) => [`nextActions[${index}]`, value.text] as [string, string]),
  ]
  const missingRequiredFragments = fields
    .filter(([field, value]) => field === "result"
      ? !text.toLocaleLowerCase().includes(value.toLocaleLowerCase())
      : !text.includes(value))
    .map(([field, value]) => ({ field, value }))
  return {
    ok: missingRequiredFragments.length === 0,
    missingFields: missingRequiredFragments.map(({ field }) => field),
    missingRequiredFragments,
  }
}
