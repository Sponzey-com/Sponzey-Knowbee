import { describe, expect, it, vi } from "vitest"
import {
  type SideEffectOperationIdentity,
  type SideEffectOperationReceipt,
  buildSideEffectOperationAuthorization,
  buildSideEffectOperationIdentity,
  buildSideEffectOperationReceipt,
} from "../packages/core/src/contracts/side-effect-operation.ts"
import { executeSideEffectOperation } from "../packages/core/src/runs/side-effect-operation-executor.ts"
import type {
  SideEffectOperationAggregate,
  SideEffectOperationRepository,
} from "../packages/core/src/runs/side-effect-operation-use-case.ts"
import {
  reserveSideEffectOperation,
  transitionReservedSideEffectOperation,
} from "../packages/core/src/runs/side-effect-operation-use-case.ts"

class MemoryRepository implements SideEffectOperationRepository {
  value?: SideEffectOperationAggregate
  receipts = new Map<string, SideEffectOperationReceipt>()
  loadByScope(scopeId: string) {
    return this.value?.identity.scopeId === scopeId ? this.value : undefined
  }
  create(value: SideEffectOperationAggregate) {
    if (this.value) return { created: false as const, reasonCode: "scope_conflict" as const }
    this.value = value
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
    if (!this.value || this.value.revision !== input.expectedRevision)
      return {
        saved: false as const,
        reasonCode: "revision_conflict" as const,
        currentRevision: this.value?.revision ?? 0,
      }
    this.value = input.aggregate
    this.receipts.set(input.receipt.receiptId, input.receipt)
    return { saved: true as const }
  }
}

const identity = buildSideEffectOperationIdentity({
  runId: "run-1",
  workId: "work:root:run-1",
  stepKey: "executing",
  adapterId: "tool:file_write",
  targetFingerprint: `sha256:${"a".repeat(64)}`,
  paramsFingerprint: `sha256:${"b".repeat(64)}`,
})

function dependencies(repository: MemoryRepository) {
  return {
    repository,
    authorization: buildSideEffectOperationAuthorization({
      identity,
      policyDecisionId: "policy:allow",
      policyReceiptRef: "receipt:policy:allow",
      effectClass: "local_write",
      scopeFingerprint: `sha256:${"e".repeat(64)}`,
      expectedEffectFingerprint: `sha256:${"d".repeat(64)}`,
    }),
    createReceipt: ({
      identity,
      event,
      operationRevision,
    }: {
      identity: SideEffectOperationIdentity
      event: SideEffectOperationReceipt["event"]
      operationRevision: number
    }) =>
      buildSideEffectOperationReceipt({
        identity,
        event,
        operationRevision,
        evidenceFingerprint: `sha256:${"f".repeat(64)}`,
        evidenceRefs: [`test-evidence:${event}`],
        issuedAt: operationRevision,
      }),
    isCancelled: () => false,
  }
}

