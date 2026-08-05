import { describe, expect, it } from "vitest"
import {
  type McpPersistedEntry,
  createMcpMutationRuntime,
} from "../packages/core/src/capabilities/mcp-mutation-runtime.js"
import { mergeMcpProtectedUpdate } from "../packages/core/src/capabilities/mcp-protected-update.js"

const current = {
  displayName: "Penpot",
  transport: "stdio" as const,
  command: "/secret/bin/node",
  args: ["private.mjs"],
  cwd: "/workspace/private",
  required: false,
}
const envelope = {
  actorRef: "api:owner",
  scope: "capability:write",
  mutationId: "mutation-1",
  targetRevision: 2,
  purpose: "mcp_update",
  issuedAt: 10,
  nonce: "nonce-1",
}

describe("task030 protected MCP update", () => {
  it("preserves hidden connection fields for metadata-only changes", () => {
    expect(
      mergeMcpProtectedUpdate(current, { displayName: "Penpot Design", required: true }),
    ).toEqual({
      valid: true,
      reasonCodes: [],
      draft: { ...current, displayName: "Penpot Design", required: true },
    })
  })

  it("requires an exact replacement contract and rejects dangerous fields", () => {
    expect(
      mergeMcpProtectedUpdate(current, {
        replacement: {
          transport: "stdio",
          command: "node",
          args: [],
          cwd: "",
          environment: { TOKEN: "secret" },
        },
      }).reasonCodes,
    ).toContain("mcp_replacement_invalid")
    expect(
      mergeMcpProtectedUpdate(current, {
        replacement: { transport: "stdio", command: "node", args: [], cwd: "" },
      }),
    ).toMatchObject({ valid: true, draft: { command: "node", args: [], cwd: "" } })
  })

  it("updates through the canonical mutation and probes an existing ref without disclosure", async () => {
    let revision = 1
    let entries: McpPersistedEntry[] = [{ internalMcpId: "mcp:penpot", draft: current }]
    let persistedDraft: unknown
    const runtime = createMcpMutationRuntime({
      store: {
        currentRevision: () => revision,
        listEntries: () => entries,
        listKnownIdentities: () => [{ internalMcpId: "mcp:penpot", displayName: "Penpot" }],
        runtimeConfigurationSnapshot: () => ({ servers: {} }),
        persist: (input) => {
          persistedDraft = input.draft
          const rollbackSnapshot = { revision, entries, token: null }
          revision = input.targetRevision
          entries = [{ internalMcpId: input.internalMcpId, draft: input.draft }]
          return { ok: true, revision, rollbackSnapshot }
        },
        rollback: () => ({ ok: true }),
      },
      runtime: {
        capture: () => ({ token: null }),
        apply: async () => ({ ok: true }),
        verify: async () => ({ ok: true }),
        rollback: async () => ({ ok: true }),
      },
      inspection: { inspect: async (draft) => ({ ok: true, draft }) },
      receipts: {
        now: () => 10,
        currentRevision: () => revision,
        nonceUsed: () => false,
        reserveReceipt: () => true,
        updateReceipt: () => {},
      },
      createInternalMcpId: () => "unused",
      publicRefForMcpId: () => "mcp_v1_0123456789abcdef01234567",
    })
    const probe = await runtime.inspectExisting({ mcpRef: "mcp_v1_0123456789abcdef01234567" })
    expect(probe).toEqual({ state: "ready", ready: true, reasonCode: null, observedAt: 10 })
    expect(JSON.stringify(probe)).not.toMatch(/command|private|workspace|secret/)
    await expect(
      runtime.executeProtectedUpdate({
        envelope,
        mcpRef: "mcp_v1_0123456789abcdef01234567",
        change: { displayName: "Penpot Design" },
      }),
    ).resolves.toMatchObject({ state: "active", revision: 2 })
    expect(persistedDraft).toMatchObject({
      displayName: "Penpot Design",
      command: "/secret/bin/node",
      args: ["private.mjs"],
      cwd: "/workspace/private",
    })
  })
})
