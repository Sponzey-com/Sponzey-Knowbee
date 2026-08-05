import {
  PROMPT_ROLLBACK_SOURCE_MANIFEST,
  validatePromptImprovementRollbackSource,
  type PromptImprovementRollbackSourceType,
} from "./prompt-rollback-source-policy.js"

export { PROMPT_ROLLBACK_SOURCE_MANIFEST } from "./prompt-rollback-source-policy.js"

export const PROMPT_ROLLBACK_VERIFICATION_METHODS = [
  "checksum_compare",
  "registry_readback",
  "reload_regression",
] as const

export type PromptRollbackVerificationMethod = typeof PROMPT_ROLLBACK_VERIFICATION_METHODS[number]

export interface PromptChangeLineage {
  sourceRef: string
  proposedVersion: string
  proposedChecksum: string
  baselineVersion: string
  baselineChecksum: string
}

export interface PromptChangeRollbackReceipt {
  sourceType: PromptImprovementRollbackSourceType
  sourceRef: string
  targetSourceRef: string
  targetBaselineVersion: string
  targetBaselineChecksum: string
  executorId: string
  verificationMethod: PromptRollbackVerificationMethod | string
  evidenceRef: string
}

export type PromptChangeRollbackReadinessDecision =
  | {
      status: "authorized"
      sourceType: PromptImprovementRollbackSourceType
      sourceRef: string
      targetSourceRef: string
      baselineVersion: string
      baselineChecksum: string
      executorId: string
      verificationMethod: PromptRollbackVerificationMethod
      evidenceRef: string
    }
  | {
      status: "blocked"
      reasonCode:
        | "change_lineage_invalid"
        | "rollback_source_invalid"
        | "rollback_lineage_mismatch"
        | "rollback_baseline_invalid"
        | "rollback_executor_missing"
        | "rollback_verification_missing"
        | "rollback_evidence_missing"
    }

function present(value: string): boolean {
  return value.trim().length > 0
}

function validChange(change: PromptChangeLineage): boolean {
  return present(change.sourceRef)
    && present(change.proposedVersion)
    && present(change.proposedChecksum)
    && present(change.baselineVersion)
    && present(change.baselineChecksum)
    && change.proposedVersion !== change.baselineVersion
    && change.proposedChecksum !== change.baselineChecksum
}

export function authorizePromptChangeRollbackReadiness(input: {
  change: PromptChangeLineage
  rollback: PromptChangeRollbackReceipt
}): PromptChangeRollbackReadinessDecision {
  if (!validChange(input.change)) {
    return { status: "blocked", reasonCode: "change_lineage_invalid" }
  }
  if (!validatePromptImprovementRollbackSource(input.rollback).ok) {
    return { status: "blocked", reasonCode: "rollback_source_invalid" }
  }
  if (input.rollback.targetSourceRef !== input.change.sourceRef) {
    return { status: "blocked", reasonCode: "rollback_lineage_mismatch" }
  }
  if (input.rollback.targetBaselineVersion !== input.change.baselineVersion
    || input.rollback.targetBaselineChecksum !== input.change.baselineChecksum
    || input.rollback.targetBaselineVersion === input.change.proposedVersion
    || input.rollback.targetBaselineChecksum === input.change.proposedChecksum) {
    return { status: "blocked", reasonCode: "rollback_baseline_invalid" }
  }
  if (!present(input.rollback.executorId)) {
    return { status: "blocked", reasonCode: "rollback_executor_missing" }
  }
  if (!PROMPT_ROLLBACK_VERIFICATION_METHODS.includes(
    input.rollback.verificationMethod as PromptRollbackVerificationMethod,
  )) {
    return { status: "blocked", reasonCode: "rollback_verification_missing" }
  }
  if (!present(input.rollback.evidenceRef)) {
    return { status: "blocked", reasonCode: "rollback_evidence_missing" }
  }

  return {
    status: "authorized",
    sourceType: input.rollback.sourceType,
    sourceRef: input.rollback.sourceRef,
    targetSourceRef: input.rollback.targetSourceRef,
    baselineVersion: input.rollback.targetBaselineVersion,
    baselineChecksum: input.rollback.targetBaselineChecksum,
    executorId: input.rollback.executorId,
    verificationMethod: input.rollback.verificationMethod as PromptRollbackVerificationMethod,
    evidenceRef: input.rollback.evidenceRef,
  }
}
