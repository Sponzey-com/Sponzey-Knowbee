import {
  type CapabilityMutation,
  type CapabilityMutationState,
  executeCapabilityMutation,
  projectCapabilityMutationReceipt,
} from "./capability-mutation-state-machine.js"
import { type MutationEnvelope, validateMutationEnvelope } from "./capability-security-boundary.js"
import type {
  YeonjangCapabilityItem,
  YeonjangCapabilityStatus,
} from "./yeonjang-capability-projection.js"

export type YeonjangRecoveryAction = "reconnect" | "check_permissions"

export interface YeonjangRecoverySnapshot {
  internalInstanceId: string
  status: YeonjangCapabilityStatus
  permissionState: YeonjangCapabilityItem["permissionState"]
  runnable: boolean
}

export interface YeonjangRecoveryCommandPorts {
  now(): number
  currentRevision(): number
  nonceUsed(nonce: string): boolean
  reserveReceipt(input: {
    envelope: MutationEnvelope
    state: CapabilityMutationState
    now: number
  }): boolean
  updateReceipt(input: {
    mutationId: string
    state: CapabilityMutationState
    reasonCode: string | null
    now: number
  }): void
  resolveYeonjang(yeonjangRef: string): YeonjangRecoverySnapshot | null
  persistIntent(input: {
    internalInstanceId: string
    action: YeonjangRecoveryAction
    expectedRevision: number
    targetRevision: number
  }): Promise<{ ok: boolean; revision: number; reasonCode?: string }>
  applyAction(
    input: { internalInstanceId: string; action: YeonjangRecoveryAction },
    signal: AbortSignal,
  ): Promise<{ ok: boolean; reasonCode?: string }>
  inspectResult(
    internalInstanceId: string,
    signal: AbortSignal,
  ): Promise<YeonjangRecoverySnapshot | null>
  rollbackIntent(
    input: { internalInstanceId: string; baseRevision: number },
    signal: AbortSignal,
  ): Promise<{ ok: boolean; reasonCode?: string }>
}

export interface YeonjangRecoveryReceipt {
  mutationId: string
  state: CapabilityMutationState | "rejected"
  reasonCode: string | null
  allowedActions: readonly string[]
  revision: number
  yeonjangRef: string
  action: YeonjangRecoveryAction
  ready: boolean
}

export interface YeonjangRecoveryVerificationPolicy {
  maxAttempts: number
  intervalMs: number
  wait(intervalMs: number, signal: AbortSignal): Promise<void>
}

function actionAllowed(
  snapshot: YeonjangRecoverySnapshot,
  action: YeonjangRecoveryAction,
): boolean {
  if (action === "reconnect") return ["inactive", "stale", "unavailable"].includes(snapshot.status)
  return (
    snapshot.status === "permission_required" ||
    snapshot.permissionState === "required" ||
    snapshot.permissionState === "restricted"
  )
}

function resultVerified(
  snapshot: YeonjangRecoverySnapshot | null,
  action: YeonjangRecoveryAction,
): boolean {
  if (!snapshot) return false
  if (action === "reconnect") return snapshot.status === "ready" && snapshot.runnable
  return snapshot.status === "ready" && snapshot.permissionState === "ready" && snapshot.runnable
}

async function verifyResultWithPolicy(input: {
  internalInstanceId: string
  action: YeonjangRecoveryAction
  ports: YeonjangRecoveryCommandPorts
  signal: AbortSignal
  policy?: YeonjangRecoveryVerificationPolicy
}): Promise<boolean> {
  const attempts = Math.max(1, Math.min(10, Math.floor(input.policy?.maxAttempts ?? 1)))
  const intervalMs = Math.max(0, Math.min(5_000, Math.floor(input.policy?.intervalMs ?? 0)))
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (input.signal.aborted) return false
    const snapshot = await input.ports.inspectResult(input.internalInstanceId, input.signal)
    if (resultVerified(snapshot, input.action)) return true
    if (attempt + 1 < attempts && input.policy) {
      await input.policy.wait(intervalMs, input.signal)
    }
  }
  return false
}

