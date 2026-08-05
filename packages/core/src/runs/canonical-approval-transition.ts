import { createHash } from "node:crypto"
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"
import type { CanonicalTerminalCause } from "../contracts/canonical-work-receipt.js"
import type { CanonicalWorkEvent } from "../contracts/canonical-work-state.js"
import type { ApprovalOperationBinding } from "./approval-registry.js"

export type CanonicalApprovalEvent = Extract<
  CanonicalWorkEvent,
  "APPROVAL_REQUESTED" | "APPROVAL_CONSUMED" | "APPROVAL_DENIED_OR_EXPIRED"
>

export interface CanonicalApprovalTransitionDescriptor {
  readonly runId: string
  readonly workId: string
  readonly event: CanonicalApprovalEvent
  readonly receiptId: string
  readonly kind: "approval"
  readonly evidenceFingerprint: `sha256:${string}`
  readonly evidenceRefs: readonly [string, string]
  readonly terminalCause?: CanonicalTerminalCause
}

export function buildCanonicalApprovalTransitionDescriptor(input: {
  runId: string
  approvalId: string
  event: CanonicalApprovalEvent
  operationBinding: ApprovalOperationBinding
}): CanonicalApprovalTransitionDescriptor {
  const runId = input.runId.trim()
  const approvalId = input.approvalId.trim()
  const operationId = input.operationBinding.operationId.trim()
  if (!runId || !approvalId || !operationId) {
    throw new Error("Canonical approval transition identity is required.")
  }
  if (
    !/^sha256:[a-f0-9]{64}$/u.test(input.operationBinding.operationBindingHash)
    || input.operationBinding.continuationSchemaVersion !== 1
  ) {
    throw new Error("Canonical approval operation binding is invalid.")
  }
  const digest = createHash("sha256")
    .update(JSON.stringify({
      approvalId,
      event: input.event,
      operationId,
      operationBindingHash: input.operationBinding.operationBindingHash,
      continuationSchemaVersion:
        input.operationBinding.continuationSchemaVersion,
    }))
    .digest("hex")
  return Object.freeze({
    runId,
    workId: canonicalWorkIdForRootRun(runId),
    event: input.event,
    receiptId: `receipt:approval:${input.event.toLowerCase()}:${digest.slice(0, 24)}`,
    kind: "approval" as const,
    evidenceFingerprint: `sha256:${digest}` as const,
    evidenceRefs: Object.freeze([
      `approval:${approvalId}`,
      `operation:${operationId}`,
    ]) as readonly [string, string],
    ...(input.event === "APPROVAL_DENIED_OR_EXPIRED"
      ? {
          terminalCause: Object.freeze({
            schemaVersion: 1 as const,
            originStage: "execution" as const,
            outcomeKind: "blocked" as const,
            reasonCode: "approval_denied_or_expired",
          }),
        }
      : {}),
  })
}

interface PersistedApprovalReceipt {
  readonly workId: string
  readonly kind: string
  readonly evidenceFingerprint: string
  readonly evidenceRefs: readonly string[]
  readonly consumedRevision?: number
  readonly terminalCause?: CanonicalTerminalCause
}

export function recordCanonicalApprovalTransition(
  descriptor: CanonicalApprovalTransitionDescriptor,
  dependencies: {
    issueReceipt: (input: {
      receiptId: string
      workId: string
      kind: "approval"
      evidenceFingerprint: `sha256:${string}`
      evidenceRefs: string[]
      terminalCause?: CanonicalTerminalCause
    }) => { issued: true } | { issued: false; reasonCode: string }
    loadReceipt: (receiptId: string) => PersistedApprovalReceipt | undefined
    applyTransition: (input: {
      runId: string
      workId: string
      event: CanonicalApprovalEvent
      receiptRef: string
    }) => { status: string; reasonCode?: string }
  },
): { ok: true } | { ok: false; reasonCode: string } {
  const receipt = {
    receiptId: descriptor.receiptId,
    workId: descriptor.workId,
    kind: descriptor.kind,
    evidenceFingerprint: descriptor.evidenceFingerprint,
    evidenceRefs: [...descriptor.evidenceRefs],
    ...(descriptor.terminalCause ? { terminalCause: descriptor.terminalCause } : {}),
  }
  const issued = dependencies.issueReceipt(receipt)
  if (!issued.issued) {
    const existing = dependencies.loadReceipt(descriptor.receiptId)
    const exact =
      existing
      && existing.workId === receipt.workId
      && existing.kind === receipt.kind
      && existing.evidenceFingerprint === receipt.evidenceFingerprint
      && existing.evidenceRefs.length === receipt.evidenceRefs.length
      && existing.evidenceRefs.every(
        (ref, index) => ref === receipt.evidenceRefs[index],
      )
      && JSON.stringify(existing.terminalCause ?? null)
        === JSON.stringify(receipt.terminalCause ?? null)
    if (!exact) return { ok: false, reasonCode: issued.reasonCode }
    if (existing.consumedRevision !== undefined) return { ok: true }
  }
  const transition = dependencies.applyTransition({
    runId: descriptor.runId,
    workId: descriptor.workId,
    event: descriptor.event,
    receiptRef: descriptor.receiptId,
  })
  return transition.status === "applied"
    ? { ok: true }
    : {
        ok: false,
        reasonCode:
          transition.reasonCode ?? "canonical_approval_transition_rejected",
      }
}
