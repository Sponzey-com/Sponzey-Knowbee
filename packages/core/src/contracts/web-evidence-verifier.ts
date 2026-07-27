import type { WebEvidencePack } from "./web-evidence-pack.js"

export interface WebEvidenceVerificationResult {
  readonly packFingerprint: `sha256:${string}`
  readonly budgetFingerprint: `sha256:${string}`
  readonly status: "sufficient" | "insufficient" | "conflicted"
  readonly answerDraft: string | null
  readonly supportedUnitRefs: readonly string[]
  readonly unresolvedFactKeys: readonly string[]
}

export type WebEvidenceVerificationAdmission =
  | Readonly<{ ok: true; value: WebEvidenceVerificationResult }>
  | Readonly<{
      ok: false
      reasonCode:
        | "web_evidence_verification_input_invalid"
        | "web_evidence_verification_receipt_invalid"
        | "web_evidence_verification_fingerprint_mismatch"
        | "web_evidence_verification_reference_invalid"
        | "web_evidence_verification_fact_invalid"
        | "web_evidence_verification_status_invalid"
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

export function admitWebEvidenceVerification(input: Readonly<{
  receipt: unknown
  evidencePack: WebEvidencePack
  requiredFactKeys: readonly string[]
}>): WebEvidenceVerificationAdmission {
  if (!input.receipt || typeof input.receipt !== "object" || Array.isArray(input.receipt)) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_receipt_invalid" })
  }
  const receipt = input.receipt as Record<string, unknown>
  if (!exactKeys(receipt, [
    "packFingerprint",
    "budgetFingerprint",
    "status",
    "answerDraft",
    "supportedUnitRefs",
    "unresolvedFactKeys",
  ])) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_receipt_invalid" })
  }
  if (
    receipt.packFingerprint !== input.evidencePack.packFingerprint ||
    receipt.budgetFingerprint !== input.evidencePack.budgetFingerprint
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_fingerprint_mismatch" })
  }
  if (
    receipt.status !== "sufficient" &&
    receipt.status !== "insufficient" &&
    receipt.status !== "conflicted"
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_status_invalid" })
  }
  if (
    !Array.isArray(receipt.supportedUnitRefs) ||
    !Array.isArray(receipt.unresolvedFactKeys) ||
    new Set(receipt.supportedUnitRefs).size !== receipt.supportedUnitRefs.length ||
    new Set(receipt.unresolvedFactKeys).size !== receipt.unresolvedFactKeys.length
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_receipt_invalid" })
  }
  const units = new Map<string, WebEvidencePack["units"][number]>(
    input.evidencePack.units.map((unit) => [unit.unitRef, unit]),
  )
  if (receipt.supportedUnitRefs.some((ref) => !text(ref, 128) || !units.has(ref as string))) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_reference_invalid" })
  }
  const allowedFacts = new Set(input.requiredFactKeys)
  if (receipt.unresolvedFactKeys.some((fact) =>
    !text(fact, 128) || !allowedFacts.has(fact as string))) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_fact_invalid" })
  }
  const supportedFacts = new Set(
    (receipt.supportedUnitRefs as string[]).map((ref) => units.get(ref)?.factKey),
  )
  if ((receipt.unresolvedFactKeys as string[]).some((fact) => supportedFacts.has(fact))) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_fact_invalid" })
  }
  if (input.evidencePack.unresolvedFactKeys.some((fact) =>
    !(receipt.unresolvedFactKeys as string[]).includes(fact))) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_fact_invalid" })
  }

  const answerDraft = receipt.answerDraft === null
    ? null
    : text(receipt.answerDraft, 8_000)
  if (receipt.answerDraft !== null && !answerDraft) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_receipt_invalid" })
  }
  if (receipt.status === "sufficient") {
    if (
      !answerDraft ||
      receipt.unresolvedFactKeys.length > 0 ||
      input.evidencePack.conflicts.length > 0 ||
      input.requiredFactKeys.some((fact) => !supportedFacts.has(fact))
    ) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_status_invalid" })
    }
  }
  if (receipt.status === "insufficient" && receipt.unresolvedFactKeys.length < 1) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_status_invalid" })
  }
  if (receipt.status === "conflicted") {
    const conflictFacts = new Set(input.evidencePack.conflicts.map((conflict) => conflict.factKey))
    if (
      conflictFacts.size < 1 ||
      [...conflictFacts].some((fact) =>
        !(receipt.unresolvedFactKeys as string[]).includes(fact))
    ) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_status_invalid" })
    }
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      packFingerprint: input.evidencePack.packFingerprint,
      budgetFingerprint: input.evidencePack.budgetFingerprint,
      status: receipt.status,
      answerDraft,
      supportedUnitRefs: Object.freeze([...(receipt.supportedUnitRefs as string[])]),
      unresolvedFactKeys: Object.freeze([...(receipt.unresolvedFactKeys as string[])]),
    }),
  })
}
