import { createHash } from "node:crypto"
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js"
import type { CanonicalWorkEvent } from "../contracts/canonical-work-state.js"
import type { CanonicalWorkReceiptKind } from "../contracts/canonical-work-receipt.js"
import type { CanonicalRecoveryReentryInput } from "./execution-cycle-pass.js"

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

export interface CanonicalRecoveryReceiptDescriptor {
  receiptId: string
  workId: string
  kind: CanonicalWorkReceiptKind
  evidenceFingerprint: `sha256:${string}`
  evidenceRefs: string[]
}

export interface CanonicalRecoveryReentryDescriptor {
  runId: string
  workId: string
  strategyFingerprint: `sha256:${string}`
  recoveryFingerprint: `sha256:${string}`
  receipts: readonly [
    CanonicalRecoveryReceiptDescriptor,
    CanonicalRecoveryReceiptDescriptor,
    CanonicalRecoveryReceiptDescriptor,
  ]
}

export function buildCanonicalRecoveryReentryDescriptor(
  input: CanonicalRecoveryReentryInput & {
    allowedTargetIds: ReadonlySet<string>
    allowedProviderIds?: ReadonlySet<string> | undefined
    cancellationTokenId: string
    signalAborted: boolean
  },
):
  | { ok: true; descriptor: CanonicalRecoveryReentryDescriptor }
  | { ok: false; reasonCode: string } {
  if (input.signalAborted) return { ok: false, reasonCode: "recovery_execution_cancelled" }
  const runId = input.runId.trim()
  const message = input.strategy.message.trim()
  const cancellationTokenId = input.cancellationTokenId.trim()
  if (!runId || !message || !cancellationTokenId)
    return { ok: false, reasonCode: "recovery_strategy_invalid" }

  const targetId = input.strategy.targetId?.trim()
  const providerId = input.strategy.providerId?.trim()
  const providerTargetAllowed = Boolean(
    targetId?.startsWith("provider:") && providerId && input.allowedProviderIds?.has(providerId),
  )
  if (targetId && !input.allowedTargetIds.has(targetId) && !providerTargetAllowed) {
    return { ok: false, reasonCode: "recovery_target_not_in_startup_snapshot" }
  }

  const strategy = {
    messageFingerprint: `sha256:${digest(message)}`,
    model: input.strategy.model?.trim() || null,
    providerId: providerId || null,
    targetId: targetId || null,
    targetLabelFingerprint: input.strategy.targetLabel?.trim()
      ? `sha256:${digest(input.strategy.targetLabel.trim())}`
      : null,
    workerRuntimeKind: input.strategy.workerRuntimeKind?.trim() || null,
  }
  const strategyDigest = digest(stableStringify(strategy))
  const previousResultDigest = digest(input.previousResult)
  const recoveryDigest = digest(
    stableStringify({
      previousResultFingerprint: `sha256:${previousResultDigest}`,
      strategyFingerprint: `sha256:${strategyDigest}`,
    }),
  )
  const workId = canonicalWorkIdForRootRun(runId)
  const commonRefs = [
    `previous-attempt:${runId}:${previousResultDigest.slice(0, 24)}`,
    `recovery-strategy:${runId}:${strategyDigest.slice(0, 24)}`,
    `cancellation-token:${cancellationTokenId}`,
    ...(targetId ? [`target:${targetId}`] : []),
  ]
  const makeReceipt = (
    kind: CanonicalWorkReceiptKind,
    stage: "recovery" | "policy" | "execution",
  ): CanonicalRecoveryReceiptDescriptor => {
    const stageDigest = digest(`${recoveryDigest}\u0000${stage}`)
    return {
      receiptId: `receipt:${stage}:${runId}:${stageDigest.slice(0, 24)}`,
      workId,
      kind,
      evidenceFingerprint: `sha256:${stageDigest}`,
      evidenceRefs: [...commonRefs, `recovery-stage:${stage}`],
    }
  }

  return {
    ok: true,
    descriptor: {
      runId,
      workId,
      strategyFingerprint: `sha256:${strategyDigest}`,
      recoveryFingerprint: `sha256:${recoveryDigest}`,
      receipts: [
        makeReceipt("recovery", "recovery"),
        makeReceipt("policy", "policy"),
        makeReceipt("execution", "execution"),
      ],
    },
  }
}

interface PersistedRecoveryReceipt {
  workId: string
  kind: string
  evidenceFingerprint: string
  evidenceRefs: string[]
  consumedRevision?: number | undefined
}

const REENTRY_EVENTS: readonly [CanonicalWorkEvent, CanonicalWorkEvent, CanonicalWorkEvent] = [
  "RECOVERY_ACCEPTED",
  "POLICY_ALLOWED",
  "EXECUTION_STARTED",
]

function isExactReceipt(
  existing: PersistedRecoveryReceipt | undefined,
  descriptor: CanonicalRecoveryReceiptDescriptor,
): boolean {
  return Boolean(
    existing &&
      existing.workId === descriptor.workId &&
      existing.kind === descriptor.kind &&
      existing.evidenceFingerprint === descriptor.evidenceFingerprint &&
      existing.evidenceRefs.length === descriptor.evidenceRefs.length &&
      existing.evidenceRefs.every((ref, index) => ref === descriptor.evidenceRefs[index]),
  )
}

export function recordCanonicalRecoveryReentry(
  descriptor: CanonicalRecoveryReentryDescriptor,
  startRevision: number,
  dependencies: {
    issueReceipt: (
      input: CanonicalRecoveryReceiptDescriptor,
    ) => { issued: true } | { issued: false; reasonCode: string }
    loadReceipt: (receiptId: string) => PersistedRecoveryReceipt | undefined
    applyTransition: (input: {
      runId: string
      workId: string
      expectedRevision: number
      event: CanonicalWorkEvent
      receiptRef: string
    }) => { status: string; reasonCode?: string | undefined }
  },
): { ok: true } | { ok: false; reasonCode: string } {
  if (!Number.isSafeInteger(startRevision) || startRevision < 0) {
    return { ok: false, reasonCode: "recovery_revision_invalid" }
  }

  for (const receipt of descriptor.receipts) {
    const issued = dependencies.issueReceipt(receipt)
    if (!issued.issued && !isExactReceipt(dependencies.loadReceipt(receipt.receiptId), receipt)) {
      return { ok: false, reasonCode: issued.reasonCode }
    }
  }

  for (const [index, receipt] of descriptor.receipts.entries()) {
    const consumedRevision = dependencies.loadReceipt(receipt.receiptId)?.consumedRevision
    const expectedConsumedRevision = startRevision + index + 1
    if (consumedRevision !== undefined) {
      if (consumedRevision !== expectedConsumedRevision) {
        return { ok: false, reasonCode: "recovery_receipt_consumed_at_invalid_revision" }
      }
      continue
    }
    const transition = dependencies.applyTransition({
      runId: descriptor.runId,
      workId: descriptor.workId,
      expectedRevision: startRevision + index,
      event: REENTRY_EVENTS[index]!,
      receiptRef: receipt.receiptId,
    })
    if (transition.status !== "applied") {
      return {
        ok: false,
        reasonCode: transition.reasonCode ?? "canonical_recovery_transition_rejected",
      }
    }
  }

  return { ok: true }
}
