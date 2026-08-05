import { createHash } from "node:crypto"
import type { YeonjangEvidenceEnvelope } from "../yeonjang/evidence.js"
import type { LiveAcceptanceEvidence } from "./live-acceptance-admission.js"

export type VerifiedYeonjangEvidenceRejectionCode =
  | "verified_yeonjang_schema_invalid"
  | "verified_yeonjang_post_check_not_verified"
  | "verified_yeonjang_audit_missing"
  | "verified_yeonjang_redaction_invalid"
  | "verified_yeonjang_timestamp_invalid"

export interface VerifiedYeonjangAcceptanceEvidenceInput {
  readonly evidence: YeonjangEvidenceEnvelope
  readonly auditEventId: string
}

export interface VerifiedYeonjangEvidenceRejection {
  readonly toolName: string
  readonly reasonCode: VerifiedYeonjangEvidenceRejectionCode
}

export interface VerifiedYeonjangEvidenceProductionResult {
  readonly accepted: readonly LiveAcceptanceEvidence[]
  readonly rejected: readonly VerifiedYeonjangEvidenceRejection[]
}

function hashEvidenceRef(evidence: YeonjangEvidenceEnvelope): string {
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        targetRef: evidence.targetRef,
        toolName: evidence.toolName,
        methodIds: evidence.methodIds,
        collectedAt: evidence.collectedAt,
        postCheckKind: evidence.postCheck.kind,
      }),
    )
    .digest("hex")
  return `yeonjang-verified:${hash}`
}

function hasVerifiedPostCheck(evidence: YeonjangEvidenceEnvelope): boolean {
  if (evidence.postCheck.kind === "goal_validated") return evidence.postCheck.verified === true
  if (evidence.postCheck.kind === "verified") return evidence.postCheck.verified === true
  return false
}

function validateVerifiedYeonjangEvidence(
  input: VerifiedYeonjangAcceptanceEvidenceInput,
): VerifiedYeonjangEvidenceRejectionCode | null {
  const evidence = input.evidence
  if (
    evidence.schemaVersion !== "yeonjang-evidence-v1" ||
    !evidence.toolName.trim() ||
    evidence.methodIds.length === 0 ||
    evidence.methodIds.some((method) => !method.trim()) ||
    !evidence.targetRef.trim() ||
    !evidence.summary.trim()
  ) {
    return "verified_yeonjang_schema_invalid"
  }
  if (!hasVerifiedPostCheck(evidence)) return "verified_yeonjang_post_check_not_verified"
  if (!input.auditEventId.trim()) return "verified_yeonjang_audit_missing"
  if (evidence.rawPayloadVisibility !== "audit_only") return "verified_yeonjang_redaction_invalid"
  if (!Number.isSafeInteger(evidence.collectedAt) || evidence.collectedAt < 0) {
    return "verified_yeonjang_timestamp_invalid"
  }
  return null
}

export function produceVerifiedYeonjangAcceptanceEvidence(
  inputs: readonly VerifiedYeonjangAcceptanceEvidenceInput[],
): VerifiedYeonjangEvidenceProductionResult {
  const accepted: LiveAcceptanceEvidence[] = []
  const rejected: VerifiedYeonjangEvidenceRejection[] = []

  for (const input of inputs) {
    const reasonCode = validateVerifiedYeonjangEvidence(input)
    if (reasonCode) {
      rejected.push({
        toolName: input.evidence.toolName || "unknown",
        reasonCode,
      })
      continue
    }
    accepted.push({
      evidenceRef: hashEvidenceRef(input.evidence),
      capability: "yeonjang",
      scenarioId: `yeonjang:verified:${input.evidence.toolName}`,
      terminalStatus: "passed",
      auditEventId: input.auditEventId,
      executedAt: input.evidence.collectedAt,
      redactionStatus: "verified",
    })
  }

  return Object.freeze({
    accepted: Object.freeze(accepted),
    rejected: Object.freeze(rejected),
  })
}
