import { describe, expect, it } from "vitest"
import type { MutationEnvelope } from "../packages/core/src/capabilities/capability-security-boundary.js"
import {
  type McpConfigurationRollbackSnapshot,
  type McpPersistedEntry,
  createMcpMutationRuntime,
} from "../packages/core/src/capabilities/mcp-mutation-runtime.js"

const draft = {
  displayName: "Penpot",
  transport: "stdio" as const,
  command: "node",
  args: ["server.mjs"],
  cwd: "/workspace",
  required: false,
}
const envelope = (purpose: string): MutationEnvelope => ({
  actorRef: "api:owner",
  scope: "capability:write",
  mutationId: "mutation-1",
  targetRevision: 8,
  purpose,
  issuedAt: 100,
  nonce: "nonce-1",
})

function runtimeFixture(
  input: { boundAgentNames?: string[]; failVerify?: boolean; failRollback?: boolean } = {},
) {
  let revision = 7
  let entries: McpPersistedEntry[] = [{ internalMcpId: "mcp:penpot", draft, status: "enabled" }]
  let activeRevision = 7
  const order: string[] = []
  const runtime = createMcpMutationRuntime({
    store: {
      currentRevision: () => revision,
      listEntries: () => entries,
      listKnownIdentities: () =>
        entries.map((entry) => ({
          internalMcpId: entry.internalMcpId,
          displayName: entry.draft.displayName,
        })),
      runtimeConfigurationSnapshot: () => ({ entries }),
      persist: () => ({ ok: false, revision, reasonCode: "unused" }),
      persistLifecycle: ({ action, targetRevision }) => {
        order.push(`persist:${action}`)
        const rollbackSnapshot: McpConfigurationRollbackSnapshot = {
          revision,
          entries,
          token: "before",
        }
        revision = targetRevision
        entries =
          action === "delete"
            ? []
            : entries.map((entry) => ({
                ...entry,
                status: action === "enable" ? "enabled" : "disabled",
              }))
        return { ok: true, revision, rollbackSnapshot }
      },
      rollback: (snapshot) => {
        order.push("store.rollback")
        if (input.failRollback) return { ok: false, reasonCode: "storage detail" }
        revision = snapshot.revision
        entries = [...snapshot.entries]
        return { ok: true }
      },
    },
    runtime: {
      capture: () => ({ token: activeRevision }),
      apply: async ({ targetRevision }) => {
        order.push("runtime.apply")
        activeRevision = targetRevision
        return { ok: true }
      },
      verify: async () => ({ ok: true }),
      verifyLifecycle: async () => {
        order.push("runtime.verify")
        return input.failVerify
          ? { ok: false, reasonCode: "mcp_disable_not_visible" }
          : { ok: true }
      },
      rollback: async (snapshot) => {
        order.push("runtime.rollback")
        activeRevision = snapshot.token as number
        return { ok: true }
      },
    },
    inspection: { inspect: async () => ({ ok: true }) },
    receipts: {
      now: () => 100,
      currentRevision: () => revision,
      nonceUsed: () => false,
      reserveReceipt: () => true,
      updateReceipt: () => {},
    },
    createInternalMcpId: () => "unused",
    publicRefForMcpId: () => "mcp_v1_0123456789abcdef01234567",
    boundAgentNames: () => input.boundAgentNames ?? [],
  })
  return { runtime, order, state: () => ({ revision, entries, activeRevision }) }
}

describe("task031 MCP lifecycle runtime", () => {
  it("applies and verifies disable through the canonical runtime snapshot", async () => {
    const fixture = runtimeFixture()
    await expect(
      fixture.runtime.executeLifecycle({
        envelope: envelope("mcp_disable"),
        mcpRef: "mcp_v1_0123456789abcdef01234567",
        action: "disable",
      }),
    ).resolves.toMatchObject({ state: "active", status: "disabled", revision: 8 })
    expect(fixture.order).toEqual(["persist:disable", "runtime.apply", "runtime.verify"])
    expect(fixture.state()).toMatchObject({
      revision: 8,
      activeRevision: 8,
      entries: [{ status: "disabled" }],
    })
  })

  it("rejects deleting a bound MCP before persistence", async () => {
    const fixture = runtimeFixture({ boundAgentNames: ["Writer"] })
    await expect(
      fixture.runtime.executeLifecycle({
        envelope: envelope("mcp_delete"),
        mcpRef: "mcp_v1_0123456789abcdef01234567",
        action: "delete",
      }),
    ).resolves.toMatchObject({
      state: "rejected",
      reasonCode: "mcp_delete_in_use",
      impact: { agentNames: ["Writer"] },
    })
    expect(fixture.order).toEqual([])
  })

  it("restores persisted and active snapshots when verification fails", async () => {
    const fixture = runtimeFixture({ failVerify: true })
    await expect(
      fixture.runtime.executeLifecycle({
        envelope: envelope("mcp_disable"),
        mcpRef: "mcp_v1_0123456789abcdef01234567",
        action: "disable",
      }),
    ).resolves.toMatchObject({
      state: "rolled_back",
      reasonCode: "mcp_disable_not_visible",
      revision: 7,
      status: "enabled",
    })
    expect(fixture.order).toEqual([
      "persist:disable",
      "runtime.apply",
      "runtime.verify",
      "store.rollback",
      "runtime.rollback",
    ])
    expect(fixture.state()).toMatchObject({
      revision: 7,
      activeRevision: 7,
      entries: [{ status: "enabled" }],
    })
  })

  it("redacts lower-level rollback errors behind the lifecycle terminal code", async () => {
    const fixture = runtimeFixture({ failVerify: true, failRollback: true })
    await expect(
      fixture.runtime.executeLifecycle({
        envelope: envelope("mcp_disable"),
        mcpRef: "mcp_v1_0123456789abcdef01234567",
        action: "disable",
      }),
    ).resolves.toMatchObject({ state: "failed", reasonCode: "mcp_lifecycle_rollback_failed" })
    expect(fixture.order).not.toContain("runtime.rollback")
  })
})
