import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  type SideEffectOperationReceipt,
  buildSideEffectOperationAuthorization,
  buildSideEffectOperationIdentity,
  buildSideEffectOperationReceipt,
  validateSideEffectOperationAuthorization,
} from "../packages/core/src/contracts/side-effect-operation.ts"
import { executeSideEffectOperation } from "../packages/core/src/runs/side-effect-operation-executor.ts"
import type {
  SideEffectOperationAggregate,
  SideEffectOperationRepository,
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
    if (!this.value || this.value.revision !== input.expectedRevision) {
      return {
        saved: false as const,
        reasonCode: "revision_conflict" as const,
        currentRevision: this.value?.revision ?? 0,
      }
    }
    this.value = input.aggregate
    this.receipts.set(input.receipt.receiptId, input.receipt)
    return { saved: true as const }
  }
}

describe("Task 047 side-effect authorization", () => {
  it("does not reserve or execute a state-changing effect without bound authorization", async () => {
    const repository = new MemoryRepository()
    const executeEffect = vi.fn(async () => ({
      value: "changed",
      success: true,
      resultFingerprint: `sha256:${"c".repeat(64)}` as const,
      recordedAt: 1,
    }))
    const result = await executeSideEffectOperation(
      {
        identity: buildSideEffectOperationIdentity({
          runId: "run:authorization",
          workId: "work:root:run:authorization",
          stepKey: "executing",
          adapterId: "tool:file_write",
          targetFingerprint: `sha256:${"a".repeat(64)}`,
          paramsFingerprint: `sha256:${"b".repeat(64)}`,
        }),
        compensationSupport: "irreversible",
        executeEffect,
        observePostState: async () => ({
          available: true,
          targetFingerprint: `sha256:${"a".repeat(64)}`,
          expectedStateFingerprint: `sha256:${"d".repeat(64)}`,
          observedStateFingerprint: `sha256:${"d".repeat(64)}`,
          capturedAt: 2,
        }),
      },
      {
        repository,
        createReceipt: ({ identity, event, operationRevision }) =>
          buildSideEffectOperationReceipt({
            identity,
            event,
            operationRevision,
            evidenceFingerprint: `sha256:${"f".repeat(64)}`,
            evidenceRefs: [`test-evidence:${event}`],
            issuedAt: operationRevision,
          }),
        isCancelled: () => false,
      },
    )

    expect(result).toEqual({
      status: "blocked",
      reasonCode: "side_effect_authorization_required",
    })
    expect(executeEffect).not.toHaveBeenCalled()
    expect(repository.value).toBeUndefined()
  })

  it("binds policy authorization to operation, target, params, scope and expected effect", () => {
    const identity = buildSideEffectOperationIdentity({
      runId: "run:binding",
      workId: "work:root:run:binding",
      stepKey: "executing",
      adapterId: "tool:file_write",
      targetFingerprint: `sha256:${"a".repeat(64)}`,
      paramsFingerprint: `sha256:${"b".repeat(64)}`,
    })
    const authorization = buildSideEffectOperationAuthorization({
      identity,
      policyDecisionId: "policy:allow",
      policyReceiptRef: "receipt:policy:allow",
      effectClass: "local_write",
      scopeFingerprint: `sha256:${"c".repeat(64)}`,
      expectedEffectFingerprint: `sha256:${"d".repeat(64)}`,
    })

    expect(validateSideEffectOperationAuthorization({ identity, authorization })).toMatchObject({
      authorized: true,
    })
    expect(authorization).toMatchObject({
      operationId: identity.operationId,
      targetFingerprint: identity.targetFingerprint,
      paramsFingerprint: identity.paramsFingerprint,
      effectClass: "local_write",
    })
  })

  it("rejects replaying authorization against a changed target or params", () => {
    const original = buildSideEffectOperationIdentity({
      runId: "run:binding",
      workId: "work:root:run:binding",
      stepKey: "executing",
      adapterId: "tool:file_write",
      targetFingerprint: `sha256:${"a".repeat(64)}`,
      paramsFingerprint: `sha256:${"b".repeat(64)}`,
    })
    const authorization = buildSideEffectOperationAuthorization({
      identity: original,
      policyDecisionId: "policy:allow",
      policyReceiptRef: "receipt:policy:allow",
      effectClass: "local_write",
      scopeFingerprint: `sha256:${"c".repeat(64)}`,
      expectedEffectFingerprint: `sha256:${"d".repeat(64)}`,
    })
    const changed = buildSideEffectOperationIdentity({
      ...original,
      targetFingerprint: `sha256:${"e".repeat(64)}`,
      paramsFingerprint: `sha256:${"f".repeat(64)}`,
    })

    expect(
      validateSideEffectOperationAuthorization({
        identity: changed,
        authorization,
      }),
    ).toEqual({
      authorized: false,
      reasonCode: "side_effect_authorization_scope_mismatch",
    })
  })

  it("keeps the effect taxonomy owned by the domain contract", () => {
    const toolTypes = readFileSync("packages/core/src/tools/types.ts", "utf8")
    expect(toolTypes).toContain(
      'import type { SideEffectClass } from "../contracts/side-effect-operation.js"',
    )
    expect(toolTypes).not.toMatch(/effectClass:\s*"local_write"\s*\|\s*"external_write"/u)
  })
})
