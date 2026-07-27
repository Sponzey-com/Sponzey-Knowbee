import type { OwnerScope } from "./sub-agent-orchestration.js"

export type MemoryExchangeOwnerBindingReasonCode =
  | "memory_exchange_owner_binding_valid"
  | "memory_exchange_source_owner_invalid"
  | "memory_exchange_source_owner_mismatch"
  | "memory_exchange_recipient_owner_mismatch"
  | "memory_exchange_same_owner_forbidden"
  | "memory_exchange_provenance_invalid"

export interface MemoryExchangeOwnerBindingInput {
  commandOwner: OwnerScope
  sourceOwner: OwnerScope
  recipientOwner: OwnerScope
  targetAgentId: string
  handoffId: string
  executionSnapshotFingerprint: string
}

export type MemoryExchangeOwnerBindingDecision =
  | {
      allowed: true
      reasonCode: "memory_exchange_owner_binding_valid"
      provenanceRefs: string[]
    }
  | {
      allowed: false
      reasonCode: Exclude<MemoryExchangeOwnerBindingReasonCode, "memory_exchange_owner_binding_valid">
      provenanceRefs: []
    }

function sameOwner(left: OwnerScope, right: OwnerScope): boolean {
  return left.ownerType === right.ownerType && left.ownerId.trim() === right.ownerId.trim()
}

export function evaluateMemoryExchangeOwnerBinding(
  input: MemoryExchangeOwnerBindingInput,
): MemoryExchangeOwnerBindingDecision {
  if (
    (input.sourceOwner.ownerType !== "knowbee" && input.sourceOwner.ownerType !== "sub_agent") ||
    !input.sourceOwner.ownerId.trim()
  ) {
    return { allowed: false, reasonCode: "memory_exchange_source_owner_invalid", provenanceRefs: [] }
  }
  if (!sameOwner(input.commandOwner, input.sourceOwner)) {
    return { allowed: false, reasonCode: "memory_exchange_source_owner_mismatch", provenanceRefs: [] }
  }
  if (
    input.recipientOwner.ownerType !== "sub_agent" ||
    input.recipientOwner.ownerId.trim() !== input.targetAgentId.trim()
  ) {
    return { allowed: false, reasonCode: "memory_exchange_recipient_owner_mismatch", provenanceRefs: [] }
  }
  if (sameOwner(input.sourceOwner, input.recipientOwner)) {
    return { allowed: false, reasonCode: "memory_exchange_same_owner_forbidden", provenanceRefs: [] }
  }
  const handoffId = input.handoffId.trim()
  const snapshotFingerprint = input.executionSnapshotFingerprint.trim()
  if (!handoffId || !/^sha256:[a-f0-9]{64}$/u.test(snapshotFingerprint)) {
    return { allowed: false, reasonCode: "memory_exchange_provenance_invalid", provenanceRefs: [] }
  }
  return {
    allowed: true,
    reasonCode: "memory_exchange_owner_binding_valid",
    provenanceRefs: [
      `work-handoff:${handoffId}`,
      `execution-snapshot:${snapshotFingerprint}`,
    ],
  }
}
