import { createHash } from "node:crypto"

import type {
  WebEvidenceCompressionResult,
  WebEvidenceUnit,
} from "./web-evidence-compression.js"
import type {
  TokenEstimatorPort,
  WebResearchContextBudget,
} from "./web-research-context-budget.js"

const SHA256 = /^sha256:[a-f0-9]{64}$/u

export interface WebEvidenceConflict {
  readonly factKey: string
  readonly unitRefs: readonly string[]
  readonly reason: string
}

export interface WebEvidenceReview {
  readonly evidenceSnapshotFingerprint: `sha256:${string}`
  readonly budgetFingerprint: `sha256:${string}`
  readonly duplicateGroups: readonly (readonly string[])[]
  readonly conflicts: readonly WebEvidenceConflict[]
  readonly unresolvedFactKeys: readonly string[]
}

export interface WebEvidencePack {
  readonly schemaVersion: 1
  readonly packFingerprint: `sha256:${string}`
  readonly budgetFingerprint: `sha256:${string}`
  readonly evidenceSnapshotFingerprint: `sha256:${string}`
  readonly units: readonly WebEvidenceUnit[]
  readonly conflicts: readonly WebEvidenceConflict[]
  readonly unresolvedFactKeys: readonly string[]
  readonly provenanceIndex: readonly Readonly<{
    evidenceRef: string
    sourceTitle: string
    url: string
    publishedAt: string | null
    retrievedAt: string
    chunkRefs: readonly string[]
  }>[]
  readonly droppedUnitRefs: readonly string[]
  readonly totalTokenEstimate: number
}

export type WebEvidencePackResult =
  | Readonly<{ ok: true; value: WebEvidencePack }>
  | Readonly<{
      ok: false
      reasonCode:
        | "web_evidence_pack_input_invalid"
        | "web_evidence_review_receipt_invalid"
        | "web_evidence_review_fingerprint_mismatch"
        | "web_evidence_review_reference_invalid"
        | "web_evidence_review_fact_invalid"
        | "web_evidence_pack_estimator_invalid"
        | "web_evidence_pack_budget_exhausted"
    }>

