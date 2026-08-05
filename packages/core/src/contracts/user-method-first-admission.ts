export type UserMethodRisk = "safe" | "approval_required" | "denied"

export interface UserMethodBindingSnapshot {
  methodId: string
  targetId: string
  risk: UserMethodRisk
}

export interface UserMethodSnapshotReceipt {
  receiptId: string
  requestId: string
  snapshotId: string
  snapshotFingerprint: `sha256:${string}`
}

export interface UserMethodFirstInput {
  requestId: string
  targetId: string
  preferredMethodIds: string[]
  approvedMethodIds: string[]
  capabilitySnapshot: {
    snapshotId: string
    fingerprint: `sha256:${string}`
    bindings: UserMethodBindingSnapshot[]
  }
  snapshotReceipt: UserMethodSnapshotReceipt
}

export type UserMethodFirstRejectionCode =
  | "user_method_input_invalid"
  | "capability_snapshot_receipt_mismatch"
  | "ambiguous_method_binding"

export type UserMethodFirstAdmission =
  | {
      status: "selected" | "approval_required"
      requestId: string
      methodId: string
      targetId: string
      preferenceIndex: number
      snapshotReceiptId: string
    }
  | { status: "unavailable"; requestId: string; targetId: string; reviewedMethodIds: string[] }
  | { status: "rejected"; reasonCodes: UserMethodFirstRejectionCode[] }

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u

function normalized(value: string): string {
  return value.trim()
}

function validUniqueText(values: string[]): boolean {
  if (!Array.isArray(values) || values.length === 0) return false
  const normalizedValues = values.map(normalized)
  return normalizedValues.every(Boolean) && new Set(normalizedValues).size === values.length
}

function structurallyValid(input: UserMethodFirstInput): boolean {
  return Boolean(
    normalized(input.requestId) &&
      normalized(input.targetId) &&
      validUniqueText(input.preferredMethodIds) &&
      (input.approvedMethodIds.length === 0 || validUniqueText(input.approvedMethodIds)) &&
      normalized(input.capabilitySnapshot.snapshotId) &&
      SHA256_PATTERN.test(input.capabilitySnapshot.fingerprint) &&
      Array.isArray(input.capabilitySnapshot.bindings) &&
      input.capabilitySnapshot.bindings.every(
        (binding) =>
          normalized(binding.methodId) &&
          normalized(binding.targetId) &&
          ["safe", "approval_required", "denied"].includes(binding.risk),
      ) &&
      normalized(input.snapshotReceipt.receiptId),
  )
}

export function selectFirstUserMethod(input: UserMethodFirstInput): UserMethodFirstAdmission {
  if (!structurallyValid(input)) {
    return { status: "rejected", reasonCodes: ["user_method_input_invalid"] }
  }
  if (
    normalized(input.snapshotReceipt.requestId) !== normalized(input.requestId) ||
    normalized(input.snapshotReceipt.snapshotId) !==
      normalized(input.capabilitySnapshot.snapshotId) ||
    input.snapshotReceipt.snapshotFingerprint !== input.capabilitySnapshot.fingerprint
  ) {
    return { status: "rejected", reasonCodes: ["capability_snapshot_receipt_mismatch"] }
  }

  const approved = new Set(input.approvedMethodIds.map(normalized))
  const targetId = normalized(input.targetId)
  for (const [preferenceIndex, rawMethodId] of input.preferredMethodIds.entries()) {
    const methodId = normalized(rawMethodId)
    const matches = input.capabilitySnapshot.bindings.filter(
      (binding) =>
        normalized(binding.methodId) === methodId && normalized(binding.targetId) === targetId,
    )
    if (matches.length > 1) {
      return { status: "rejected", reasonCodes: ["ambiguous_method_binding"] }
    }
    const binding = matches[0]
    if (!binding || binding.risk === "denied") continue
    const base = {
      requestId: normalized(input.requestId),
      methodId,
      targetId,
      preferenceIndex,
      snapshotReceiptId: input.snapshotReceipt.receiptId,
    }
    if (binding.risk === "approval_required" && !approved.has(methodId)) {
      return { status: "approval_required", ...base }
    }
    return { status: "selected", ...base }
  }
  return {
    status: "unavailable",
    requestId: normalized(input.requestId),
    targetId,
    reviewedMethodIds: input.preferredMethodIds.map(normalized),
  }
}
