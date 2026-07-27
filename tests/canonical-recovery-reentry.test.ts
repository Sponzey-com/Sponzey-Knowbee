import { describe, expect, it, vi } from "vitest"
import {
  buildCanonicalRecoveryReentryDescriptor,
  recordCanonicalRecoveryReentry,
} from "../packages/core/src/runs/canonical-recovery-reentry.ts"

function build() {
  return buildCanonicalRecoveryReentryDescriptor({
    runId: "run:recovery",
    previousResult: "sensitive raw previous result",
    strategy: {
      message: "sensitive changed strategy",
      model: "gpt-5-mini",
      providerId: "provider:openai",
      targetId: "provider:openai",
      targetLabel: "Sensitive provider label",
    },
    allowedTargetIds: new Set(["agent:knowbee", "provider:openai"]),
    allowedProviderIds: new Set(["provider:openai"]),
    cancellationTokenId: "root-run:run:recovery",
    signalAborted: false,
  })
}

describe("canonical recovery reentry", () => {
  it("stores fingerprints and references without raw result or strategy text", () => {
    const result = build()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const serialized = JSON.stringify(result.descriptor)
    expect(serialized).not.toContain("sensitive raw previous result")
    expect(serialized).not.toContain("sensitive changed strategy")
    expect(serialized).not.toContain("Sensitive provider label")
    expect(result.descriptor.receipts.map((receipt) => receipt.kind)).toEqual([
      "recovery",
      "policy",
      "execution",
    ])
  })

  it("rejects targets absent from the immutable startup snapshot", () => {
    const result = buildCanonicalRecoveryReentryDescriptor({
      runId: "run:recovery",
      previousResult: "result",
      strategy: { message: "retry", targetId: "agent:unknown" },
      allowedTargetIds: new Set(["agent:knowbee"]),
      cancellationTokenId: "root-run:run:recovery",
      signalAborted: false,
    })
    expect(result).toEqual({ ok: false, reasonCode: "recovery_target_not_in_startup_snapshot" })
  })

  it("accepts a changed route within a provider captured at startup", () => {
    const result = buildCanonicalRecoveryReentryDescriptor({
      runId: "run:recovery",
      previousResult: "result",
      strategy: {
        message: "retry with another route",
        providerId: "provider:openai",
        targetId: "provider:openai-mini",
      },
      allowedTargetIds: new Set(["agent:knowbee", "provider:openai"]),
      allowedProviderIds: new Set(["provider:openai"]),
      cancellationTokenId: "root-run:run:recovery",
      signalAborted: false,
    })
    expect(result.ok).toBe(true)
  })

  it("applies recovery, policy, and execution in order and replays idempotently", () => {
    const built = build()
    if (!built.ok) throw new Error(built.reasonCode)
    const stored = new Map<
      string,
      {
        workId: string
        kind: string
        evidenceFingerprint: string
        evidenceRefs: string[]
        consumedRevision?: number
      }
    >()
    const events: string[] = []
    const dependencies = {
      issueReceipt: vi.fn((receipt: (typeof built.descriptor.receipts)[number]) => {
        if (stored.has(receipt.receiptId))
          return { issued: false as const, reasonCode: "receipt_already_exists" }
        stored.set(receipt.receiptId, { ...receipt })
        return { issued: true as const }
      }),
      loadReceipt: vi.fn((receiptId: string) => stored.get(receiptId)),
      applyTransition: vi.fn(
        (input: { receiptRef: string; event: string; expectedRevision: number }) => {
          events.push(`${input.expectedRevision}:${input.event}`)
          const receipt = stored.get(input.receiptRef)
          if (receipt) receipt.consumedRevision = input.expectedRevision + 1
          return { status: "applied" }
        },
      ),
    }

    expect(recordCanonicalRecoveryReentry(built.descriptor, 4, dependencies)).toEqual({ ok: true })
    expect(events).toEqual(["4:RECOVERY_ACCEPTED", "5:POLICY_ALLOWED", "6:EXECUTION_STARTED"])
    expect(recordCanonicalRecoveryReentry(built.descriptor, 4, dependencies)).toEqual({ ok: true })
    expect(events).toHaveLength(3)
  })
})
