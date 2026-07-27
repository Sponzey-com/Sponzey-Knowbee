import type { PromptActivationEvidenceDecision } from "./prompt-activation-evidence.js"

export interface PreActivationTestReceipt {
  testId: string
  status: "passed" | "failed"
  sourceRef: string
  sourceVersion: string
  sourceChecksum: string
  executedAt: number
  evidenceRef: string
}

export type PreActivationTestDecision =
  | { status: "authorized"; testIds: string[]; evidenceRefs: string[] }
  | { status: "blocked"; reasonCode: "activation_test_invalid" | "activation_test_missing" | "activation_test_failed" | "activation_test_lineage_mismatch" | "activation_test_time_invalid" }

export type PromptRollbackEvidenceDecision =
  | { status: "authorized"; sourceRef: string; targetVersion: string; targetChecksum: string; rollbackSourceRef: string; verificationRef: string }
  | { status: "blocked"; reasonCode: string }

export type CompletePromptActivationDecision =
  | {
      status: "authorized"
      activationId: string
      sourceRef: string
      sourceVersion: string
      loaderId: string
      activatedAt: number
      method: string
      testIds: string[]
      rollbackSourceRef: string
      evidenceRefs: string[]
    }
  | { status: "blocked"; reasonCode: "activation_evidence_blocked" | "activation_tests_blocked" | "rollback_evidence_blocked" | "rollback_target_invalid" }

function exact(value: string): string {
  return value.trim()
}

export function authorizePreActivationTests(input: {
  requiredTestIds: readonly string[]
  receipts: readonly PreActivationTestReceipt[]
  sourceRef: string
  sourceVersion: string
  sourceChecksum: string
  sourceWrittenAt: number
  activatedAt: number
}): PreActivationTestDecision {
  const required = input.requiredTestIds.map(exact)
  if (required.length === 0 || required.some((testId) => !testId) || new Set(required).size !== required.length) {
    return { status: "blocked", reasonCode: "activation_test_invalid" }
  }
  const receipts = new Map<string, PreActivationTestReceipt>()
  for (const receipt of input.receipts) {
    if (!exact(receipt.testId) || receipts.has(receipt.testId) || !exact(receipt.evidenceRef)) {
      return { status: "blocked", reasonCode: "activation_test_invalid" }
    }
    receipts.set(receipt.testId, receipt)
  }
  for (const testId of required) {
    const receipt = receipts.get(testId)
    if (!receipt) return { status: "blocked", reasonCode: "activation_test_missing" }
    if (receipt.status !== "passed") return { status: "blocked", reasonCode: "activation_test_failed" }
    if (receipt.sourceRef !== input.sourceRef || receipt.sourceVersion !== input.sourceVersion || receipt.sourceChecksum !== input.sourceChecksum) {
      return { status: "blocked", reasonCode: "activation_test_lineage_mismatch" }
    }
    if (!Number.isSafeInteger(receipt.executedAt) || receipt.executedAt < input.sourceWrittenAt || receipt.executedAt >= input.activatedAt) {
      return { status: "blocked", reasonCode: "activation_test_time_invalid" }
    }
  }
  return { status: "authorized", testIds: required, evidenceRefs: required.map((testId) => receipts.get(testId)!.evidenceRef) }
}

export function authorizeCompletePromptActivation(input: {
  activation: PromptActivationEvidenceDecision
  tests: PreActivationTestDecision
  rollback: PromptRollbackEvidenceDecision
}): CompletePromptActivationDecision {
  if (input.activation.status !== "authorized") return { status: "blocked", reasonCode: "activation_evidence_blocked" }
  if (input.tests.status !== "authorized") return { status: "blocked", reasonCode: "activation_tests_blocked" }
  if (input.rollback.status !== "authorized") return { status: "blocked", reasonCode: "rollback_evidence_blocked" }
  if (input.rollback.sourceRef !== input.activation.sourceRef
    || input.rollback.targetVersion === input.activation.sourceVersion
    || input.rollback.targetChecksum === input.activation.sourceChecksum
    || !exact(input.rollback.rollbackSourceRef) || !exact(input.rollback.verificationRef)) {
    return { status: "blocked", reasonCode: "rollback_target_invalid" }
  }
  return {
    status: "authorized",
    activationId: input.activation.activationId,
    sourceRef: input.activation.sourceRef,
    sourceVersion: input.activation.sourceVersion,
    loaderId: input.activation.loaderId,
    activatedAt: input.activation.activatedAt,
    method: input.activation.method,
    testIds: input.tests.testIds,
    rollbackSourceRef: input.rollback.rollbackSourceRef,
    evidenceRefs: [...input.activation.evidenceRefs, ...input.tests.evidenceRefs, input.rollback.verificationRef],
  }
}

export async function publishCompletePromptActivation<T>(input: {
  decision: CompletePromptActivationDecision
  publish: (authorization: Extract<CompletePromptActivationDecision, { status: "authorized" }>) => Promise<T>
}): Promise<{ status: "published"; result: T } | Extract<CompletePromptActivationDecision, { status: "blocked" }>> {
  if (input.decision.status !== "authorized") return input.decision
  return { status: "published", result: await input.publish(input.decision) }
}
