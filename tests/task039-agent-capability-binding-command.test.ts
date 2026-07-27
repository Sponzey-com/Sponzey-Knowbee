import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  type AgentCapabilityBindingCommandPorts,
  type AgentCapabilityBindingReceipt,
  executeAgentCapabilityBindingCommand,
} from "../packages/core/src/agents/agent-capability-binding-command.js"

const now = 1_800_000_000_000
const command = {
  kind: "skill" as const,
  agentRef: `agent_v1_${"a".repeat(24)}`,
  capabilityRef: `skill_v1_${"b".repeat(24)}`,
  bound: true,
  envelope: {
    actorRef: "webui",
    scope: "capability:write",
    mutationId: "mutation-1",
    targetRevision: 4,
    purpose: "skill_bind",
    issuedAt: now,
    nonce: "nonce-1",
  },
}

function ports(
  overrides: Partial<AgentCapabilityBindingCommandPorts> = {},
): AgentCapabilityBindingCommandPorts {
  let saved: {
    mutationId: string
    requestFingerprint: string
    receipt: AgentCapabilityBindingReceipt
  } | null = null
  return {
    now: () => now,
    currentRevision: () => 3,
    receiptByNonce: () => saved,
    reserveReceipt: () => true,
    finishReceipt: (input) => {
      saved = {
        mutationId: input.mutationId,
        requestFingerprint: JSON.stringify([
          command.kind,
          command.agentRef,
          command.capabilityRef,
          command.bound,
          command.envelope.targetRevision,
        ]),
        receipt: input.receipt,
      }
    },
    resolveCapability: () => ({ internalCapabilityId: "skill:private", active: true }),
    resolveAgent: () => ({ internalAgentId: "agent:private", active: true }),
    bindingEnabled: () => false,
    persist: () => ({ ok: true, revision: 4 }),
    verify: () => ({ ok: true }),
    rollback: () => ({ ok: true }),
    ...overrides,
  }
}

describe("Task 039 agent capability binding command", () => {
  it.each([
    ["skill", "skill_bind", `skill_v1_${"b".repeat(24)}`],
    ["mcp_server", "mcp_bind", `mcp_v1_${"b".repeat(24)}`],
    ["yeonjang", "yeonjang_bind", `yeonjang_v1_${"b".repeat(24)}`],
  ] as const)("uses the shared state machine for %s", async (kind, purpose, capabilityRef) => {
    const persist = vi.fn(() => ({ ok: true, revision: 4 }))
    const result = await executeAgentCapabilityBindingCommand(
      { ...command, kind, capabilityRef, envelope: { ...command.envelope, purpose } },
      ports({ persist }),
    )
    expect(result).toMatchObject({ kind, state: "active", bound: true, revision: 4 })
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ kind, enabled: true, expectedRevision: 3, targetRevision: 4 }),
    )
  })

  it("fails closed for stale revision, inactive catalog and inactive agent", async () => {
    expect(
      (
        await executeAgentCapabilityBindingCommand(
          { ...command, envelope: { ...command.envelope, targetRevision: 9 } },
          ports(),
        )
      ).reasonCode,
    ).toBe("mutation_revision_conflict")
    expect(
      (
        await executeAgentCapabilityBindingCommand(
          command,
          ports({ resolveCapability: () => ({ internalCapabilityId: "private", active: false }) }),
        )
      ).reasonCode,
    ).toBe("capability_binding_inactive")
    expect(
      (
        await executeAgentCapabilityBindingCommand(
          command,
          ports({ resolveAgent: () => ({ internalAgentId: "private", active: false }) }),
        )
      ).reasonCode,
    ).toBe("agent_binding_inactive")
  })

  it("returns an exact replay and rejects a nonce reused for another target", async () => {
    let stored: {
      mutationId: string
      requestFingerprint: string
      receipt: AgentCapabilityBindingReceipt
    } | null = null
    const store = ports({
      receiptByNonce: () => stored,
      finishReceipt: (input) => {
        stored = {
          mutationId: input.mutationId,
          requestFingerprint: JSON.stringify([
            command.kind,
            command.agentRef,
            command.capabilityRef,
            command.bound,
            command.envelope.targetRevision,
          ]),
          receipt: input.receipt,
        }
      },
    })
    const first = await executeAgentCapabilityBindingCommand(command, store)
    expect(await executeAgentCapabilityBindingCommand(command, store)).toEqual(first)
    const collision = await executeAgentCapabilityBindingCommand(
      { ...command, capabilityRef: `skill_v1_${"c".repeat(24)}` },
      store,
    )
    expect(collision).toMatchObject({ state: "conflict", reasonCode: "mutation_nonce_conflict" })
  })

  it("rolls back verification failure without exposing internal ids", async () => {
    const rollback = vi.fn(() => ({ ok: true }))
    const result = await executeAgentCapabilityBindingCommand(
      command,
      ports({ verify: () => ({ ok: false, reasonCode: "binding_verify_failed" }), rollback }),
    )
    expect(result).toMatchObject({
      state: "rolled_back",
      reasonCode: "binding_verify_failed",
      bound: false,
    })
    expect(rollback).toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toMatch(/agent:private|skill:private/iu)
  })

  it("has no infrastructure, UI, or environment dependency", () => {
    const source = readFileSync(
      "packages/core/src/agents/agent-capability-binding-command.ts",
      "utf8",
    )
    expect(source).not.toMatch(/node:|process\.env|Fastify|React|db\//iu)
  })
})
