import { describe, expect, it } from "vitest"
import {
  executeMcpCreateCommand,
  executeMcpUpdateCommand,
  type McpCreateCommandPorts,
  type McpUpdateCommandPorts,
} from "../packages/core/src/capabilities/mcp-mutation-command.js"
import type { MutationEnvelope } from "../packages/core/src/capabilities/capability-security-boundary.js"

const draft = { displayName: "Penpot", transport: "stdio" as const, command: "node", args: ["server.mjs"], cwd: "/workspace", required: false }
const envelope = (purpose: "mcp_create" | "mcp_update", nonce = "nonce-1"): MutationEnvelope => ({ actorRef: "api:owner", scope: "capability:write", mutationId: `mutation-${nonce}`, targetRevision: 8, purpose, issuedAt: 100, nonce })

function receiptPorts() {
  const updates: unknown[] = []
  return {
    updates,
    now: () => 100,
    currentRevision: () => 7,
    nonceUsed: () => false,
    reserveReceipt: () => true,
    updateReceipt: (input: unknown) => { updates.push(input) },
  }
}

describe("task029 MCP mutation commands", () => {
  it("creates through inspect, persist, apply and revision health verification", async () => {
    const calls: string[] = []
    const base = receiptPorts()
    const ports: McpCreateCommandPorts = {
      ...base,
      existingNames: () => [], existingPublicRefs: () => [],
      createInternalMcpId: () => "mcp-internal-1",
      publicRefForMcpId: () => "mcp_v1_public",
      inspectConnection: async (input) => { calls.push("inspect"); return { ok: true, draft: { ...input, cwd: "/workspace/canonical" } } },
      persist: async (input) => { calls.push("persist"); expect(input.expectedRevision).toBe(7); expect(input.draft.cwd).toBe("/workspace/canonical"); return { ok: true, revision: 8 } },
      apply: async () => { calls.push("apply"); return { ok: true } },
      verify: async (input) => { calls.push("verify"); expect(input.targetRevision).toBe(8); return { ok: true } },
      rollback: async () => { calls.push("rollback"); return { ok: true } },
    }
    await expect(executeMcpCreateCommand({ envelope: envelope("mcp_create"), draft }, ports)).resolves.toEqual({ mutationId: "mutation-nonce-1", state: "active", reasonCode: null, allowedActions: [], revision: 8, mcpRef: "mcp_v1_public" })
    expect(calls).toEqual(["inspect", "persist", "apply", "verify"])
  })

  it("rejects invalid, duplicate, stale and replayed create requests before side effects", async () => {
    let sideEffects = 0
    const base = receiptPorts()
    const ports: McpCreateCommandPorts = {
      ...base,
      existingNames: () => ["Penpot"], existingPublicRefs: () => [], createInternalMcpId: () => "id", publicRefForMcpId: () => "ref",
      inspectConnection: async () => { sideEffects += 1; return { ok: true } },
      persist: async () => { sideEffects += 1; return { revision: 8 } }, apply: async () => ({ ok: true }), verify: async () => ({ ok: true }), rollback: async () => ({ ok: true }),
    }
    expect((await executeMcpCreateCommand({ envelope: envelope("mcp_create"), draft }, ports)).reasonCode).toBe("mcp_name_duplicated")
    expect((await executeMcpCreateCommand({ envelope: envelope("mcp_create"), draft: { ...draft, environment: { TOKEN: "secret" } } }, { ...ports, existingNames: () => [] })).reasonCode).toBe("mcp_draft_field_unknown")
    expect((await executeMcpCreateCommand({ envelope: { ...envelope("mcp_create"), targetRevision: 7 }, draft }, { ...ports, existingNames: () => [] })).reasonCode).toBe("mutation_revision_conflict")
    expect((await executeMcpCreateCommand({ envelope: envelope("mcp_create", "used"), draft }, { ...ports, existingNames: () => [], nonceUsed: () => true })).reasonCode).toBe("mutation_nonce_replayed")
    expect((await executeMcpCreateCommand({ envelope: envelope("mcp_create"), draft }, { ...ports, existingNames: () => [], existingPublicRefs: () => ["ref"] })).reasonCode).toBe("mcp_public_ref_collision")
    expect(sideEffects).toBe(0)
  })

  it("updates an opaque target and skips an unchanged draft without reserving a receipt", async () => {
    let reserved = 0; let persisted = 0
    const base = receiptPorts()
    const snapshot = { internalMcpId: "internal", mcpRef: "mcp_v1_target", draft, revision: 7 }
    const ports: McpUpdateCommandPorts = {
      ...base, reserveReceipt: () => { reserved += 1; return true }, resolveMcp: (ref) => ref === snapshot.mcpRef ? snapshot : null,
      existingNames: () => [{ internalMcpId: "internal", displayName: "Penpot" }], inspectConnection: async () => ({ ok: true }),
      persist: async () => { persisted += 1; return { revision: 8 } }, apply: async () => ({ ok: true }), verify: async () => ({ ok: true }), rollback: async () => ({ ok: true }),
    }
    await expect(executeMcpUpdateCommand({ envelope: envelope("mcp_update"), mcpRef: snapshot.mcpRef, draft }, ports)).resolves.toMatchObject({ state: "active", revision: 7, mcpRef: snapshot.mcpRef })
    expect(reserved).toBe(0); expect(persisted).toBe(0)
    await expect(executeMcpUpdateCommand({ envelope: envelope("mcp_update"), mcpRef: "missing", draft: { ...draft, displayName: "Changed" } }, ports)).resolves.toMatchObject({ state: "rejected", reasonCode: "mcp_ref_not_found" })
  })

  it("rolls persisted configuration back when apply or health verification fails", async () => {
    const calls: string[] = []
    const base = receiptPorts()
    const snapshot = { internalMcpId: "internal", mcpRef: "mcp_v1_target", draft, revision: 7 }
    const ports: McpUpdateCommandPorts = {
      ...base, resolveMcp: () => snapshot, existingNames: () => [], inspectConnection: async () => ({ ok: true }),
      persist: async () => { calls.push("persist"); return { revision: 8 } }, apply: async () => { calls.push("apply"); return { ok: true } },
      verify: async () => { calls.push("verify"); return { ok: false, reasonCode: "mcp_health_revision_mismatch" } },
      rollback: async (input) => { calls.push("rollback"); expect(input.snapshot).toBe(snapshot); expect(input.baseRevision).toBe(7); return { ok: true } },
    }
    await expect(executeMcpUpdateCommand({ envelope: envelope("mcp_update"), mcpRef: snapshot.mcpRef, draft: { ...draft, displayName: "Penpot 2" } }, ports)).resolves.toMatchObject({ state: "rolled_back", reasonCode: "mcp_health_revision_mismatch", revision: 7 })
    expect(calls).toEqual(["persist", "apply", "verify", "rollback"])
  })

  it("cancels before persistence when the request aborts during inspection", async () => {
    const controller = new AbortController(); let persisted = false
    const base = receiptPorts()
    const ports: McpCreateCommandPorts = {
      ...base, existingNames: () => [], existingPublicRefs: () => [], createInternalMcpId: () => "id", publicRefForMcpId: () => "ref",
      inspectConnection: async () => { controller.abort(); return { ok: true } },
      persist: async () => { persisted = true; return { revision: 8 } }, apply: async () => ({ ok: true }), verify: async () => ({ ok: true }), rollback: async () => ({ ok: true }),
    }
    await expect(executeMcpCreateCommand({ envelope: envelope("mcp_create"), draft }, ports, controller.signal)).resolves.toMatchObject({ state: "cancelled", revision: 7 })
    expect(persisted).toBe(false)
  })

  it("does not claim rollback success when apply and rollback both fail", async () => {
    const base = receiptPorts()
    const snapshot = { internalMcpId: "internal", mcpRef: "mcp_v1_target", draft, revision: 7 }
    const ports: McpUpdateCommandPorts = {
      ...base, resolveMcp: () => snapshot, existingNames: () => [], inspectConnection: async () => ({ ok: true }),
      persist: async () => ({ ok: true, revision: 8 }), apply: async () => ({ ok: false, reasonCode: "mcp_runtime_apply_failed" }),
      verify: async () => ({ ok: true }), rollback: async () => ({ ok: false, reasonCode: "mcp_runtime_rollback_failed" }),
    }
    await expect(executeMcpUpdateCommand({ envelope: envelope("mcp_update"), mcpRef: snapshot.mcpRef, draft: { ...draft, displayName: "Changed" } }, ports)).resolves.toMatchObject({ state: "failed", reasonCode: "mcp_runtime_rollback_failed", revision: 7 })
  })
})
