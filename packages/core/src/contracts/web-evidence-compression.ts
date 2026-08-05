import { createHash } from "node:crypto"

import type { WebDocumentChunk } from "./web-document-chunk.js"

const SHA256 = /^sha256:[a-f0-9]{64}$/u

export interface WebEvidenceSourceMetadata {
  readonly sourceTitle: string
  readonly url: string
  readonly publishedAt: string | null
  readonly retrievedAt: string
  readonly evidenceRef: string
  readonly budgetFingerprint: `sha256:${string}`
}

export interface WebEvidenceUnit {
  readonly unitRef: `sha256:${string}`
  readonly claim: string
  readonly evidence: string
  readonly sourceTitle: string
  readonly url: string
  readonly publishedAt: string | null
  readonly retrievedAt: string
  readonly evidenceRef: string
  readonly chunkRefs: readonly string[]
  readonly factKey: string
  readonly supportType: "direct" | "inference"
  readonly confidence: number
  readonly budgetFingerprint: `sha256:${string}`
}

export interface WebEvidenceCompressionResult {
  readonly budgetFingerprint: `sha256:${string}`
  readonly evidenceRef: string
  readonly units: readonly WebEvidenceUnit[]
  readonly unresolvedFactKeys: readonly string[]
}

export type WebEvidenceCompressionAdmission =
  | Readonly<{ ok: true; value: WebEvidenceCompressionResult }>
  | Readonly<{
      ok: false
      reasonCode:
        | "web_evidence_compression_context_invalid"
        | "web_evidence_compression_receipt_invalid"
        | "web_evidence_compression_fingerprint_mismatch"
        | "web_evidence_compression_reference_invalid"
        | "web_evidence_compression_fact_invalid"
        | "web_evidence_compression_excerpt_invalid"
        | "web_evidence_compression_confidence_invalid"
        | "web_evidence_compression_duplicate"
    }>

