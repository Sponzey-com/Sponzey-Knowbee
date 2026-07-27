import { describe, expect, it } from "vitest"
import {
  type UserMethodFirstInput,
  selectFirstUserMethod,
} from "../packages/core/src/contracts/user-method-first-admission.ts"

const fingerprint = `sha256:${"a".repeat(64)}` as const

function input(overrides: Partial<UserMethodFirstInput> = {}): UserMethodFirstInput {
  return {
    requestId: "request:93",
    targetId: "pc:office",
    preferredMethodIds: ["mcp.finance", "web.search"],
    approvedMethodIds: [],
    capabilitySnapshot: {
      snapshotId: "snapshot:93",
      fingerprint,
      bindings: [
        { methodId: "mcp.finance", targetId: "pc:office", risk: "safe" },
        { methodId: "web.search", targetId: "pc:office", risk: "safe" },
        { methodId: "unrelated.tool", targetId: "pc:office", risk: "safe" },
      ],
    },
    snapshotReceipt: {
      receiptId: "receipt:snapshot:93",
      requestId: "request:93",
      snapshotId: "snapshot:93",
      snapshotFingerprint: fingerprint,
    },
    ...overrides,
  }
}

describe("Task 093 first user method admission", () => {
  it("selects the first safe available method on the exact target", () => {
    expect(selectFirstUserMethod(input())).toEqual({
      status: "selected",
      requestId: "request:93",
      methodId: "mcp.finance",
      targetId: "pc:office",
      preferenceIndex: 0,
      snapshotReceiptId: "receipt:snapshot:93",
    })
  })

  it("skips unavailable or denied preferences only for the next explicitly listed method", () => {
    const unavailable = input()
    unavailable.capabilitySnapshot.bindings = unavailable.capabilitySnapshot.bindings.filter(
      (binding) => binding.methodId !== "mcp.finance",
    )
    expect(selectFirstUserMethod(unavailable)).toMatchObject({
      status: "selected",
      methodId: "web.search",
      preferenceIndex: 1,
    })

    const denied = input()
    denied.capabilitySnapshot.bindings[0] = {
      methodId: "mcp.finance",
      targetId: "pc:office",
      risk: "denied",
    }
    expect(selectFirstUserMethod(denied)).toMatchObject({
      status: "selected",
      methodId: "web.search",
      preferenceIndex: 1,
    })
  })

  it("requests approval for the first approval-gated method without lowering priority", () => {
    const approval = input()
    approval.capabilitySnapshot.bindings[0] = {
      methodId: "mcp.finance",
      targetId: "pc:office",
      risk: "approval_required",
    }
    expect(selectFirstUserMethod(approval)).toEqual({
      status: "approval_required",
      requestId: "request:93",
      methodId: "mcp.finance",
      targetId: "pc:office",
      preferenceIndex: 0,
      snapshotReceiptId: "receipt:snapshot:93",
    })
    expect(
      selectFirstUserMethod({ ...approval, approvedMethodIds: ["mcp.finance"] }),
    ).toMatchObject({
      status: "selected",
      methodId: "mcp.finance",
      preferenceIndex: 0,
    })
  })

  it("rejects target mismatch, ambiguous bindings, and stale snapshot receipts", () => {
    expect(selectFirstUserMethod(input({ targetId: "pc:other" }))).toMatchObject({
      status: "unavailable",
      reviewedMethodIds: ["mcp.finance", "web.search"],
    })
    const ambiguous = input()
    ambiguous.capabilitySnapshot.bindings.push({
      methodId: "mcp.finance",
      targetId: "pc:office",
      risk: "approval_required",
    })
    expect(selectFirstUserMethod(ambiguous)).toMatchObject({
      status: "rejected",
      reasonCodes: ["ambiguous_method_binding"],
    })
    expect(
      selectFirstUserMethod(
        input({ snapshotReceipt: { ...input().snapshotReceipt, snapshotId: "snapshot:old" } }),
      ),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: ["capability_snapshot_receipt_mismatch"],
    })
  })
})
