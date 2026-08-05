import { describe, expect, it } from "vitest"
import { createMcpMutationRuntime, type McpConfigurationRollbackSnapshot, type McpPersistedEntry } from "../packages/core/src/capabilities/mcp-mutation-runtime.js"
import type { MutationEnvelope } from "../packages/core/src/capabilities/capability-security-boundary.js"

const draft = { displayName: "Penpot", transport: "stdio" as const, command: "node", args: ["server.mjs"], cwd: "/workspace", required: false }
const envelope = (purpose: string): MutationEnvelope => ({ actorRef: "api:owner", scope: "capability:write", mutationId: "mutation-1", targetRevision: 2, purpose, issuedAt: 10, nonce: "nonce-1" })

describe("task029 MCP mutation runtime", () => {
  it("rejects a name owned by a catalog-only identity", async () => {
    let persisted = false
    const runtime = createMcpMutationRuntime({
      store: { currentRevision: () => 1, listEntries: () => [], listKnownIdentities: () => [{ internalMcpId: "mcp:stale", displayName: "Penpot" }], runtimeConfigurationSnapshot: () => ({ servers: {} }), persist: () => { persisted = true; return { ok: true, revision: 2 } }, rollback: () => ({ ok: true }) },
      runtime: { capture: () => ({ token: null }), apply: async () => ({ ok: true }), verify: async () => ({ ok: true }), rollback: async () => ({ ok: true }) },
      inspection: { inspect: async () => ({ ok: true }) }, receipts: { now: () => 10, currentRevision: () => 1, nonceUsed: () => false, reserveReceipt: () => true, updateReceipt: () => {} },
      createInternalMcpId: () => "mcp:new", publicRefForMcpId: (id) => `ref:${id}`,
    })
    await expect(runtime.executeCreate({ envelope: envelope("mcp_create"), draft })).resolves.toMatchObject({ state: "rejected", reasonCode: "mcp_name_duplicated" })
    expect(persisted).toBe(false)
  })

  it("coordinates persisted and active snapshots and verifies the target revision", async () => {
    let revision = 1; let entries: McpPersistedEntry[] = []; let activeRevision = 1
    const order: string[] = []
    const runtime = createMcpMutationRuntime({
      store: {
        currentRevision: () => revision, listEntries: () => entries, listKnownIdentities: () => entries.map((entry) => ({ internalMcpId: entry.internalMcpId, displayName: entry.draft.displayName })), runtimeConfigurationSnapshot: () => ({ entries }),
        persist: (input) => { order.push("persist"); const rollbackSnapshot: McpConfigurationRollbackSnapshot = { revision, entries, token: "before" }; revision = input.targetRevision; entries = [{ internalMcpId: input.internalMcpId, draft: input.draft }]; return { ok: true, revision, rollbackSnapshot } },
        rollback: () => ({ ok: true }),
      },
      runtime: {
        capture: () => ({ token: activeRevision }),
        apply: async (input) => { order.push("apply"); activeRevision = input.targetRevision; return { ok: true } },
        verify: async (input) => { order.push("verify"); return { ok: activeRevision === input.targetRevision } },
        rollback: async () => ({ ok: true }),
      },
      inspection: { inspect: async () => { order.push("inspect"); return { ok: true } } },
      receipts: { now: () => 10, currentRevision: () => revision, nonceUsed: () => false, reserveReceipt: () => true, updateReceipt: () => {} },
      createInternalMcpId: () => "mcp:penpot", publicRefForMcpId: () => "mcp_v1_public",
    })
    await expect(runtime.executeCreate({ envelope: envelope("mcp_create"), draft })).resolves.toMatchObject({ state: "active", revision: 2 })
    expect(order).toEqual(["inspect", "persist", "apply", "verify"])
  })

  it("restores persisted state before restoring runtime after verification failure", async () => {
    let revision = 1; const original = [{ internalMcpId: "mcp:penpot", draft }]; let entries = original
    const order: string[] = []
    const runtime = createMcpMutationRuntime({
      store: {
        currentRevision: () => revision, listEntries: () => entries, listKnownIdentities: () => entries.map((entry) => ({ internalMcpId: entry.internalMcpId, displayName: entry.draft.displayName })), runtimeConfigurationSnapshot: () => ({ entries }),
        persist: (input) => { const rollbackSnapshot = { revision, entries, token: "before" }; revision = 2; entries = [{ internalMcpId: input.internalMcpId, draft: input.draft }]; return { ok: true, revision, rollbackSnapshot } },
        rollback: (snapshot) => { order.push("store.rollback"); revision = snapshot.revision; entries = [...snapshot.entries]; return { ok: true } },
      },
      runtime: { capture: () => ({ token: "active-before" }), apply: async () => ({ ok: true }), verify: async () => ({ ok: false, reasonCode: "mcp_health_revision_mismatch" }), rollback: async () => { order.push("runtime.rollback"); return { ok: true } } },
      inspection: { inspect: async () => ({ ok: true }) },
      receipts: { now: () => 10, currentRevision: () => revision, nonceUsed: () => false, reserveReceipt: () => true, updateReceipt: () => {} },
      createInternalMcpId: () => "unused", publicRefForMcpId: () => "mcp_v1_public",
    })
    await expect(runtime.executeUpdate({ envelope: envelope("mcp_update"), mcpRef: "mcp_v1_public", draft: { ...draft, displayName: "Penpot 2" } })).resolves.toMatchObject({ state: "rolled_back", revision: 1 })
    expect(order).toEqual(["store.rollback", "runtime.rollback"])
    expect(entries).toEqual(original)
  })
})
