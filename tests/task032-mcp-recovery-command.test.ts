import { describe, expect, it } from "vitest"
import {
  type McpRecoveryCommandPorts,
  executeMcpRecoveryCommand,
} from "../packages/core/src/capabilities/mcp-recovery-command.js"

const envelope = (overrides = {}) => ({
  actorRef: "api:owner",
  scope: "capability:write",
  mutationId: "m1",
  targetRevision: 8,
  purpose: "mcp_recover",
  issuedAt: 100,
  nonce: "n1",
  ...overrides,
})
function ports(overrides: Partial<McpRecoveryCommandPorts> = {}): McpRecoveryCommandPorts {
  return {
    now: () => 100,
    currentRevision: () => 7,
    nonceUsed: () => false,
    reserveReceipt: () => true,
    updateReceipt: () => {},
    resolveMcp: () => ({ internalMcpId: "mcp:penpot", mcpRef: "mcp-public", revision: 7 }),
    inspect: async () => ({ ok: true }),
    persistRevision: async () => ({ ok: true, revision: 8 }),
    applyTarget: async () => ({ ok: true }),
    verifyTarget: async () => ({ ok: true, toolCount: 2 }),
    rollbackTarget: async () => ({ ok: true }),
    ...overrides,
  }
}

describe("task032 MCP recovery command", () => {
  it("runs inspect, revision persist, targeted apply and health verification", async () => {
    const order: string[] = []
    const result = await executeMcpRecoveryCommand(
      { envelope: envelope(), mcpRef: "mcp-public" },
      ports({
        inspect: async () => {
          order.push("inspect")
          return { ok: true }
        },
        persistRevision: async () => {
          order.push("persist")
          return { ok: true, revision: 8 }
        },
        applyTarget: async () => {
          order.push("apply")
          return { ok: true }
        },
        verifyTarget: async () => {
          order.push("verify")
          return { ok: true, toolCount: 2 }
        },
      }),
    )
    expect(result).toMatchObject({ state: "active", revision: 8, ready: true, toolCount: 2 })
    expect(order).toEqual(["inspect", "persist", "apply", "verify"])
  })

  it("rejects invalid purpose, stale revision and replay before inspection", async () => {
    let inspected = false
    const guarded = ports({
      inspect: async () => {
        inspected = true
        return { ok: true }
      },
    })
    await expect(
      executeMcpRecoveryCommand(
        { envelope: envelope({ purpose: "mcp_update" }), mcpRef: "mcp-public" },
        guarded,
      ),
    ).resolves.toMatchObject({ state: "rejected", reasonCode: "mutation_purpose_denied" })
    await expect(
      executeMcpRecoveryCommand(
        { envelope: envelope({ targetRevision: 9 }), mcpRef: "mcp-public" },
        guarded,
      ),
    ).resolves.toMatchObject({ state: "rejected", reasonCode: "mutation_revision_conflict" })
    await expect(
      executeMcpRecoveryCommand(
        { envelope: envelope(), mcpRef: "mcp-public" },
        ports({ nonceUsed: () => true }),
      ),
    ).resolves.toMatchObject({ state: "rejected", reasonCode: "mutation_nonce_replayed" })
    expect(inspected).toBe(false)
  })

  it("stops before persistence when inspection fails", async () => {
    let persisted = false
    const result = await executeMcpRecoveryCommand(
      { envelope: envelope(), mcpRef: "mcp-public" },
      ports({
        inspect: async () => ({ ok: false, reasonCode: "mcp_connection_probe_failed" }),
        persistRevision: async () => {
          persisted = true
          return { ok: true, revision: 8 }
        },
      }),
    )
    expect(result).toMatchObject({
      state: "failed",
      reasonCode: "mcp_connection_probe_failed",
      revision: 7,
    })
    expect(persisted).toBe(false)
  })

  it("rolls back only the target snapshot after apply or verification failure", async () => {
    let rolledBack: unknown
    const result = await executeMcpRecoveryCommand(
      { envelope: envelope(), mcpRef: "mcp-public" },
      ports({
        verifyTarget: async () => ({
          ok: false,
          reasonCode: "mcp_recovery_not_ready",
          toolCount: 0,
        }),
        rollbackTarget: async (input) => {
          rolledBack = input
          return { ok: true }
        },
      }),
    )
    expect(result).toMatchObject({
      state: "rolled_back",
      reasonCode: "mcp_recovery_not_ready",
      revision: 7,
      ready: false,
    })
    expect(rolledBack).toMatchObject({ internalMcpId: "mcp:penpot", baseRevision: 7 })
  })

  it("cancels before persistence when inspection aborts", async () => {
    const controller = new AbortController()
    let persisted = false
    const result = await executeMcpRecoveryCommand(
      { envelope: envelope(), mcpRef: "mcp-public" },
      ports({
        inspect: async () => { controller.abort(); return { ok: true } },
        persistRevision: async () => { persisted = true; return { ok: true, revision: 8 } },
      }),
      controller.signal,
    )
    expect(result).toMatchObject({ state: "cancelled", revision: 7, ready: false })
    expect(persisted).toBe(false)
  })
})
