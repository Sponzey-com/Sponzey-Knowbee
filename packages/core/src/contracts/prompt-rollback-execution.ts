import type {
  PromptChangeLineage,
  PromptChangeRollbackReadinessDecision,
} from "./prompt-change-rollback-readiness.js"

export const PROMPT_ROLLBACK_TRIGGER_KINDS = [
  "tests_failed_after_write",
  "invariant_violation_after_apply",
  "wrong_prompt_version_activated",
  "user_or_admin_requested",
  "changed_source_missing_corrupt_or_unsafe",
] as const

export type PromptRollbackTriggerKind = typeof PROMPT_ROLLBACK_TRIGGER_KINDS[number]

interface PromptRollbackTriggerBase {
  sourceRef: string
  sourceVersion: string
  sourceChecksum: string
  observedAt: number
  evidenceRef: string
}

export type PromptRollbackTriggerReceipt = PromptRollbackTriggerBase & (
  | { kind: "tests_failed_after_write"; failedTestIds: string[] }
  | { kind: "invariant_violation_after_apply"; invariantIds: string[] }
  | { kind: "wrong_prompt_version_activated"; expectedVersion: string; loadedVersion: string }
  | { kind: "user_or_admin_requested"; requestedByType: "user" | "admin"; requestedByRef: string }
  | { kind: "changed_source_missing_corrupt_or_unsafe"; health: "missing" | "corrupt" | "unsafe" }
)

export type PromptRollbackTriggerDecision =
  | {
      status: "authorized"
      kind: PromptRollbackTriggerKind
      sourceRef: string
      sourceVersion: string
      observedAt: number
      evidenceRef: string
    }
  | {
      status: "blocked"
      reasonCode:
        | "source_write_missing"
        | "rollback_trigger_lineage_mismatch"
        | "rollback_trigger_time_invalid"
        | "rollback_trigger_evidence_invalid"
    }

export type PromptRollbackExecutionResult =
  | { status: "restored"; sourceRef: string; version: string; checksum: string; executionRef: string }
  | { status: "failed"; reasonRef: string }

export interface PromptRollbackRestorationReceipt {
  sourceRef: string
  restoredVersion: string
  restoredChecksum: string
  triggerKind: PromptRollbackTriggerKind
  triggerEvidenceRef: string
  readinessEvidenceRef: string
  executionRef: string
  verificationRef: string
}

function present(value: string): boolean {
  return value.trim().length > 0
}

function uniqueNonEmpty(values: readonly string[]): boolean {
  const normalized = values.map((value) => value.trim())
  return normalized.length > 0
    && normalized.every(Boolean)
    && new Set(normalized).size === normalized.length
}

function triggerEvidenceValid(receipt: PromptRollbackTriggerReceipt, change: PromptChangeLineage): boolean {
  switch (receipt.kind) {
    case "tests_failed_after_write":
      return uniqueNonEmpty(receipt.failedTestIds)
    case "invariant_violation_after_apply":
      return uniqueNonEmpty(receipt.invariantIds)
    case "wrong_prompt_version_activated":
      return present(receipt.expectedVersion)
        && receipt.expectedVersion === change.proposedVersion
        && present(receipt.loadedVersion)
        && receipt.loadedVersion !== receipt.expectedVersion
    case "user_or_admin_requested":
      return (receipt.requestedByType === "user" || receipt.requestedByType === "admin")
        && present(receipt.requestedByRef)
    case "changed_source_missing_corrupt_or_unsafe":
      return receipt.health === "missing" || receipt.health === "corrupt" || receipt.health === "unsafe"
  }
}

export function authorizePromptRollbackTrigger(input: {
  change: PromptChangeLineage
  sourceWrittenAt: number
  receipt: PromptRollbackTriggerReceipt
}): PromptRollbackTriggerDecision {
  if (!Number.isSafeInteger(input.sourceWrittenAt) || input.sourceWrittenAt <= 0) {
    return { status: "blocked", reasonCode: "source_write_missing" }
  }
  if (input.receipt.sourceRef !== input.change.sourceRef
    || input.receipt.sourceVersion !== input.change.proposedVersion
    || input.receipt.sourceChecksum !== input.change.proposedChecksum) {
    return { status: "blocked", reasonCode: "rollback_trigger_lineage_mismatch" }
  }
  if (!Number.isSafeInteger(input.receipt.observedAt)
    || input.receipt.observedAt < input.sourceWrittenAt) {
    return { status: "blocked", reasonCode: "rollback_trigger_time_invalid" }
  }
  if (!present(input.receipt.evidenceRef) || !triggerEvidenceValid(input.receipt, input.change)) {
    return { status: "blocked", reasonCode: "rollback_trigger_evidence_invalid" }
  }
  return {
    status: "authorized",
    kind: input.receipt.kind,
    sourceRef: input.receipt.sourceRef,
    sourceVersion: input.receipt.sourceVersion,
    observedAt: input.receipt.observedAt,
    evidenceRef: input.receipt.evidenceRef,
  }
}

export async function executeAuthorizedPromptRollback<T>(input: {
  trigger: PromptRollbackTriggerDecision
  readiness: PromptChangeRollbackReadinessDecision
  execute: (
    readiness: Extract<PromptChangeRollbackReadinessDecision, { status: "authorized" }>,
  ) => Promise<PromptRollbackExecutionResult>
  verify: (restoration: Extract<PromptRollbackExecutionResult, { status: "restored" }>) => Promise<{
    verified: boolean
    verificationRef: string
  }>
  complete: (receipt: PromptRollbackRestorationReceipt) => Promise<T>
}): Promise<
  | { status: "rolled_back"; result: T; restoredVersion: string; restoredChecksum: string }
  | { status: "blocked"; reasonCode: "rollback_trigger_blocked" | "rollback_readiness_missing" | "execution_failed" | "restored_lineage_mismatch" | "restoration_verification_failed" }
> {
  if (input.trigger.status !== "authorized") {
    return { status: "blocked", reasonCode: "rollback_trigger_blocked" }
  }
  if (input.readiness.status !== "authorized") {
    return { status: "blocked", reasonCode: "rollback_readiness_missing" }
  }
  const restoration = await input.execute(input.readiness)
  if (restoration.status !== "restored") {
    return { status: "blocked", reasonCode: "execution_failed" }
  }
  if (restoration.sourceRef !== input.readiness.targetSourceRef
    || restoration.version !== input.readiness.baselineVersion
    || restoration.checksum !== input.readiness.baselineChecksum
    || !present(restoration.executionRef)) {
    return { status: "blocked", reasonCode: "restored_lineage_mismatch" }
  }
  const verification = await input.verify(restoration)
  if (!verification.verified || !present(verification.verificationRef)) {
    return { status: "blocked", reasonCode: "restoration_verification_failed" }
  }
  const receipt: PromptRollbackRestorationReceipt = {
    sourceRef: restoration.sourceRef,
    restoredVersion: restoration.version,
    restoredChecksum: restoration.checksum,
    triggerKind: input.trigger.kind,
    triggerEvidenceRef: input.trigger.evidenceRef,
    readinessEvidenceRef: input.readiness.evidenceRef,
    executionRef: restoration.executionRef,
    verificationRef: verification.verificationRef,
  }
  return {
    status: "rolled_back",
    result: await input.complete(receipt),
    restoredVersion: restoration.version,
    restoredChecksum: restoration.checksum,
  }
}