function sha256(value: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`
}

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

export function webEvidenceSnapshotFingerprint(
  units: readonly WebEvidenceUnit[],
  requiredFactKeys: readonly string[],
  budgetFingerprint: string,
): `sha256:${string}` {
  return sha256(JSON.stringify({
    budgetFingerprint,
    requiredFactKeys,
    units: units.map((unit) => ({
      unitRef: unit.unitRef,
      evidenceRef: unit.evidenceRef,
      chunkRefs: unit.chunkRefs,
      factKey: unit.factKey,
      confidence: unit.confidence,
    })),
  }))
}

export function admitWebEvidenceReview(input: Readonly<{
  receipt: unknown
  units: readonly WebEvidenceUnit[]
  requiredFactKeys: readonly string[]
  budgetFingerprint: `sha256:${string}`
  evidenceSnapshotFingerprint: `sha256:${string}`
}>): WebEvidencePackResult | Readonly<{ ok: true; review: WebEvidenceReview }> {
  if (!input.receipt || typeof input.receipt !== "object" || Array.isArray(input.receipt)) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_review_receipt_invalid" })
  }
  const receipt = input.receipt as Record<string, unknown>
  if (!exactKeys(receipt, [
    "budgetFingerprint",
    "evidenceSnapshotFingerprint",
    "duplicateGroups",
    "conflicts",
    "unresolvedFactKeys",
  ])) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_review_receipt_invalid" })
  }
  if (
    receipt.budgetFingerprint !== input.budgetFingerprint ||
    receipt.evidenceSnapshotFingerprint !== input.evidenceSnapshotFingerprint
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_review_fingerprint_mismatch" })
  }
  if (
    !Array.isArray(receipt.duplicateGroups) ||
    !Array.isArray(receipt.conflicts) ||
    !Array.isArray(receipt.unresolvedFactKeys)
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_review_receipt_invalid" })
  }
  const units = new Map<string, WebEvidenceUnit>(
    input.units.map((unit) => [unit.unitRef, unit]),
  )
  const allowedFacts = new Set(input.requiredFactKeys)
  const groupedRefs = new Set<string>()
  const duplicateGroups: (readonly string[])[] = []
  for (const rawGroup of receipt.duplicateGroups) {
    if (
      !Array.isArray(rawGroup) ||
      rawGroup.length < 2 ||
      new Set(rawGroup).size !== rawGroup.length ||
      rawGroup.some((ref) => !text(ref, 128) || !units.has(ref as string))
    ) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_review_reference_invalid" })
    }
    const group = rawGroup as string[]
    const factKeys = new Set(group.map((ref) => units.get(ref)?.factKey))
    if (factKeys.size !== 1 || group.some((ref) => groupedRefs.has(ref))) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_review_fact_invalid" })
    }
    group.forEach((ref) => groupedRefs.add(ref))
    duplicateGroups.push(Object.freeze([...group]))
  }

  const conflicts: WebEvidenceConflict[] = []
  for (const rawConflict of receipt.conflicts) {
    if (!rawConflict || typeof rawConflict !== "object" || Array.isArray(rawConflict)) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_review_receipt_invalid" })
    }
    const conflict = rawConflict as Record<string, unknown>
    if (!exactKeys(conflict, ["factKey", "unitRefs", "reason"])) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_review_receipt_invalid" })
    }
    const factKey = text(conflict.factKey, 128)
    const reason = text(conflict.reason, 512)
    if (
      !factKey ||
      !reason ||
      !allowedFacts.has(factKey) ||
      !Array.isArray(conflict.unitRefs) ||
      conflict.unitRefs.length < 2 ||
      new Set(conflict.unitRefs).size !== conflict.unitRefs.length ||
      conflict.unitRefs.some((ref) =>
        !text(ref, 128) || units.get(ref as string)?.factKey !== factKey)
    ) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_review_fact_invalid" })
    }
    conflicts.push(Object.freeze({
      factKey,
      unitRefs: Object.freeze([...(conflict.unitRefs as string[])]),
      reason,
    }))
  }

  const unresolvedFactKeys = receipt.unresolvedFactKeys.map((fact) => text(fact, 128))
  if (
    unresolvedFactKeys.some((fact) => !fact || !allowedFacts.has(fact)) ||
    new Set(unresolvedFactKeys).size !== unresolvedFactKeys.length
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_review_fact_invalid" })
  }
  return Object.freeze({
    ok: true,
    review: Object.freeze({
      evidenceSnapshotFingerprint: input.evidenceSnapshotFingerprint,
      budgetFingerprint: input.budgetFingerprint,
      duplicateGroups: Object.freeze(duplicateGroups),
      conflicts: Object.freeze(conflicts),
      unresolvedFactKeys: Object.freeze(unresolvedFactKeys as string[]),
    }),
  })
}

function provenanceIndex(units: readonly WebEvidenceUnit[]): WebEvidencePack["provenanceIndex"] {
  const byEvidence = new Map<string, WebEvidenceUnit[]>()
  for (const unit of units) {
    const existing = byEvidence.get(unit.evidenceRef) ?? []
    existing.push(unit)
    byEvidence.set(unit.evidenceRef, existing)
  }
  return Object.freeze([...byEvidence.values()].map((sourceUnits) => {
    const first = sourceUnits[0]!
    return Object.freeze({
      evidenceRef: first.evidenceRef,
      sourceTitle: first.sourceTitle,
      url: first.url,
      publishedAt: first.publishedAt,
      retrievedAt: first.retrievedAt,
      chunkRefs: Object.freeze([...new Set(sourceUnits.flatMap((unit) => unit.chunkRefs))]),
    })
  }))
}

export function assembleWebEvidencePack(input: Readonly<{
  budget: WebResearchContextBudget
  units: readonly WebEvidenceUnit[]
  compressionResults: readonly WebEvidenceCompressionResult[]
  review: WebEvidenceReview
  estimator: TokenEstimatorPort
}>): WebEvidencePackResult {
  if (
    input.estimator.version.trim() !== input.budget.estimatorVersion ||
    input.units.length < 1 ||
    input.units.some((unit) => unit.budgetFingerprint !== input.budget.fingerprint)
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_pack_input_invalid" })
  }
  const unitByRef = new Map<string, WebEvidenceUnit>(
    input.units.map((unit) => [unit.unitRef, unit]),
  )
  const protectedRefs = new Set(input.review.conflicts.flatMap((conflict) => conflict.unitRefs))
  const droppedRefs = new Set<string>()
  for (const group of input.review.duplicateGroups) {
    const protectedGroupRefs = group.filter((ref) => protectedRefs.has(ref))
    const retainedRef = protectedGroupRefs[0] ?? [...group].sort((left, right) => {
      const confidenceDifference =
        (unitByRef.get(right)?.confidence ?? 0) - (unitByRef.get(left)?.confidence ?? 0)
      return confidenceDifference || left.localeCompare(right)
    })[0]
    for (const ref of group) {
      if (ref !== retainedRef && !protectedRefs.has(ref)) droppedRefs.add(ref)
    }
  }

  let retained = input.units.filter((unit) => !droppedRefs.has(unit.unitRef))
  const unresolved = Object.freeze([...new Set([
    ...input.compressionResults.flatMap((result) => result.unresolvedFactKeys),
    ...input.review.unresolvedFactKeys,
  ])])
  const buildProjection = (units: readonly WebEvidenceUnit[]) => ({
    schemaVersion: 1 as const,
    budgetFingerprint: input.budget.fingerprint,
    evidenceSnapshotFingerprint: input.review.evidenceSnapshotFingerprint,
    units,
    conflicts: input.review.conflicts,
    unresolvedFactKeys: unresolved,
    provenanceIndex: provenanceIndex(units),
    droppedUnitRefs: Object.freeze(input.units
      .filter((unit) => !units.some((retainedUnit) => retainedUnit.unitRef === unit.unitRef))
      .map((unit) => unit.unitRef)),
  })
  const estimateProjection = (projection: ReturnType<typeof buildProjection>): number | null => {
    try {
      const value = input.estimator.estimateTokens(JSON.stringify(projection))
      return Number.isInteger(value) && value >= 0 ? value : null
    } catch {
      return null
    }
  }

  let projection = buildProjection(retained)
  let estimatedTokens = estimateProjection(projection)
  if (estimatedTokens === null) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_pack_estimator_invalid" })
  }
  while (estimatedTokens > input.budget.allocations.webEvidenceTokens) {
    const factCounts = new Map<string, number>()
    retained.forEach((unit) => factCounts.set(unit.factKey, (factCounts.get(unit.factKey) ?? 0) + 1))
    const removable = [...retained]
      .filter((unit) =>
        !protectedRefs.has(unit.unitRef) &&
        ((factCounts.get(unit.factKey) ?? 0) > 1 || unresolved.includes(unit.factKey)))
      .sort((left, right) =>
        left.confidence - right.confidence || right.unitRef.localeCompare(left.unitRef))[0]
    if (!removable) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_pack_budget_exhausted" })
    }
    droppedRefs.add(removable.unitRef)
    retained = retained.filter((unit) => unit.unitRef !== removable.unitRef)
    projection = buildProjection(retained)
    estimatedTokens = estimateProjection(projection)
    if (estimatedTokens === null) {
      return Object.freeze({ ok: false, reasonCode: "web_evidence_pack_estimator_invalid" })
    }
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      ...projection,
      units: Object.freeze([...projection.units]),
      totalTokenEstimate: estimatedTokens,
      packFingerprint: sha256(JSON.stringify({ ...projection, totalTokenEstimate: estimatedTokens })),
    }),
  })
}
