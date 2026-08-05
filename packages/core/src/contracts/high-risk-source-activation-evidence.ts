import type { NextRunPromptActivationDecision } from "./platform-prompt-activation-boundary.js"

export const HIGH_RISK_PERMISSION_CAPABILITIES = [
  "tool",
  "mcp",
  "filesystem",
  "network",
  "yeonjang",
] as const

export type HighRiskPermissionCapability = typeof HIGH_RISK_PERMISSION_CAPABILITIES[number]

export interface HighRiskPermissionGateReceipt {
  changeId: string
  capability: HighRiskPermissionCapability
  testPassed: boolean
  policyPreserved: boolean
  approvalRequired: boolean
  approvalSatisfied: boolean
  policyFingerprint: string
  evidenceRef: string
}

export interface PromptSourceChecksumReceipt {
  changeId: string
  sourceRef: string
  sourceSetFingerprint: string
  baselineChecksum: string
  proposedChecksum: string
  evidenceRef: string
}

export type HighRiskSourceEvidenceDecision =
  | {
      status: "verified"
      changeId: string
      sourceSetFingerprint: string
      permissionCapabilities: readonly HighRiskPermissionCapability[]
      sourceRefs: string[]
    }
  | {
      status: "blocked"
      reasonCode:
        | "permission_receipt_invalid"
        | "permission_scope_mismatch"
        | "permission_missing"
        | "permission_test_failed"
        | "permission_policy_weakened"
        | "permission_approval_unsatisfied"
        | "checksum_receipt_invalid"
        | "checksum_scope_mismatch"
        | "checksum_source_missing"
        | "checksum_source_unexpected"
        | "checksum_unchanged"
        | "checksum_fingerprint_mismatch"
      capability?: HighRiskPermissionCapability
      sourceRef?: string
    }

export type PromptActivationProjection =
  | {
      status: "active"
      activationRunId: string
      runtimeSnapshotFingerprint: string
      method: "reload" | "restart" | "next_request_snapshot"
    }
  | { status: "pending"; reasonCode: Extract<NextRunPromptActivationDecision, { status: "blocked" }>["reasonCode"] }

function exact(value: string): string {
  return value.trim()
}

function validChecksum(value: string): boolean {
  return /^(?:sha256:)?[a-f0-9]{8,64}$/iu.test(exact(value))
}

export function verifyHighRiskSourceEvidence(input: {
  changeId: string
  expectedSourceRefs: readonly string[]
  expectedSourceSetFingerprint: string
  permissions: readonly HighRiskPermissionGateReceipt[]
  checksums: readonly PromptSourceChecksumReceipt[]
}): HighRiskSourceEvidenceDecision {
  const changeId = exact(input.changeId)
  const sourceSetFingerprint = exact(input.expectedSourceSetFingerprint)
  const expectedRefs = input.expectedSourceRefs.map(exact).filter(Boolean)
  if (!changeId || !sourceSetFingerprint || expectedRefs.length === 0 || new Set(expectedRefs).size !== expectedRefs.length) {
    return { status: "blocked", reasonCode: "checksum_receipt_invalid" }
  }

  const permissions = new Map<HighRiskPermissionCapability, HighRiskPermissionGateReceipt>()
  for (const receipt of input.permissions) {
    if (!HIGH_RISK_PERMISSION_CAPABILITIES.includes(receipt.capability) || permissions.has(receipt.capability) || !exact(receipt.policyFingerprint) || !exact(receipt.evidenceRef)) {
      return { status: "blocked", reasonCode: "permission_receipt_invalid" }
    }
    if (exact(receipt.changeId) !== changeId) return { status: "blocked", reasonCode: "permission_scope_mismatch", capability: receipt.capability }
    permissions.set(receipt.capability, receipt)
  }
  for (const capability of HIGH_RISK_PERMISSION_CAPABILITIES) {
    const receipt = permissions.get(capability)
    if (!receipt) return { status: "blocked", reasonCode: "permission_missing", capability }
    if (!receipt.testPassed) return { status: "blocked", reasonCode: "permission_test_failed", capability }
    if (!receipt.policyPreserved) return { status: "blocked", reasonCode: "permission_policy_weakened", capability }
    if (receipt.approvalRequired && !receipt.approvalSatisfied) {
      return { status: "blocked", reasonCode: "permission_approval_unsatisfied", capability }
    }
  }

  const expected = new Set(expectedRefs)
  const checksums = new Map<string, PromptSourceChecksumReceipt>()
  for (const receipt of input.checksums) {
    const sourceRef = exact(receipt.sourceRef)
    if (!sourceRef || !exact(receipt.evidenceRef) || checksums.has(sourceRef) || !validChecksum(receipt.baselineChecksum) || !validChecksum(receipt.proposedChecksum)) {
      return { status: "blocked", reasonCode: "checksum_receipt_invalid", ...(sourceRef ? { sourceRef } : {}) }
    }
    if (exact(receipt.changeId) !== changeId) return { status: "blocked", reasonCode: "checksum_scope_mismatch", sourceRef }
    if (!expected.has(sourceRef)) return { status: "blocked", reasonCode: "checksum_source_unexpected", sourceRef }
    if (exact(receipt.sourceSetFingerprint) !== sourceSetFingerprint) {
      return { status: "blocked", reasonCode: "checksum_fingerprint_mismatch", sourceRef }
    }
    if (exact(receipt.baselineChecksum) === exact(receipt.proposedChecksum)) {
      return { status: "blocked", reasonCode: "checksum_unchanged", sourceRef }
    }
    checksums.set(sourceRef, receipt)
  }
  for (const sourceRef of expectedRefs) {
    if (!checksums.has(sourceRef)) return { status: "blocked", reasonCode: "checksum_source_missing", sourceRef }
  }
  return {
    status: "verified",
    changeId,
    sourceSetFingerprint,
    permissionCapabilities: HIGH_RISK_PERMISSION_CAPABILITIES,
    sourceRefs: expectedRefs,
  }
}

export function projectPromptActivation(decision: NextRunPromptActivationDecision): PromptActivationProjection {
  if (decision.status !== "authorized") return { status: "pending", reasonCode: decision.reasonCode }
  return {
    status: "active",
    activationRunId: decision.activation.activationRunId,
    runtimeSnapshotFingerprint: decision.activation.nextRuntimeSnapshotFingerprint,
    method: decision.activation.method,
  }
}

export async function publishConfirmedPromptActivation<T>(input: {
  projection: PromptActivationProjection
  publish: (active: Extract<PromptActivationProjection, { status: "active" }>) => Promise<T>
}): Promise<{ status: "published"; result: T } | Extract<PromptActivationProjection, { status: "pending" }>> {
  if (input.projection.status !== "active") return input.projection
  return { status: "published", result: await input.publish(input.projection) }
}