export async function executeYeonjangRecoveryCommand(
  input: {
    envelope: MutationEnvelope
    yeonjangRef: string
    action: YeonjangRecoveryAction
  },
  ports: YeonjangRecoveryCommandPorts,
  signal: AbortSignal = new AbortController().signal,
  verificationPolicy?: YeonjangRecoveryVerificationPolicy,
): Promise<YeonjangRecoveryReceipt> {
  const baseRevision = ports.currentRevision()
  const rejected = (reasonCode: string): YeonjangRecoveryReceipt => ({
    mutationId: input.envelope.mutationId,
    state: "rejected",
    reasonCode,
    allowedActions: [],
    revision: baseRevision,
    yeonjangRef: input.yeonjangRef,
    action: input.action,
    ready: false,
  })
  if (input.envelope.purpose !== `yeonjang_${input.action}`)
    return rejected("mutation_purpose_denied")
  const checked = validateMutationEnvelope({
    envelope: input.envelope,
    requiredScope: "capability:write",
    currentRevision: baseRevision,
    now: ports.now(),
    maxAgeMs: 5 * 60_000,
    usedNonces: new Set(ports.nonceUsed(input.envelope.nonce) ? [input.envelope.nonce] : []),
  })
  if (!checked.ok) return rejected(checked.diagnostics[0]?.reasonCode ?? "mutation_rejected")
  const snapshot = ports.resolveYeonjang(input.yeonjangRef)
  if (!snapshot) return rejected("yeonjang_ref_not_found")
  if (!actionAllowed(snapshot, input.action)) return rejected("yeonjang_recovery_action_denied")
  if (!ports.reserveReceipt({ envelope: input.envelope, state: "validating", now: ports.now() }))
    return rejected("mutation_nonce_replayed")

  const initial: CapabilityMutation = {
    mutationId: input.envelope.mutationId,
    state: "draft",
    baseRevision,
    targetRevision: input.envelope.targetRevision,
    reasonCode: null,
  }
  const terminal = await executeCapabilityMutation(
    initial,
    {
      validate: async () => ({ ok: true }),
      persist: (expectedRevision) =>
        ports.persistIntent({
          internalInstanceId: snapshot.internalInstanceId,
          action: input.action,
          expectedRevision,
          targetRevision: input.envelope.targetRevision,
        }),
      apply: (_targetRevision, current) =>
        ports.applyAction(
          { internalInstanceId: snapshot.internalInstanceId, action: input.action },
          current,
        ),
      verify: async (_targetRevision, current) => ({
        ok: await verifyResultWithPolicy({
          internalInstanceId: snapshot.internalInstanceId,
          action: input.action,
          ports,
          signal: current,
          ...(verificationPolicy ? { policy: verificationPolicy } : {}),
        }),
        reasonCode: "yeonjang_recovery_verification_failed",
      }),
      rollback: (baseRevisionForRollback, current) =>
        ports.rollbackIntent(
          {
            internalInstanceId: snapshot.internalInstanceId,
            baseRevision: baseRevisionForRollback,
          },
          current,
        ),
    },
    signal,
  )
  ports.updateReceipt({
    mutationId: input.envelope.mutationId,
    state: terminal.state,
    reasonCode: terminal.reasonCode,
    now: ports.now(),
  })
  const receipt = projectCapabilityMutationReceipt(terminal)
  return {
    mutationId: receipt.mutationId,
    state: receipt.state,
    reasonCode: receipt.reasonCode,
    allowedActions: receipt.allowedActions,
    revision: terminal.state === "active" ? terminal.targetRevision : terminal.baseRevision,
    yeonjangRef: input.yeonjangRef,
    action: input.action,
    ready: terminal.state === "active",
  }
}
