import { describe, expect, it, vi } from "vitest"
import type { MutationEnvelope } from "../packages/core/src/capabilities/capability-security-boundary.js"
import {
  type YeonjangRecoveryCommandPorts,
  executeYeonjangRecoveryCommand,
} from "../packages/core/src/capabilities/yeonjang-recovery-command.js"

function envelope(purpose = "yeonjang_reconnect"): MutationEnvelope {
  return {
    actorRef: "user:owner",
    scope: "capability:write",
    mutationId: "mutation:recovery",
    targetRevision: 8,
    purpose,
    issuedAt: 1_000,
    nonce: "nonce:recovery",
  }
}

function ports(
  overrides: Partial<YeonjangRecoveryCommandPorts> = {},
): YeonjangRecoveryCommandPorts {
  return {
    now: () => 1_000,
    currentRevision: () => 7,
    nonceUsed: () => false,
    reserveReceipt: () => true,
    updateReceipt: vi.fn(),
    resolveYeonjang: () => ({
      internalInstanceId: "instance:private",
      status: "stale",
      permissionState: "ready",
      runnable: false,
    }),
    persistIntent: async () => ({ ok: true, revision: 8 }),
    applyAction: async () => ({ ok: true }),
    inspectResult: async () => ({
      internalInstanceId: "instance:private",
      status: "ready",
      permissionState: "ready",
      runnable: true,
    }),
    rollbackIntent: async () => ({ ok: true }),
    ...overrides,
  }
}

describe("task035 Yeonjang recovery command", () => {
  it("becomes active only after the projected runtime is ready and runnable", async () => {
    const applyAction = vi.fn(async () => ({ ok: true }))
    const inspectResult = vi.fn(async () => ({
      internalInstanceId: "instance:private",
      status: "ready" as const,
      permissionState: "ready" as const,
      runnable: true,
    }))
    const receipt = await executeYeonjangRecoveryCommand(
      { envelope: envelope(), yeonjangRef: `yeonjang_v1_${"a".repeat(24)}`, action: "reconnect" },
      ports({ applyAction, inspectResult }),
    )
    expect(receipt).toMatchObject({ state: "active", ready: true, revision: 8 })
    expect(applyAction).toHaveBeenCalledWith(
      { internalInstanceId: "instance:private", action: "reconnect" },
      expect.any(AbortSignal),
    )
    expect(inspectResult).toHaveBeenCalled()
    expect(JSON.stringify(receipt)).not.toContain("instance:private")
  })

  it("rolls back when transport succeeds but projected state remains stale", async () => {
    const rollbackIntent = vi.fn(async () => ({ ok: true }))
    const receipt = await executeYeonjangRecoveryCommand(
      { envelope: envelope(), yeonjangRef: `yeonjang_v1_${"b".repeat(24)}`, action: "reconnect" },
      ports({
        inspectResult: async () => ({
          internalInstanceId: "instance:private",
          status: "stale",
          permissionState: "ready",
          runnable: false,
        }),
        rollbackIntent,
      }),
    )
    expect(receipt).toMatchObject({
      state: "rolled_back",
      reasonCode: "yeonjang_recovery_verification_failed",
      ready: false,
      revision: 7,
    })
    expect(rollbackIntent).toHaveBeenCalled()
  })

  it("re-observes within an explicit bounded policy before declaring verification failure", async () => {
    let attempts = 0
    const wait = vi.fn(async () => undefined)
    const receipt = await executeYeonjangRecoveryCommand(
      { envelope: envelope(), yeonjangRef: `yeonjang_v1_${"d".repeat(24)}`, action: "reconnect" },
      ports({
        inspectResult: async () => {
          attempts += 1
          return {
            internalInstanceId: "instance:private",
            status: attempts < 3 ? "stale" : "ready",
            permissionState: "ready",
            runnable: attempts >= 3,
          }
        },
      }),
      new AbortController().signal,
      { maxAttempts: 3, intervalMs: 125, wait },
    )

    expect(receipt).toMatchObject({ state: "active", ready: true })
    expect(attempts).toBe(3)
    expect(wait).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledWith(125, expect.any(AbortSignal))
  })

  it("rejects action mismatch and nonce replay before applying", async () => {
    const denied = await executeYeonjangRecoveryCommand(
      {
        envelope: envelope(),
        yeonjangRef: `yeonjang_v1_${"c".repeat(24)}`,
        action: "check_permissions",
      },
      ports(),
    )
    expect(denied.reasonCode).toBe("mutation_purpose_denied")
    const replayed = await executeYeonjangRecoveryCommand(
      { envelope: envelope(), yeonjangRef: `yeonjang_v1_${"c".repeat(24)}`, action: "reconnect" },
      ports({ nonceUsed: () => true }),
    )
    expect(replayed.reasonCode).toBe("mutation_nonce_replayed")
  })

  it("cancels before persistence when the request signal is already aborted", async () => {
    const persistIntent = vi.fn(async () => ({ ok: true, revision: 8 }))
    const controller = new AbortController()
    controller.abort()
    const receipt = await executeYeonjangRecoveryCommand(
      { envelope: envelope(), yeonjangRef: `yeonjang_v1_${"e".repeat(24)}`, action: "reconnect" },
      ports({ persistIntent }),
      controller.signal,
    )

    expect(receipt).toMatchObject({ state: "cancelled", ready: false, revision: 7 })
    expect(persistIntent).not.toHaveBeenCalled()
  })
})
