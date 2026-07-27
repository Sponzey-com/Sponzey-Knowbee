import { describe, expect, it } from "vitest"
import {
  type McpBindingCommandPorts,
  executeMcpBindingCommand,
} from "../packages/core/src/capabilities/mcp-binding-command.js"

const envelope = (purpose: string, overrides = {}) => ({
  actorRef: "api:owner",
  scope: "capability:write",
  mutationId: "m1",
  targetRevision: 8,
  purpose,
  issuedAt: 100,
  nonce: "n1",
  ...overrides,
})
function ports(overrides: Partial<McpBindingCommandPorts> = {}): McpBindingCommandPorts {
  return {
    now: () => 100,
    currentRevision: () => 7,
    nonceUsed: () => false,
    reserveReceipt: () => true,
    updateReceipt: () => {},
    resolveMcp: () => ({ internalMcpId: "mcp:penpot", active: true }),
    resolveAgent: () => ({ internalAgentId: "agent-1", name: "Researcher" }),
    bindingEnabled: () => false,
    persist: () => ({ ok: true, revision: 8 }),
    verify: () => ({ ok: true }),
    rollback: () => ({ ok: true }),
    ...overrides,
  }
}

describe("task031 MCP binding command", () => {
  it("binds and verifies only the resolved MCP and agent", async () => {
    let persisted: unknown
    const receipt = await executeMcpBindingCommand(
      {
        envelope: envelope("mcp_bind"),
        mcpRef: "mcp-public",
        agentRef: "agent-public",
        action: "bind",
      },
      ports({
        persist: (input) => {
          persisted = input
          return { ok: true, revision: 8 }
        },
      }),
    )
    expect(receipt).toMatchObject({
      state: "active",
      revision: 8,
      mcpRef: "mcp-public",
      agentRef: "agent-public",
      bound: true,
    })
    expect(persisted).toEqual({
      internalMcpId: "mcp:penpot",
      internalAgentId: "agent-1",
      enabled: true,
      expectedRevision: 7,
      targetRevision: 8,
    })
  })

  it("is idempotent without persistence when the requested state already exists", async () => {
    let persisted = false
    const receipt = await executeMcpBindingCommand(
      {
        envelope: envelope("mcp_bind"),
        mcpRef: "mcp-public",
        agentRef: "agent-public",
        action: "bind",
      },
      ports({
        bindingEnabled: () => true,
        persist: () => {
          persisted = true
          return { ok: true, revision: 8 }
        },
      }),
    )
    expect(receipt).toMatchObject({ state: "active", revision: 7, bound: true })
    expect(persisted).toBe(false)
  })

  it("rejects purpose, stale revision, replay, missing targets and inactive bind", async () => {
    await expect(
      executeMcpBindingCommand(
        { envelope: envelope("skill_bind"), mcpRef: "m", agentRef: "a", action: "bind" },
        ports(),
      ),
    ).resolves.toMatchObject({ state: "rejected", reasonCode: "mutation_purpose_denied" })
    await expect(
      executeMcpBindingCommand(
        {
          envelope: envelope("mcp_bind", { targetRevision: 9 }),
          mcpRef: "m",
          agentRef: "a",
          action: "bind",
        },
        ports(),
      ),
    ).resolves.toMatchObject({ reasonCode: "mutation_revision_conflict" })
    await expect(
      executeMcpBindingCommand(
        { envelope: envelope("mcp_bind"), mcpRef: "m", agentRef: "a", action: "bind" },
        ports({ nonceUsed: () => true }),
      ),
    ).resolves.toMatchObject({ reasonCode: "mutation_nonce_replayed" })
    await expect(
      executeMcpBindingCommand(
        { envelope: envelope("mcp_bind"), mcpRef: "m", agentRef: "a", action: "bind" },
        ports({ resolveMcp: () => null }),
      ),
    ).resolves.toMatchObject({ reasonCode: "mcp_ref_not_found" })
    await expect(
      executeMcpBindingCommand(
        { envelope: envelope("mcp_bind"), mcpRef: "m", agentRef: "a", action: "bind" },
        ports({ resolveMcp: () => ({ internalMcpId: "m", active: false }) }),
      ),
    ).resolves.toMatchObject({ reasonCode: "mcp_binding_inactive" })
    await expect(
      executeMcpBindingCommand(
        { envelope: envelope("mcp_unbind"), mcpRef: "m", agentRef: "a", action: "unbind" },
        ports({ resolveAgent: () => null }),
      ),
    ).resolves.toMatchObject({ reasonCode: "agent_ref_not_found" })
  })

  it("rolls back to the previous binding when verification fails", async () => {
    let rollback: unknown
    const receipt = await executeMcpBindingCommand(
      { envelope: envelope("mcp_unbind"), mcpRef: "m", agentRef: "a", action: "unbind" },
      ports({
        bindingEnabled: () => true,
        verify: () => ({ ok: false, reasonCode: "mcp_binding_verify_failed" }),
        rollback: (input) => {
          rollback = input
          return { ok: true }
        },
      }),
    )
    expect(receipt).toMatchObject({
      state: "rolled_back",
      reasonCode: "mcp_binding_verify_failed",
      revision: 7,
      bound: true,
    })
    expect(rollback).toMatchObject({
      internalMcpId: "mcp:penpot",
      internalAgentId: "agent-1",
      enabled: true,
      baseRevision: 7,
    })
  })
})
