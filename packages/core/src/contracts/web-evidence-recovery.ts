import type { WebEvidenceVerificationResult } from "./web-evidence-verifier.js"
import type {
  WebResearchFingerprint,
  WebResearchMethodCandidate,
} from "./web-research-method.js"

const SHA256 = /^sha256:[a-f0-9]{64}$/u

export type WebEvidenceRecoveryCandidate = WebResearchMethodCandidate & Readonly<{
  factKey: string
}>

export type WebEvidenceRecoveryDirective =
  | Readonly<{
      action: "continue"
      packFingerprint: `sha256:${string}`
      candidates: readonly WebEvidenceRecoveryCandidate[]
    }>
  | Readonly<{
      action: "blocked"
      packFingerprint: `sha256:${string}`
      candidates: readonly []
    }>

export type WebEvidenceRecoveryAdmission =
  | Readonly<{ ok: true; value: WebEvidenceRecoveryDirective }>
  | Readonly<{
      ok: false
      reasonCode:
        | "web_evidence_recovery_input_invalid"
        | "web_evidence_recovery_receipt_invalid"
        | "web_evidence_recovery_pack_mismatch"
        | "web_evidence_recovery_candidate_invalid"
        | "web_evidence_recovery_strategy_unchanged"
        | "web_evidence_recovery_blocked_not_admitted"
        | "web_evidence_recovery_cancelled"
    }>

function text(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized && normalized.length <= maxLength ? normalized : null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length &&
    expected.every((key, index) => key === actual[index])
}

function publicUrl(value: unknown): string | null {
  const normalized = text(value, 8_192)
  if (!normalized) return null
  try {
    const url = new URL(normalized)
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      url.hostname
    ) ? url.toString() : null
  } catch {
    return null
  }
}

export function admitWebEvidenceRecovery(input: Readonly<{
  receipt: unknown
  verification: WebEvidenceVerificationResult
  attemptedStrategyFingerprints: readonly WebResearchFingerprint[]
  blockedAllowed: boolean
}>): WebEvidenceRecoveryAdmission {
  if (
    input.verification.status === "sufficient" ||
    input.verification.unresolvedFactKeys.length < 1 ||
    input.attemptedStrategyFingerprints.some((fingerprint) => !SHA256.test(fingerprint)) ||
    new Set(input.attemptedStrategyFingerprints).size !==
      input.attemptedStrategyFingerprints.length
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_input_invalid" })
  }
  if (!input.receipt || typeof input.receipt !== "object" || Array.isArray(input.receipt)) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_receipt_invalid" })
  }
  const receipt = input.receipt as Record<string, unknown>
  if (!exactKeys(receipt, ["packFingerprint", "action", "candidates"])) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_receipt_invalid" })
  }
  if (receipt.packFingerprint !== input.verification.packFingerprint) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_pack_mismatch" })
  }
  if (!Array.isArray(receipt.candidates) || receipt.candidates.length > 16) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_receipt_invalid" })
  }
  if (receipt.action === "blocked") {
    if (!input.blockedAllowed || receipt.candidates.length > 0) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_blocked_not_admitted" })
    }
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        action: "blocked",
        packFingerprint: input.verification.packFingerprint,
        candidates: Object.freeze([]) as readonly [],
      }),
    })
  }
  if (receipt.action !== "continue" || receipt.candidates.length < 1) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_receipt_invalid" })
  }

  const unresolvedFacts = new Set(input.verification.unresolvedFactKeys)
  const attempted = new Set(input.attemptedStrategyFingerprints)
  const candidateIds = new Set<string>()
  const proposedFingerprints = new Set<string>()
  const candidates: WebEvidenceRecoveryCandidate[] = []
  for (const rawCandidate of receipt.candidates) {
    if (!rawCandidate || typeof rawCandidate !== "object" || Array.isArray(rawCandidate)) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" })
    }
    const candidate = rawCandidate as Record<string, unknown>
    const candidateId = text(candidate.candidateId, 256)
    const factKey = text(candidate.factKey, 128)
    const strategyFingerprint = text(candidate.strategyFingerprint, 80)
    if (
      !candidateId ||
      !factKey ||
      !unresolvedFacts.has(factKey) ||
      !strategyFingerprint ||
      !SHA256.test(strategyFingerprint) ||
      candidateIds.has(candidateId)
    ) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" })
    }
    if (attempted.has(strategyFingerprint as WebResearchFingerprint) ||
      proposedFingerprints.has(strategyFingerprint)) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_strategy_unchanged" })
    }
    let normalized: WebEvidenceRecoveryCandidate
    if (candidate.kind === "search") {
      if (!exactKeys(candidate, [
        "candidateId",
        "factKey",
        "kind",
        "query",
        "strategyFingerprint",
      ])) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" })
      }
      const query = text(candidate.query, 512)
      if (!query) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" })
      }
      normalized = Object.freeze({
        candidateId,
        factKey,
        kind: "search",
        query,
        strategyFingerprint: strategyFingerprint as WebResearchFingerprint,
      })
    } else if (candidate.kind === "fetch") {
      if (!exactKeys(candidate, [
        "candidateId",
        "factKey",
        "kind",
        "sourceUrl",
        "evidenceRef",
        "strategyFingerprint",
      ])) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" })
      }
      const sourceUrl = publicUrl(candidate.sourceUrl)
      const evidenceRef = text(candidate.evidenceRef, 256)
      if (!sourceUrl || !evidenceRef) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" })
      }
      normalized = Object.freeze({
        candidateId,
        factKey,
        kind: "fetch",
        sourceUrl,
        evidenceRef,
        strategyFingerprint: strategyFingerprint as WebResearchFingerprint,
      })
    } else {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" })
    }
    candidateIds.add(candidateId)
    proposedFingerprints.add(strategyFingerprint)
    candidates.push(normalized)
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      action: "continue",
      packFingerprint: input.verification.packFingerprint,
      candidates: Object.freeze(candidates),
    }),
  })
}
