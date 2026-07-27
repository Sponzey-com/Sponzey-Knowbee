import { createHash } from "node:crypto"
import type { TaskIntakeResult } from "../agent/intake.js"
import { extractIntakeMethodConstraints } from "../agent/intake-method-constraints.js"
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(",")}}`
  return JSON.stringify(value) ?? "null"
}

export interface CanonicalExecutionAdmissionDescriptor {
  runId: string
  workId: string
  receiptId: string
  kind: "execution"
  evidenceFingerprint: `sha256:${string}`
  evidenceRefs: string[]
}

export function buildCanonicalExecutionAdmissionDescriptor(input: {
  runId: string
  intake: TaskIntakeResult
  executorId: string
  cancellationTokenId: string
  signalAborted: boolean
}): { ok: true; descriptor: CanonicalExecutionAdmissionDescriptor } | { ok: false; reasonCode: string } {
  if (input.signalAborted) return { ok: false, reasonCode: "execution_cancelled" }
  const runId = input.runId.trim()
  const executorId = input.executorId.trim()
  const cancellationTokenId = input.cancellationTokenId.trim()
  if (!runId || !executorId || !cancellationTokenId) return { ok: false, reasonCode: "execution_binding_invalid" }
  const constraints = extractIntakeMethodConstraints(input.intake.action_items)
  if (!constraints.ok) return constraints
  const actionCapabilities = [...new Set((input.intake.action_items.length > 0 ? input.intake.action_items.map((action) => action.type) : ["reply"]).map((type) => `action:${type}`))].sort()
  const digest = createHash("sha256").update(stableStringify({ executorId, cancellationTokenId, actionCapabilities, requestedTargetId: constraints.constraints.targetId ?? null })).digest("hex")
  return { ok: true, descriptor: { runId, workId: canonicalWorkIdForRootRun(runId), receiptId: `receipt:execution:${runId}:${digest.slice(0, 24)}`, kind: "execution", evidenceFingerprint: `sha256:${digest}`, evidenceRefs: [`execution-binding:${runId}:${digest.slice(0, 24)}`, `cancellation-token:${cancellationTokenId}`] } }
}

interface PersistedExecutionReceipt { workId: string; kind: string; evidenceFingerprint: string; evidenceRefs: string[]; consumedRevision?: number | undefined }
export function recordCanonicalExecutionAdmission(descriptor: CanonicalExecutionAdmissionDescriptor, dependencies: {
  issueReceipt: (input: Omit<CanonicalExecutionAdmissionDescriptor, "runId">) => { issued: true } | { issued: false; reasonCode: string }
  loadReceipt: (receiptId: string) => PersistedExecutionReceipt | undefined
  applyExecutionTransition: (input: { runId: string; workId: string; receiptRef: string }) => { status: string; reasonCode?: string | undefined }
}): { ok: true } | { ok: false; reasonCode: string } {
  const issued = dependencies.issueReceipt({ receiptId: descriptor.receiptId, workId: descriptor.workId, kind: descriptor.kind, evidenceFingerprint: descriptor.evidenceFingerprint, evidenceRefs: descriptor.evidenceRefs })
  if (!issued.issued) {
    const existing = dependencies.loadReceipt(descriptor.receiptId)
    const exact = existing && existing.workId === descriptor.workId && existing.kind === descriptor.kind && existing.evidenceFingerprint === descriptor.evidenceFingerprint && existing.evidenceRefs.length === descriptor.evidenceRefs.length && existing.evidenceRefs.every((ref, index) => ref === descriptor.evidenceRefs[index])
    if (!exact) return { ok: false, reasonCode: issued.reasonCode }
    if (existing.consumedRevision !== undefined) return existing.consumedRevision === 3 ? { ok: true } : { ok: false, reasonCode: "execution_receipt_consumed_at_invalid_revision" }
  }
  const transition = dependencies.applyExecutionTransition({ runId: descriptor.runId, workId: descriptor.workId, receiptRef: descriptor.receiptId })
  return transition.status === "applied" ? { ok: true } : { ok: false, reasonCode: transition.reasonCode ?? "canonical_execution_transition_rejected" }
}
