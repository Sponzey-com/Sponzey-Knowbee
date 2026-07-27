import { describe, expect, it } from "vitest"
import {
  type SideEffectOperationReceipt,
  buildSideEffectOperationIdentity,
  buildSideEffectOperationReceipt,
} from "../packages/core/src/contracts/side-effect-operation.ts"
import {
  type SideEffectOperationAggregate,
  type SideEffectOperationRepository,
  reserveSideEffectOperation,
  transitionReservedSideEffectOperation,
} from "../packages/core/src/runs/side-effect-operation-use-case.ts"

function identity(params = `sha256:${"b".repeat(64)}` as const) {
  return buildSideEffectOperationIdentity({
    runId: "run-1",
    workId: "work:root:run-1",
    stepKey: "executing",
    adapterId: "tool:file_write",
    targetFingerprint: `sha256:${"a".repeat(64)}`,
    paramsFingerprint: params,
  })
}

class MemoryRepository implements SideEffectOperationRepository {
  byScope = new Map<string, SideEffectOperationAggregate>()
  receipts = new Map<string, SideEffectOperationReceipt>()
  loadByScope(scopeId: string) {
    return this.byScope.get(scopeId)
  }
  create(aggregate: SideEffectOperationAggregate) {
    if (this.byScope.has(aggregate.identity.scopeId))
      return { created: false as const, reasonCode: "scope_conflict" as const }
    this.byScope.set(aggregate.identity.scopeId, aggregate)
    return { created: true as const }
  }
  loadReceipt(receiptId: string) {
    return this.receipts.get(receiptId)
  }
  saveTransition(input: {
    aggregate: SideEffectOperationAggregate
    expectedRevision: number
    receipt: SideEffectOperationReceipt
  }) {
    const current = this.byScope.get(input.aggregate.identity.scopeId)
    if (!current || current.revision !== input.expectedRevision) {
      return {
        saved: false as const,
        reasonCode: "revision_conflict" as const,
        currentRevision: current?.revision ?? 0,
      }
    }
    this.byScope.set(input.aggregate.identity.scopeId, input.aggregate)
    this.receipts.set(input.receipt.receiptId, input.receipt)
    return { saved: true as const }
  }
}

describe("side-effect operation use case", () => {
  const receipt = (event: SideEffectOperationReceipt["event"], revision: number, hashChar = "f") =>
    buildSideEffectOperationReceipt({
      identity: identity(),
      event,
      operationRevision: revision,
      evidenceFingerprint: `sha256:${hashChar.repeat(64)}`,
      evidenceRefs: [`test-evidence:${event}`],
      issuedAt: revision,
    })
  it("reserves once and returns the exact aggregate on replay", () => {
    const repository = new MemoryRepository()
    const first = reserveSideEffectOperation({ repository, identity: identity() })
    const replay = reserveSideEffectOperation({ repository, identity: identity() })
    expect(first).toMatchObject({
      status: "reserved",
      aggregate: { state: "RESERVED", revision: 0 },
    })
    expect(replay).toMatchObject({
      status: "existing",
      aggregate: { state: "RESERVED", revision: 0 },
    })
  })

  it("rejects changed params in the same operation scope", () => {
    const repository = new MemoryRepository()
    reserveSideEffectOperation({ repository, identity: identity() })
    expect(
      reserveSideEffectOperation({
        repository,
        identity: identity(`sha256:${"c".repeat(64)}`),
      }),
    ).toEqual({ status: "rejected", reasonCode: "operation_scope_params_conflict" })
  })

  it("rejects a stale transition writer", () => {
    const repository = new MemoryRepository()
    const reserved = reserveSideEffectOperation({ repository, identity: identity() })
    if (reserved.status === "rejected") throw new Error("reserve expected")
    expect(
      transitionReservedSideEffectOperation({
        repository,
        operationId: reserved.aggregate.identity.operationId,
        scopeId: reserved.aggregate.identity.scopeId,
        expectedRevision: 0,
        event: "START_EFFECT",
        receipt: receipt("START_EFFECT", 1, "e"),
      }),
    ).toMatchObject({ status: "applied", aggregate: { state: "EFFECT_STARTED", revision: 1 } })
    expect(
      transitionReservedSideEffectOperation({
        repository,
        operationId: reserved.aggregate.identity.operationId,
        scopeId: reserved.aggregate.identity.scopeId,
        expectedRevision: 0,
        event: "START_EFFECT",
        receipt: receipt("START_EFFECT", 1),
      }),
    ).toMatchObject({ status: "rejected", reasonCode: "stale_revision", currentRevision: 1 })
  })

  it("accepts exact receipt replay and rejects changed evidence under the same receipt ID", () => {
    const repository = new MemoryRepository()
    const reserved = reserveSideEffectOperation({ repository, identity: identity() })
    if (reserved.status === "rejected") throw new Error("reserve expected")
    const original = receipt("START_EFFECT", 1)
    const command = {
      repository,
      operationId: reserved.aggregate.identity.operationId,
      scopeId: reserved.aggregate.identity.scopeId,
      expectedRevision: 0,
      event: "START_EFFECT" as const,
    }
    expect(transitionReservedSideEffectOperation({ ...command, receipt: original })).toMatchObject({
      status: "applied",
    })
    expect(transitionReservedSideEffectOperation({ ...command, receipt: original })).toMatchObject({
      status: "applied",
    })
    expect(
      transitionReservedSideEffectOperation({
        ...command,
        receipt: { ...original, evidenceRefs: ["changed-evidence"] },
      }),
    ).toEqual({ status: "rejected", reasonCode: "receipt_conflict" })
  })
})