export interface WebEvidenceCompressionContext {
  readonly source: WebEvidenceSourceMetadata
  readonly selectedChunks: readonly WebDocumentChunk[]
  readonly requiredFactKeys: readonly string[]
}

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`
}

function exactText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text && text.length <= maxLength ? text : null
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length &&
    expected.every((key, index) => key === actual[index])
}

export function validateWebEvidenceCompressionContext(
  context: WebEvidenceCompressionContext,
): boolean {
  const source = context.source
  let parsed: URL
  try {
    parsed = new URL(source.url)
  } catch {
    return false
  }
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    !exactText(source.sourceTitle, 512) ||
    !exactText(source.evidenceRef, 256) ||
    !Number.isFinite(Date.parse(source.retrievedAt)) ||
    (source.publishedAt !== null && !Number.isFinite(Date.parse(source.publishedAt))) ||
    !SHA256.test(source.budgetFingerprint) ||
    !Array.isArray(context.selectedChunks) ||
    context.selectedChunks.length < 1 ||
    context.selectedChunks.length > 3 ||
    !Array.isArray(context.requiredFactKeys) ||
    context.requiredFactKeys.length < 1 ||
    new Set(context.requiredFactKeys).size !== context.requiredFactKeys.length
  ) {
    return false
  }
  const refs = new Set<string>()
  return context.requiredFactKeys.every((key) => Boolean(exactText(key, 128))) &&
    context.selectedChunks.every((chunk) => {
      if (
        chunk.documentEvidenceRef !== source.evidenceRef ||
        chunk.budgetFingerprint !== source.budgetFingerprint ||
        refs.has(chunk.chunkRef)
      ) {
        return false
      }
      refs.add(chunk.chunkRef)
      return true
    })
}

export function admitWebEvidenceCompression(
  receipt: unknown,
  context: WebEvidenceCompressionContext,
): WebEvidenceCompressionAdmission {
  if (!validateWebEvidenceCompressionContext(context)) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_context_invalid" })
  }
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_receipt_invalid" })
  }
  const record = receipt as Record<string, unknown>
  if (!exactKeys(record, [
    "budgetFingerprint",
    "evidenceRef",
    "units",
    "unresolvedFactKeys",
  ])) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_receipt_invalid" })
  }
  if (
    record.budgetFingerprint !== context.source.budgetFingerprint ||
    record.evidenceRef !== context.source.evidenceRef
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_fingerprint_mismatch" })
  }
  if (
    !Array.isArray(record.units) ||
    record.units.length > 12 ||
    !Array.isArray(record.unresolvedFactKeys)
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_receipt_invalid" })
  }

  const allowedFacts = new Set(context.requiredFactKeys)
  const unresolvedFactKeys = record.unresolvedFactKeys.map((value) => exactText(value, 128))
  if (
    unresolvedFactKeys.some((value) => !value || !allowedFacts.has(value)) ||
    new Set(unresolvedFactKeys).size !== unresolvedFactKeys.length ||
    (record.units.length === 0 && unresolvedFactKeys.length === 0)
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_fact_invalid" })
  }

  const chunks = new Map(context.selectedChunks.map((chunk) => [chunk.chunkRef, chunk]))
  const unitFingerprints = new Set<string>()
  const units: WebEvidenceUnit[] = []
  for (const rawUnit of record.units) {
    if (!rawUnit || typeof rawUnit !== "object" || Array.isArray(rawUnit)) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_receipt_invalid" })
    }
    const unit = rawUnit as Record<string, unknown>
    if (!exactKeys(unit, [
      "claim",
      "evidence",
      "chunkRefs",
      "factKey",
      "supportType",
      "confidence",
    ])) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_receipt_invalid" })
    }
    const claim = exactText(unit.claim, 1_000)
    const evidence = exactText(unit.evidence, 1_200)
    if (!claim || !evidence) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_receipt_invalid" })
    }
    if (
      !Array.isArray(unit.chunkRefs) ||
      unit.chunkRefs.length < 1 ||
      unit.chunkRefs.length > 3 ||
      new Set(unit.chunkRefs).size !== unit.chunkRefs.length ||
      unit.chunkRefs.some((ref) => !exactText(ref, 512) || !chunks.has(ref as string))
    ) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_reference_invalid" })
    }
    const factKey = exactText(unit.factKey, 128)
    if (!factKey || !allowedFacts.has(factKey)) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_fact_invalid" })
    }
    if (
      unit.supportType !== "direct" &&
      unit.supportType !== "inference"
    ) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_receipt_invalid" })
    }
    if (
      typeof unit.confidence !== "number" ||
      !Number.isFinite(unit.confidence) ||
      unit.confidence < 0 ||
      unit.confidence > 1
    ) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_confidence_invalid" })
    }
    if (!(unit.chunkRefs as string[]).some((ref) => chunks.get(ref)?.content.includes(evidence))) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_excerpt_invalid" })
    }
    const unitFingerprint = sha256(JSON.stringify({ claim, evidence }))
    if (unitFingerprints.has(unitFingerprint)) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_duplicate" })
    }
    unitFingerprints.add(unitFingerprint)
    units.push(Object.freeze({
      unitRef: unitFingerprint,
      claim,
      evidence,
      sourceTitle: context.source.sourceTitle,
      url: context.source.url,
      publishedAt: context.source.publishedAt,
      retrievedAt: context.source.retrievedAt,
      evidenceRef: context.source.evidenceRef,
      chunkRefs: Object.freeze([...(unit.chunkRefs as string[])]),
      factKey,
      supportType: unit.supportType,
      confidence: unit.confidence,
      budgetFingerprint: context.source.budgetFingerprint,
    }))
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      budgetFingerprint: context.source.budgetFingerprint,
      evidenceRef: context.source.evidenceRef,
      units: Object.freeze(units),
      unresolvedFactKeys: Object.freeze(unresolvedFactKeys as string[]),
    }),
  })
}
