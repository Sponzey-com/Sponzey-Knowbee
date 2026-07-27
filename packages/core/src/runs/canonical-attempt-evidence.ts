import { createHash } from "node:crypto"
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"
import type { ExecutionAttemptPassResult } from "./execution-attempt-pass.js"

export interface CanonicalAttemptEvidenceDescriptor {
  runId: string
  workId: string
  receiptId: string
  kind: "attempt"
  evidenceFingerprint: `sha256:${string}`
  evidenceRefs: string[]
}

export function buildCanonicalAttemptEvidenceDescriptor(input: {
  runId: string
  attempt: ExecutionAttemptPassResult
  successfulToolNames: string[]
}): CanonicalAttemptEvidenceDescriptor {
  const runId = input.runId.trim()
  if (!runId) throw new Error("Run ID is required for canonical attempt evidence.")
  const previewDigest = createHash("sha256").update(input.attempt.preview).digest("hex")
  const evidence = {
    failed: input.attempt.failed,
    previewFingerprint: `sha256:${previewDigest}`,
    aiRecovery: Boolean(input.attempt.aiRecovery),
    workerRuntimeRecovery: Boolean(input.attempt.workerRuntimeRecovery),
    executionRecovery: Boolean(input.attempt.executionRecovery),
    sawRealFilesystemMutation: input.attempt.sawRealFilesystemMutation,
    commandFailureSeen: input.attempt.commandFailureSeen,
    commandRecoveredWithinSamePass: input.attempt.commandRecoveredWithinSamePass,
    successfulToolNames: [
      ...new Set(input.successfulToolNames.map((name) => name.trim()).filter(Boolean)),
    ].sort(),
  }
  const digest = createHash("sha256").update(JSON.stringify(evidence)).digest("hex")
  return {
    runId,
    workId: canonicalWorkIdForRootRun(runId),
    receiptId: `receipt:attempt:${runId}:${digest.slice(0, 24)}`,
    kind: "attempt",
    evidenceFingerprint: `sha256:${digest}`,
    evidenceRefs: [
      `attempt-preview:${runId}:${previewDigest.slice(0, 24)}`,
      ...evidence.successfulToolNames.map((name) => `tool-receipt:${name}`),
    ],
  }
}

interface PersistedAttemptReceipt {
  workId: string
  kind: string
  evidenceFingerprint: string
  evidenceRefs: string[]
  consumedRevision?: number | undefined
}
export function recordCanonicalAttemptEvidence(
  descriptor: CanonicalAttemptEvidenceDescriptor,
  dependencies: {
    issueReceipt: (
      input: Omit<CanonicalAttemptEvidenceDescriptor, "runId">,
    ) => { issued: true } | { issued: false; reasonCode: string }
    loadReceipt: (receiptId: string) => PersistedAttemptReceipt | undefined
    applyAttemptTransition: (input: { runId: string; workId: string; receiptRef: string }) => {
      status: string
      reasonCode?: string | undefined
    }
  },
): { ok: true } | { ok: false; reasonCode: string } {
  const issued = dependencies.issueReceipt({
    receiptId: descriptor.receiptId,
    workId: descriptor.workId,
    kind: descriptor.kind,
    evidenceFingerprint: descriptor.evidenceFingerprint,
    evidenceRefs: descriptor.evidenceRefs,
  })
  if (!issued.issued) {
    const existing = dependencies.loadReceipt(descriptor.receiptId)
    const exact =
      existing &&
      existing.workId === descriptor.workId &&
      existing.kind === descriptor.kind &&
      existing.evidenceFingerprint === descriptor.evidenceFingerprint &&
      existing.evidenceRefs.length === descriptor.evidenceRefs.length &&
      existing.evidenceRefs.every((ref, index) => ref === descriptor.evidenceRefs[index])
    if (!exact) return { ok: false, reasonCode: issued.reasonCode }
    if (existing.consumedRevision !== undefined) return { ok: true }
  }
  const transition = dependencies.applyAttemptTransition({
    runId: descriptor.runId,
    workId: descriptor.workId,
    receiptRef: descriptor.receiptId,
  })
  return transition.status === "applied"
    ? { ok: true }
    : { ok: false, reasonCode: transition.reasonCode ?? "canonical_attempt_transition_rejected" }
}
