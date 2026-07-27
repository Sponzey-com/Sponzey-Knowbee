import { describe, expect, it } from "vitest"
import { createMcpMutationRuntime } from "../packages/core/src/capabilities/mcp-mutation-runtime.js"

const envelope = {
  actorRef: "api:owner",
  scope: "capability:write",
  mutationId: "recover-1",
  targetRevision: 8,
  purpose: "mcp_recover",
  issuedAt: 100,
  nonce: "nonce-1",
}

function harness(verifyReady: boolean) {
  let revision = 7
  const calls: string[] = []
  const runtime = createMcpMutationRuntime({
    store: {
      currentRevision: () => revision,
      listEntries: () => [
        {
          internalMcpId: "mcp:penpot",
          draft: {
            displayName: "Penpot",
            transport: "stdio",
            command: "node",
            args: ["penpot.mjs"],
            cwd: "/workspace",
            required: false,
          },
          status: "enabled",
        },
      ],
      listKnownIdentities: () => [{ internalMcpId: "mcp:penpot", displayName: "Penpot" }],
      runtimeConfigurationSnapshot: () => ({
        servers: { penpot: { command: "node", args: ["penpot.mjs"] } },
      }),
      persistRecovery: ({ targetRevision }: { targetRevision: number }) => {
        calls.push("persist")
        const rollbackSnapshot = { revision, entries: [], token: "store" }
        revision = targetRevision
        return { ok: true, revision, rollbackSnapshot }
      },
      rollback: () => {
        calls.push("store-rollback")
        revision = 7
        return { ok: true }
      },
    },
    runtime: {
      captureTarget: () => ({ token: "target" }),
      applyTarget: async () => {
        calls.push("target-apply")
        return { ok: true }
      },
      verifyTarget: async () => {
        calls.push("target-verify")
        return verifyReady
          ? { ok: true, toolCount: 2 }
          : { ok: false, reasonCode: "mcp_recovery_not_ready", toolCount: 0 }
      },
      rollbackTarget: async () => {
        calls.push("target-rollback")
        return { ok: true }
      },
    },
    inspection: {
      inspect: async () => {
        calls.push("inspect")
        return { ok: true }
      },
    },
    receipts: {
      now: () => 100,
      currentRevision: () => revision,
      nonceUsed: () => false,
      reserveReceipt: () => true,
      updateReceipt: () => {},
    },
    createInternalMcpId: () => "unused",
    publicRefForMcpId: () => "mcp-public",
  } as never)
  return { runtime, calls, revision: () => revision }
}

describe("task032 MCP recovery application runtime", () => {
  it("composes inspection, revision persistence, target apply and verification", async () => {
    const target = harness(true)
    await expect(
      target.runtime.executeRecovery({ envelope, mcpRef: "mcp-public" }),
    ).resolves.toMatchObject({ state: "active", revision: 8, ready: true, toolCount: 2 })
    expect(target.calls).toEqual(["inspect", "persist", "target-apply", "target-verify"])
    expect(target.revision()).toBe(8)
  })

  it("rolls back persisted and target snapshots when latest health is not ready", async () => {
    const target = harness(false)
    await expect(
      target.runtime.executeRecovery({ envelope, mcpRef: "mcp-public" }),
    ).resolves.toMatchObject({
      state: "rolled_back",
      revision: 7,
      ready: false,
      reasonCode: "mcp_recovery_not_ready",
    })
    expect(target.calls).toEqual([
      "inspect",
      "persist",
      "target-apply",
      "target-verify",
      "store-rollback",
      "target-rollback",
    ])
    expect(target.revision()).toBe(7)
  })

  it("does not inspect or mutate a different public MCP reference", async () => {
    const target = harness(true)
    await expect(target.runtime.executeRecovery({ envelope, mcpRef: "mcp-other" })).resolves.toMatchObject({ state: "rejected", reasonCode: "mcp_ref_not_found", revision: 7 })
    expect(target.calls).toEqual([])
  })
})
