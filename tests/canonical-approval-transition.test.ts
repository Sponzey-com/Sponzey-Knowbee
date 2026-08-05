import { describe, expect, it, vi } from "vitest"
import {
  buildCanonicalApprovalTransitionDescriptor,
  recordCanonicalApprovalTransition,
} from "../packages/core/src/runs/canonical-approval-transition.ts"

const binding = {
  operationId: "operation:camera:prepared",
  operationBindingHash: `sha256:${"a".repeat(64)}` as const,
  continuationSchemaVersion: 1,
}

describe("canonical approval transition", () => {
  it("records an exact operation-bound approval event once", () => {
    const descriptor = buildCanonicalApprovalTransitionDescriptor({
      runId: "run:camera:1",
      approvalId: "approval:camera:1",
      event: "APPROVAL_REQUESTED",
      operationBinding: binding,
    })
    const issueReceipt = vi.fn(() => ({ issued: true as const }))
    const applyTransition = vi.fn(() => ({ status: "applied" }))

    expect(recordCanonicalApprovalTransition(descriptor, {
      issueReceipt,
      loadReceipt: () => undefined,
      applyTransition,
    })).toEqual({ ok: true })
    expect(issueReceipt).toHaveBeenCalledWith(expect.objectContaining({
      workId: "work:root:run:camera:1",
      kind: "approval",
      evidenceRefs: [
        "approval:approval:camera:1",
        "operation:operation:camera:prepared",
      ],
    }))
    expect(applyTransition).toHaveBeenCalledWith({
      runId: "run:camera:1",
      workId: "work:root:run:camera:1",
      event: "APPROVAL_REQUESTED",
      receiptRef: descriptor.receiptId,
    })
    expect(JSON.stringify(descriptor)).not.toMatch(/params|target|path|token|secret/u)
  })

  it("binds an expired or denied approval to terminal blocked evidence", () => {
    const descriptor = buildCanonicalApprovalTransitionDescriptor({
      runId: "run:camera:denied",
      approvalId: "approval:camera:denied",
      event: "APPROVAL_DENIED_OR_EXPIRED",
      operationBinding: binding,
    })
    const issueReceipt = vi.fn(() => ({ issued: true as const }))

    expect(recordCanonicalApprovalTransition(descriptor, {
      issueReceipt,
      loadReceipt: () => undefined,
      applyTransition: () => ({ status: "applied" }),
    })).toEqual({ ok: true })
    expect(issueReceipt).toHaveBeenCalledWith(expect.objectContaining({
      terminalCause: {
        schemaVersion: 1,
        originStage: "execution",
        outcomeKind: "blocked",
        reasonCode: "approval_denied_or_expired",
      },
    }))
  })

  it("rejects an existing receipt with different evidence", () => {
    const descriptor = buildCanonicalApprovalTransitionDescriptor({
      runId: "run:camera:1",
      approvalId: "approval:camera:1",
      event: "APPROVAL_CONSUMED",
      operationBinding: binding,
    })
    expect(recordCanonicalApprovalTransition(descriptor, {
      issueReceipt: () => ({
        issued: false,
        reasonCode: "receipt_already_exists",
      }),
      loadReceipt: () => ({
        workId: descriptor.workId,
        kind: "approval",
        evidenceFingerprint: `sha256:${"b".repeat(64)}`,
        evidenceRefs: [...descriptor.evidenceRefs],
      }),
      applyTransition: () => ({ status: "applied" }),
    })).toEqual({
      ok: false,
      reasonCode: "receipt_already_exists",
    })
  })
})
