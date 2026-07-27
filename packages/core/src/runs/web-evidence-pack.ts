import {
  admitWebEvidenceReview,
  assembleWebEvidencePack,
  webEvidenceSnapshotFingerprint,
  type WebEvidencePackResult,
} from "../contracts/web-evidence-pack.js"
import type { WebEvidenceCompressionResult } from "../contracts/web-evidence-compression.js"
import type {
  TokenEstimatorPort,
  WebResearchContextBudget,
} from "../contracts/web-research-context-budget.js"

export interface WebEvidenceReviewPort {
  reviewEvidence(input: Readonly<{
    requestGoal: string
    requiredFactKeys: readonly string[]
    budgetFingerprint: `sha256:${string}`
    evidenceSnapshotFingerprint: `sha256:${string}`
    units: readonly WebEvidenceCompressionResult["units"][number][]
  }>): Promise<unknown>
}

export async function reviewAndAssembleWebEvidencePack(
  input: Readonly<{
    requestGoal: string
    requiredFactKeys: readonly string[]
    budget: WebResearchContextBudget
    compressionResults: readonly WebEvidenceCompressionResult[]
  }>,
  dependencies: Readonly<{
    reviewPort: WebEvidenceReviewPort
    estimator: TokenEstimatorPort
  }>,
): Promise<WebEvidencePackResult> {
  const requestGoal = input.requestGoal.trim()
  const requiredFactKeys = Object.freeze(input.requiredFactKeys.map((fact) => fact.trim()))
  const units = Object.freeze(input.compressionResults.flatMap((result) => result.units))
  if (
    !requestGoal ||
    requestGoal.length > 2_048 ||
    requiredFactKeys.length < 1 ||
    new Set(requiredFactKeys).size !== requiredFactKeys.length ||
    units.length < 1 ||
    input.compressionResults.some((result) =>
      result.budgetFingerprint !== input.budget.fingerprint)
  ) {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_pack_input_invalid" })
  }
  const evidenceSnapshotFingerprint = webEvidenceSnapshotFingerprint(
    units,
    requiredFactKeys,
    input.budget.fingerprint,
  )
  let receipt: unknown
  try {
    receipt = await dependencies.reviewPort.reviewEvidence(Object.freeze({
      requestGoal,
      requiredFactKeys,
      budgetFingerprint: input.budget.fingerprint,
      evidenceSnapshotFingerprint,
      units,
    }))
  } catch {
    return Object.freeze({ ok: false, reasonCode: "web_evidence_review_receipt_invalid" })
  }
  const admitted = admitWebEvidenceReview({
    receipt,
    units,
    requiredFactKeys,
    budgetFingerprint: input.budget.fingerprint,
    evidenceSnapshotFingerprint,
  })
  if (!admitted.ok || !("review" in admitted)) return admitted
  return assembleWebEvidencePack({
    budget: input.budget,
    units,
    compressionResults: input.compressionResults,
    review: admitted.review,
    estimator: dependencies.estimator,
  })
}