describe("side-effect operation executor", () => {
  it("runs effect, verifies independent observation, and reaches VERIFIED", async () => {
    const repository = new MemoryRepository()
    const executeEffect = vi.fn(async () => ({
      value: "effect-value",
      success: true,
      resultFingerprint: `sha256:${"c".repeat(64)}` as const,
      recordedAt: 100,
    }))
    const result = await executeSideEffectOperation(
      {
        identity,
        compensationSupport: "irreversible",
        executeEffect,
        observePostState: async () => ({
          available: true,
          targetFingerprint: identity.targetFingerprint,
          expectedStateFingerprint: `sha256:${"d".repeat(64)}`,
          observedStateFingerprint: `sha256:${"d".repeat(64)}`,
          capturedAt: 101,
        }),
      },
      dependencies(repository),
    )
    expect(result).toMatchObject({ status: "verified", value: "effect-value" })
    expect(repository.value?.state).toBe("VERIFIED")
    expect(executeEffect).toHaveBeenCalledTimes(1)
  })

  it("does not execute an exact replay after VERIFIED", async () => {
    const repository = new MemoryRepository()
    const input = {
      identity,
      compensationSupport: "irreversible" as const,
      executeEffect: vi.fn(async () => ({
        value: "value",
        success: true,
        resultFingerprint: `sha256:${"c".repeat(64)}` as const,
        recordedAt: 100,
      })),
      observePostState: async () => ({
        available: true as const,
        targetFingerprint: identity.targetFingerprint,
        expectedStateFingerprint: `sha256:${"d".repeat(64)}` as const,
        observedStateFingerprint: `sha256:${"d".repeat(64)}` as const,
        capturedAt: 101,
      }),
    }
    await executeSideEffectOperation(input, dependencies(repository))
    input.executeEffect.mockClear()
    expect(await executeSideEffectOperation(input, dependencies(repository))).toMatchObject({
      status: "duplicate_verified",
    })
    expect(input.executeEffect).not.toHaveBeenCalled()
  })

  it("routes wrong post-state to manual intervention for irreversible effects", async () => {
    const repository = new MemoryRepository()
    const result = await executeSideEffectOperation(
      {
        identity,
        compensationSupport: "irreversible",
        executeEffect: async () => ({
          value: "value",
          success: true,
          resultFingerprint: `sha256:${"c".repeat(64)}`,
          recordedAt: 100,
        }),
        observePostState: async () => ({
          available: true,
          targetFingerprint: identity.targetFingerprint,
          expectedStateFingerprint: `sha256:${"d".repeat(64)}`,
          observedStateFingerprint: `sha256:${"e".repeat(64)}`,
          capturedAt: 101,
        }),
      },
      dependencies(repository),
    )
    expect(result).toMatchObject({
      status: "manual_intervention",
      reasonCode: "side_effect_irreversible",
    })
    expect(repository.value?.state).toBe("MANUAL_INTERVENTION")
  })

  it("compensates and verifies the compensation path when reversible", async () => {
    const repository = new MemoryRepository()
    const compensate = vi.fn(async () => ({ success: true, receiptEvidence: "compensated" }))
    const result = await executeSideEffectOperation(
      {
        identity,
        compensationSupport: "reversible",
        executeEffect: async () => ({
          value: "value",
          success: true,
          resultFingerprint: `sha256:${"c".repeat(64)}`,
          recordedAt: 100,
        }),
        observePostState: async () => ({
          available: false,
          targetFingerprint: identity.targetFingerprint,
          expectedStateFingerprint: `sha256:${"d".repeat(64)}`,
          observedStateFingerprint: `sha256:${"e".repeat(64)}`,
          capturedAt: 101,
        }),
        compensate,
        verifyCompensation: async () => ({
          verified: true,
          receiptEvidence: "compensation-verified",
        }),
      },
      dependencies(repository),
    )
    expect(result).toMatchObject({ status: "compensated" })
    expect(repository.value?.state).toBe("COMPENSATED")
    expect(compensate).toHaveBeenCalledTimes(1)
  })

  it("prevents effect execution when cancellation is already requested", async () => {
    const repository = new MemoryRepository()
    const executeEffect = vi.fn()
    const result = await executeSideEffectOperation(
      {
        identity,
        compensationSupport: "irreversible",
        executeEffect,
        observePostState: vi.fn(),
      },
      { ...dependencies(repository), isCancelled: () => true },
    )
    expect(result).toMatchObject({ status: "cancelled_before_effect" })
    expect(executeEffect).not.toHaveBeenCalled()
    expect(repository.value?.state).toBe("CANCEL_REQUESTED")
  })

  it("prevents effect execution when cancellation arrives during START_EFFECT recording", async () => {
    const repository = new MemoryRepository()
    let cancelled = false
    const executeEffect = vi.fn(async () => ({
      value: "value",
      success: true,
      resultFingerprint: `sha256:${"c".repeat(64)}` as const,
      recordedAt: 100,
    }))
    const baseDependencies = dependencies(repository)
    const result = await executeSideEffectOperation(
      {
        identity,
        compensationSupport: "irreversible",
        executeEffect,
        observePostState: async () => ({
          available: true,
          targetFingerprint: identity.targetFingerprint,
          expectedStateFingerprint: `sha256:${"d".repeat(64)}`,
          observedStateFingerprint: `sha256:${"d".repeat(64)}`,
          capturedAt: 101,
        }),
      },
      {
        ...baseDependencies,
        createReceipt: (input) => {
          if (input.event === "START_EFFECT") cancelled = true
          return baseDependencies.createReceipt(input)
        },
        isCancelled: () => cancelled,
      },
    )

    expect(result).toMatchObject({ status: "cancelled_before_effect" })
    expect(executeEffect).not.toHaveBeenCalled()
    expect(repository.value?.state).toBe("CANCEL_REQUESTED")
  })

  it("does not rerun an effect left in EFFECT_STARTED after a crash", async () => {
    const repository = new MemoryRepository()
    const reserved = reserveSideEffectOperation({ repository, identity })
    if (reserved.status === "rejected") throw new Error("reserve expected")
    transitionReservedSideEffectOperation({
      repository,
      operationId: identity.operationId,
      scopeId: identity.scopeId,
      expectedRevision: 0,
      event: "START_EFFECT",
      receipt: dependencies(repository).createReceipt({
        identity,
        event: "START_EFFECT",
        operationRevision: 1,
      }),
    })
    const executeEffect = vi.fn()
    const result = await executeSideEffectOperation(
      {
        identity,
        compensationSupport: "irreversible",
        executeEffect,
        observePostState: vi.fn(),
      },
      dependencies(repository),
    )
    expect(result).toMatchObject({
      status: "blocked",
      reasonCode: "side_effect_operation_not_resumable:EFFECT_STARTED",
    })
    expect(executeEffect).not.toHaveBeenCalled()
  })

  it.each(["EFFECT_RECORDED", "VERIFYING", "CANCEL_REQUESTED"] as const)(
    "resumes %s with observation only after restart",
    async (resumeState) => {
      const repository = new MemoryRepository()
      const reserved = reserveSideEffectOperation({ repository, identity })
      if (reserved.status === "rejected") throw new Error("reserve expected")
      const apply = (
        event: "START_EFFECT" | "RECORD_EFFECT" | "BEGIN_VERIFICATION" | "REQUEST_CANCEL",
      ) => {
        const result = transitionReservedSideEffectOperation({
          repository,
          operationId: identity.operationId,
          scopeId: identity.scopeId,
          expectedRevision: repository.value?.revision ?? 0,
          event,
          receipt: dependencies(repository).createReceipt({
            identity,
            event,
            operationRevision: (repository.value?.revision ?? 0) + 1,
          }),
        })
        if (result.status !== "applied") throw new Error(result.reasonCode)
      }
      apply("START_EFFECT")
      apply("RECORD_EFFECT")
      if (resumeState === "VERIFYING") apply("BEGIN_VERIFICATION")
      if (resumeState === "CANCEL_REQUESTED") apply("REQUEST_CANCEL")
      const executeEffect = vi.fn()
      const observePostState = vi.fn(async () => ({
        available: true,
        targetFingerprint: identity.targetFingerprint,
        expectedStateFingerprint: `sha256:${"d".repeat(64)}` as const,
        observedStateFingerprint: `sha256:${"d".repeat(64)}` as const,
        capturedAt: 101,
      }))

      const result = await executeSideEffectOperation(
        {
          identity,
          compensationSupport: "irreversible",
          executeEffect,
          observePostState,
          observeCurrentPostState: observePostState,
        },
        dependencies(repository),
      )

      expect(result).toMatchObject({ status: "resumed_verified" })
      expect(executeEffect).not.toHaveBeenCalled()
      expect(observePostState).toHaveBeenCalledTimes(1)
      expect(repository.value?.state).toBe("VERIFIED")
    },
  )

  it("records in-flight cancellation and still verifies an effect that already happened", async () => {
    const repository = new MemoryRepository()
    let cancelled = false
    const result = await executeSideEffectOperation(
      {
        identity,
        compensationSupport: "irreversible",
        executeEffect: async () => {
          cancelled = true
          return {
            value: "value",
            success: true,
            resultFingerprint: `sha256:${"c".repeat(64)}`,
            recordedAt: 100,
          }
        },
        observePostState: async () => ({
          available: true,
          targetFingerprint: identity.targetFingerprint,
          expectedStateFingerprint: `sha256:${"d".repeat(64)}`,
          observedStateFingerprint: `sha256:${"d".repeat(64)}`,
          capturedAt: 101,
        }),
      },
      { ...dependencies(repository), isCancelled: () => cancelled },
    )
    expect(result).toMatchObject({ status: "verified" })
    expect(repository.value?.transitions.map((item) => item.event)).toContain("REQUEST_CANCEL")
  })

  it("exposes compensation verification failure as manual intervention", async () => {
    const repository = new MemoryRepository()
    const result = await executeSideEffectOperation(
      {
        identity,
        compensationSupport: "reversible",
        executeEffect: async () => ({
          value: "value",
          success: true,
          resultFingerprint: `sha256:${"c".repeat(64)}`,
          recordedAt: 100,
        }),
        observePostState: async () => ({
          available: false,
          targetFingerprint: identity.targetFingerprint,
          expectedStateFingerprint: `sha256:${"d".repeat(64)}`,
          observedStateFingerprint: `sha256:${"e".repeat(64)}`,
          capturedAt: 101,
        }),
        compensate: async () => ({ success: true, receiptEvidence: "compensated" }),
        verifyCompensation: async () => ({ verified: false, receiptEvidence: "still changed" }),
      },
      dependencies(repository),
    )
    expect(result).toMatchObject({
      status: "manual_intervention",
      reasonCode: "side_effect_compensation_failed",
    })
    expect(repository.value?.state).toBe("MANUAL_INTERVENTION")
  })
})
