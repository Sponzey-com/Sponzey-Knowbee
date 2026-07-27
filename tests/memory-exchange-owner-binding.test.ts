import { describe, expect, it } from "vitest"
import { evaluateMemoryExchangeOwnerBinding } from "../packages/core/src/contracts/memory-exchange-owner-binding.ts"

const validInput = {
  commandOwner: { ownerType: "sub_agent" as const, ownerId: "agent:parent" },
  sourceOwner: { ownerType: "sub_agent" as const, ownerId: "agent:parent" },
  recipientOwner: { ownerType: "sub_agent" as const, ownerId: "agent:child" },
  targetAgentId: "agent:child",
  handoffId: "handoff:command:child",
  executionSnapshotFingerprint: `sha256:${"a".repeat(64)}`,
}

describe("memory exchange owner binding", () => {
  it("accepts an exact nested parent-to-direct-child binding", () => {
    expect(evaluateMemoryExchangeOwnerBinding(validInput)).toEqual({
      allowed: true,
      reasonCode: "memory_exchange_owner_binding_valid",
      provenanceRefs: [
        "work-handoff:handoff:command:child",
        `execution-snapshot:sha256:${"a".repeat(64)}`,
      ],
    })
  })

  it("rejects implicit root substitution for a nested parent", () => {
    expect(evaluateMemoryExchangeOwnerBinding({
      ...validInput,
      sourceOwner: { ownerType: "knowbee", ownerId: "agent:knowbee" },
    })).toEqual({
      allowed: false,
      reasonCode: "memory_exchange_source_owner_mismatch",
      provenanceRefs: [],
    })
  })

  it("rejects another recipient and missing canonical provenance", () => {
    expect(evaluateMemoryExchangeOwnerBinding({
      ...validInput,
      recipientOwner: { ownerType: "sub_agent", ownerId: "agent:other" },
    }).reasonCode).toBe("memory_exchange_recipient_owner_mismatch")
    expect(evaluateMemoryExchangeOwnerBinding({
      ...validInput,
      executionSnapshotFingerprint: "missing",
    }).reasonCode).toBe("memory_exchange_provenance_invalid")
  })
})
