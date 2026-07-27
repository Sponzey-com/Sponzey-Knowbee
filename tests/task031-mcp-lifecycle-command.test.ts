import { describe, expect, it } from "vitest"
import {
  type McpLifecycleCommandPorts,
  type McpLifecycleSnapshot,
  executeMcpLifecycleCommand,
} from "../packages/core/src/capabilities/mcp-lifecycle-command.js"

const draft = {
  displayName: "Penpot",
  transport: "stdio" as const,
  command: "node",
  args: ["server.mjs"],
  cwd: "/workspace",
  required: false,
}
const snapshot: McpLifecycleSnapshot = {
  internalMcpId: "mcp:penpot",
  mcpRef: "mcp-public",
  displayName: "Penpot",
  status: "enabled",
  draft,
  revision: 7,
}
const envelope = (action: string, overrides = {}) => ({
  actorRef: "api:owner",
  scope: "capability:write",
  mutationId: "m1",
  targetRevision: 8,
  purpose: `mcp_${action}`,
  issuedAt: 100,
  nonce: "n1",
  ...overrides,
})
function ports(overrides: Partial<McpLifecycleCommandPorts> = {}): McpLifecycleCommandPorts {
  return {
    now: () => 100,
    currentRevision: () => 7,
    nonceUsed: () => false,
    reserveReceipt: () => true,
    updateReceipt: () => {},
    resolveMcp: () => snapshot,
    boundAgentNames: () => [],
    inspect: async () => ({ ok: true }),
    persist: async () => ({ ok: true, revision: 8 }),
    apply: async () => ({ ok: true }),
    verify: async () => ({ ok: true }),
    rollback: async () => ({ ok: true }),
    ...overrides,
  }
}

describe("task031 MCP lifecycle command", () => {
  it("disables and deletes through persist, apply and verify", async () => {
    const calls: string[] = []
    const receipt = await executeMcpLifecycleCommand(
      { envelope: envelope("disable"), mcpRef: "mcp-public", action: "disable" },
      ports({
        persist: async () => {
          calls.push("persist")
          return { ok: true, revision: 8 }
        },
        apply: async () => {
          calls.push("apply")
          return { ok: true }
        },
        verify: async () => {
          calls.push("verify")
          return { ok: true }
        },
      }),
    )
    expect(receipt).toMatchObject({
      state: "active",
      status: "disabled",
      deleted: false,
      revision: 8,
    })
    expect(calls).toEqual(["persist", "apply", "verify"])
    await expect(
      executeMcpLifecycleCommand(
        { envelope: envelope("delete"), mcpRef: "mcp-public", action: "delete" },
        ports(),
      ),
    ).resolves.toMatchObject({ state: "active", status: "deleted", deleted: true })
  })
  it("inspects before enabling and stops on inspection failure", async () => {
    let persisted = false
    const disabled = { ...snapshot, status: "disabled" as const }
    const result = await executeMcpLifecycleCommand(
      { envelope: envelope("enable"), mcpRef: "mcp-public", action: "enable" },
      ports({
        resolveMcp: () => disabled,
        inspect: async () => ({ ok: false, reasonCode: "mcp_connection_probe_failed" }),
        persist: async () => {
          persisted = true
          return { ok: true, revision: 8 }
        },
      }),
    )
    expect(result).toMatchObject({
      state: "failed",
      reasonCode: "mcp_connection_probe_failed",
      status: "disabled",
    })
    expect(persisted).toBe(false)
  })
  it("blocks in-use delete with sorted agent names before persistence", async () => {
    let persisted = false
    const result = await executeMcpLifecycleCommand(
      { envelope: envelope("delete"), mcpRef: "mcp-public", action: "delete" },
      ports({
        boundAgentNames: () => ["Writer", "Analyst"],
        persist: async () => {
          persisted = true
          return { ok: true, revision: 8 }
        },
      }),
    )
    expect(result).toMatchObject({
      state: "rejected",
      reasonCode: "mcp_delete_in_use",
      impact: { bindingCount: 2, agentNames: ["Analyst", "Writer"] },
    })
    expect(persisted).toBe(false)
  })
  it("rolls back the original snapshot when runtime verification fails", async () => {
    let rolledBack: unknown
    const result = await executeMcpLifecycleCommand(
      { envelope: envelope("disable"), mcpRef: "mcp-public", action: "disable" },
      ports({
        verify: async () => ({ ok: false, reasonCode: "mcp_lifecycle_verify_failed" }),
        rollback: async (input) => {
          rolledBack = input
          return { ok: true }
        },
      }),
    )
    expect(result).toMatchObject({
      state: "rolled_back",
      reasonCode: "mcp_lifecycle_verify_failed",
      revision: 7,
      status: "enabled",
    })
    expect(rolledBack).toMatchObject({
      snapshot: { internalMcpId: "mcp:penpot", status: "enabled" },
      baseRevision: 7,
    })
  })
})
