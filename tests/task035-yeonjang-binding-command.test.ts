import { describe, expect, it, vi } from "vitest"
import type { MutationEnvelope } from "../packages/core/src/capabilities/capability-security-boundary.js"
import {
  type YeonjangBindingCommandPorts,
  executeYeonjangBindingCommand,
} from "../packages/core/src/capabilities/yeonjang-binding-command.js"

function envelope(): MutationEnvelope {
  return {
    actorRef: "user:owner",
    scope: "capability:write",
    mutationId: "mutation:binding",
    targetRevision: 4,
    purpose: "yeonjang_bind",
    issuedAt: 2_000,
    nonce: "nonce:binding",
  }
}

function ports(overrides: Partial<YeonjangBindingCommandPorts> = {}): YeonjangBindingCommandPorts {
  return {
    now: () => 2_000,
    currentRevision: () => 3,
    nonceUsed: () => false,
    reserveReceipt: () => true,
    updateReceipt: vi.fn(),
    resolveYeonjang: () => ({
      internalInstanceId: "instance:private",
      runnable: true,
      scopeAllowed: true,
    }),
    resolveAgent: () => ({ internalAgentId: "agent:private", scopeAllowed: true }),
    bindingEnabled: () => false,
    persist: () => ({ ok: true, revision: 4 }),
    verify: () => ({ ok: true }),
    rollback: () => ({ ok: true }),
    ...overrides,
  }
}

describe("task035 Yeonjang binding command", () => {
  it("persists and verifies a public-ref binding without exposing internal IDs", async () => {
    const persist = vi.fn(() => ({ ok: true, revision: 4 }))
    const receipt = await executeYeonjangBindingCommand(
      {
        envelope: envelope(),
        yeonjangRef: `yeonjang_v1_${"a".repeat(24)}`,
        agentRef: `agent_v1_${"b".repeat(24)}`,
        action: "bind",
      },
      ports({ persist }),
    )
    expect(receipt).toMatchObject({ state: "active", bound: true, revision: 4 })
    expect(persist).toHaveBeenCalledWith({
      internalInstanceId: "instance:private",
      internalAgentId: "agent:private",
      enabled: true,
      expectedRevision: 3,
      targetRevision: 4,
    })
    expect(JSON.stringify(receipt)).not.toMatch(/instance:private|agent:private/u)
  })

  it("fails closed for unavailable Yeonjang and cross-scope actors", async () => {
    const unavailable = await executeYeonjangBindingCommand(
      {
        envelope: envelope(),
        yeonjangRef: `yeonjang_v1_${"c".repeat(24)}`,
        agentRef: `agent_v1_${"d".repeat(24)}`,
        action: "bind",
      },
      ports({
        resolveYeonjang: () => ({
          internalInstanceId: "private",
          runnable: false,
          scopeAllowed: true,
        }),
      }),
    )
    expect(unavailable.reasonCode).toBe("yeonjang_binding_unavailable")
    const denied = await executeYeonjangBindingCommand(
      {
        envelope: envelope(),
        yeonjangRef: `yeonjang_v1_${"c".repeat(24)}`,
        agentRef: `agent_v1_${"d".repeat(24)}`,
        action: "bind",
      },
      ports({
        resolveAgent: () => ({ internalAgentId: "private", scopeAllowed: false }),
      }),
    )
    expect(denied.reasonCode).toBe("mutation_scope_denied")
    const missingAgent = await executeYeonjangBindingCommand(
      {
        envelope: envelope(),
        yeonjangRef: `yeonjang_v1_${"c".repeat(24)}`,
        agentRef: `agent_v1_${"d".repeat(24)}`,
        action: "bind",
      },
      ports({ resolveAgent: () => null }),
    )
    expect(missingAgent.reasonCode).toBe("agent_ref_not_found")
  })

  it("rejects stale revision and replayed nonce", async () => {
    const stale = await executeYeonjangBindingCommand(
      {
        envelope: { ...envelope(), targetRevision: 9 },
        yeonjangRef: `yeonjang_v1_${"e".repeat(24)}`,
        agentRef: `agent_v1_${"f".repeat(24)}`,
        action: "bind",
      },
      ports(),
    )
    expect(stale.reasonCode).toBe("mutation_revision_conflict")
    const replayed = await executeYeonjangBindingCommand(
      {
        envelope: envelope(),
        yeonjangRef: `yeonjang_v1_${"e".repeat(24)}`,
        agentRef: `agent_v1_${"f".repeat(24)}`,
        action: "bind",
      },
      ports({ nonceUsed: () => true }),
    )
    expect(replayed.reasonCode).toBe("mutation_nonce_replayed")
  })

  it("closes the mutation receipt when a duplicate submit already matches persisted state", async () => {
    const updateReceipt = vi.fn()
    const receipt = await executeYeonjangBindingCommand(
      {
        envelope: envelope(),
        yeonjangRef: `yeonjang_v1_${"1".repeat(24)}`,
        agentRef: `agent_v1_${"2".repeat(24)}`,
        action: "bind",
      },
      ports({ bindingEnabled: () => true, updateReceipt }),
    )

    expect(receipt).toMatchObject({ state: "active", bound: true, revision: 3 })
    expect(updateReceipt).toHaveBeenCalledWith({
      mutationId: envelope().mutationId,
      state: "active",
      reasonCode: null,
      now: 2_000,
    })
  })
})
