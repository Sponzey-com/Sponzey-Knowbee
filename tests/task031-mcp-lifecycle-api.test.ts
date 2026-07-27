import { describe, expect, it } from "vitest"
import { registerMcpRoute } from "../packages/core/src/api/routes/mcp.js"
import type { McpMutationRuntime } from "../packages/core/src/capabilities/mcp-mutation-runtime.js"

type Handler = (request: unknown, reply: unknown) => unknown
function app() {
  const patches = new Map<string, Handler>()
  const deletes = new Map<string, Handler>()
  return {
    patches,
    deletes,
    value: {
      get() {},
      post() {},
      patch(path: string, _options: unknown, handler: Handler) {
        patches.set(path, handler)
      },
      delete(path: string, _options: unknown, handler: Handler) {
        deletes.set(path, handler)
      },
    },
  }
}
function reply() {
  const state = { statusCode: 200 }
  return {
    state,
    value: {
      status(code: number) {
        state.statusCode = code
        return this
      },
      send(payload: unknown) {
        return payload
      },
    },
  }
}

const mcpRef = `mcp_v1_${"a".repeat(24)}`
const envelope = (purpose: string) => ({
  scope: "capability:write",
  mutationId: "m1",
  targetRevision: 8,
  purpose,
  issuedAt: 100,
  nonce: "n1",
})
const active = {
  mutationId: "m1",
  state: "active" as const,
  reasonCode: null,
  allowedActions: [],
  revision: 8,
  mcpRef,
  status: "disabled" as const,
  deleted: false,
  impact: { bindingCount: 0, agentNames: [] },
}
function runtime(executeLifecycle: McpMutationRuntime["executeLifecycle"]): McpMutationRuntime {
  return {
    currentRevision: () => 7,
    executeCreate: async () => ({
      mutationId: "unused",
      state: "rejected",
      reasonCode: "unused",
      allowedActions: [],
      revision: 7,
      mcpRef: null,
    }),
    executeUpdate: async () => ({
      mutationId: "unused",
      state: "rejected",
      reasonCode: "unused",
      allowedActions: [],
      revision: 7,
      mcpRef: null,
    }),
    executeProtectedUpdate: async () => ({
      mutationId: "unused",
      state: "rejected",
      reasonCode: "unused",
      allowedActions: [],
      revision: 7,
      mcpRef: null,
    }),
    inspectExisting: async () => ({
      state: "not_found",
      ready: false,
      reasonCode: "unused",
      observedAt: 100,
    }),
    executeLifecycle,
  }
}

describe("task031 MCP lifecycle API", () => {
  it("derives the actor and maps enabled to the lifecycle action", async () => {
    let received: unknown
    const target = app()
    registerMcpRoute(target.value as never, {
      mutationRuntime: runtime(async (input) => {
        received = input
        return active
      }),
      mutationActorForRequest: () => "api:owner",
      now: () => 100,
    })
    const out = reply()
    const result = await target.patches.get("/api/capabilities/mcp/:mcpRef/status")?.(
      { params: { mcpRef }, body: { envelope: envelope("mcp_disable"), enabled: false } },
      out.value,
    )
    expect(out.state.statusCode).toBe(200)
    expect(received).toMatchObject({
      mcpRef,
      action: "disable",
      envelope: { actorRef: "api:owner" },
    })
    expect(result).toEqual(active)
    expect(JSON.stringify(result)).not.toMatch(/command|args|cwd|environment|secret|actor/)
  })

  it("deletes without accepting force or recursive bypass fields", async () => {
    let calls = 0
    const target = app()
    registerMcpRoute(target.value as never, {
      mutationRuntime: runtime(async () => {
        calls += 1
        return { ...active, status: "deleted", deleted: true }
      }),
      mutationActorForRequest: () => "api:owner",
    })
    const path = "/api/capabilities/mcp/:mcpRef"
    const force = reply()
    expect(
      await target.deletes.get(path)?.(
        { params: { mcpRef }, body: { envelope: envelope("mcp_delete"), force: true } },
        force.value,
      ),
    ).toEqual({ error: "mcp_delete_request_invalid" })
    expect(force.state.statusCode).toBe(400)
    const out = reply()
    expect(
      await target.deletes.get(path)?.(
        { params: { mcpRef }, body: { envelope: envelope("mcp_delete") } },
        out.value,
      ),
    ).toMatchObject({ deleted: true })
    expect(calls).toBe(1)
  })

  it("maps in-use impact to conflict and preserves visible agent names", async () => {
    const target = app()
    registerMcpRoute(target.value as never, {
      mutationRuntime: runtime(async () => ({
        ...active,
        state: "rejected",
        reasonCode: "mcp_delete_in_use",
        revision: 7,
        impact: { bindingCount: 1, agentNames: ["Writer"] },
      })),
      mutationActorForRequest: () => "api:owner",
    })
    const out = reply()
    const result = await target.deletes.get("/api/capabilities/mcp/:mcpRef")?.(
      { params: { mcpRef }, body: { envelope: envelope("mcp_delete") } },
      out.value,
    )
    expect(out.state.statusCode).toBe(409)
    expect(result).toMatchObject({
      reasonCode: "mcp_delete_in_use",
      impact: { agentNames: ["Writer"] },
    })
  })

  it("rejects malformed status input and a missing server actor before execution", async () => {
    let calls = 0
    const target = app()
    registerMcpRoute(target.value as never, {
      mutationRuntime: runtime(async () => {
        calls += 1
        return active
      }),
      mutationActorForRequest: () => null,
    })
    const malformed = reply()
    expect(
      await target.patches.get("/api/capabilities/mcp/:mcpRef/status")?.(
        {
          params: { mcpRef },
          body: { envelope: envelope("mcp_disable"), enabled: false, recursive: true },
        },
        malformed.value,
      ),
    ).toEqual({ error: "mcp_status_request_invalid" })
    const denied = reply()
    expect(
      await target.deletes.get("/api/capabilities/mcp/:mcpRef")?.(
        { params: { mcpRef }, body: { envelope: envelope("mcp_delete") } },
        denied.value,
      ),
    ).toEqual({ error: "mcp_delete_actor_denied" })
    expect(calls).toBe(0)
  })
})
