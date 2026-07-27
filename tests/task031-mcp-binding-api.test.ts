import { describe, expect, it } from "vitest"
import { registerMcpRoute } from "../packages/core/src/api/routes/mcp.js"

type Handler = (...args: unknown[]) => unknown
function app() {
  const gets = new Map<string, Handler>()
  const patches = new Map<string, Handler>()
  return {
    gets,
    patches,
    value: {
      get(path: string, _options: unknown, handler: Handler) {
        gets.set(path, handler)
      },
      post() {},
      patch(path: string, _options: unknown, handler: Handler) {
        patches.set(path, handler)
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
const agentRef = `agent_v1_${"b".repeat(24)}`
const envelope = {
  scope: "capability:write",
  mutationId: "m1",
  targetRevision: 8,
  purpose: "mcp_bind",
  issuedAt: 100,
  nonce: "n1",
}
const active = {
  mutationId: "m1",
  state: "active" as const,
  reasonCode: null,
  allowedActions: [],
  revision: 8,
  mcpRef,
  agentRef,
  bound: true,
}
const catalog = [
  {
    mcp_server_id: "mcp:penpot",
    status: "enabled" as const,
    display_name: "Penpot",
    metadata_json: null,
    updated_at: 7,
  },
]
const runtime = [
  {
    name: "penpot",
    transport: "stdio" as const,
    enabled: true,
    required: false,
    ready: true,
    toolCount: 1,
    registeredToolCount: 1,
    tools: [{ name: "inspect", description: "Inspect" }],
  },
]

function options(overrides = {}) {
  return {
    catalogRepository: {
      listCatalog: () => catalog,
      listBindings: () => [{ catalog_id: "mcp:penpot", status: "enabled" as const, updated_at: 7 }],
    },
    runtimeRepository: { listStatuses: () => runtime },
    publicRefForMcpId: () => mcpRef,
    publicRefForAgentId: () => agentRef,
    bindingProjectionRepository: {
      listAgents: () => [
        { agent_id: "agent-internal", agent_name: "Researcher", status: "enabled" },
      ],
      listBindings: () => [
        { agent_id: "agent-internal", catalog_id: "mcp:penpot", status: "enabled" },
      ],
    },
    mutationActorForRequest: () => "api:owner",
    bindingExecutor: async () => active,
    now: () => 100,
    ...overrides,
  }
}

describe("task031 MCP binding API", () => {
  it("adds a redacted binding projection to MCP detail", async () => {
    const target = app()
    registerMcpRoute(target.value as never, options())
    const out = reply()
    const result = await target.gets.get("/api/capabilities/mcp/:mcpRef")?.(
      { params: { mcpRef } },
      out.value,
    )
    expect(result).toMatchObject({
      displayName: "Penpot",
      bindings: { boundAgents: [{ agentRef, name: "Researcher" }], availableAgents: [] },
      tools: [
        {
          name: "inspect",
          access: [{ agentRef, agentName: "Researcher", status: "allowed" }],
        },
      ],
    })
    expect(JSON.stringify(result)).not.toMatch(
      /agent-internal|mcp:penpot|secret|command|cwd|enabled_tool_names|permission_profile/,
    )
  })

  it("derives actor and maps the requested bound state to a command action", async () => {
    let received: unknown
    const target = app()
    registerMcpRoute(
      target.value as never,
      options({
        bindingExecutor: async (input: unknown) => {
          received = input
          return active
        },
      }),
    )
    const out = reply()
    const result = await target.patches.get("/api/capabilities/mcp/:mcpRef/bindings/:agentRef")?.(
      { params: { mcpRef, agentRef }, body: { envelope, bound: true } },
      out.value,
    )
    expect(out.state.statusCode).toBe(200)
    expect(received).toMatchObject({
      mcpRef,
      agentRef,
      action: "bind",
      envelope: { actorRef: "api:owner" },
    })
    expect(result).toEqual(active)
  })

  it("fails closed on malformed input and denied actors", async () => {
    let calls = 0
    const target = app()
    registerMcpRoute(
      target.value as never,
      options({
        bindingExecutor: async () => {
          calls += 1
          return active
        },
      }),
    )
    const path = "/api/capabilities/mcp/:mcpRef/bindings/:agentRef"
    const invalid = reply()
    expect(
      await target.patches.get(path)?.(
        { params: { mcpRef: "raw", agentRef }, body: { envelope, bound: true } },
        invalid.value,
      ),
    ).toEqual({ error: "mcp_binding_ref_invalid" })
    const unknown = reply()
    expect(
      await target.patches.get(path)?.(
        { params: { mcpRef, agentRef }, body: { envelope, bound: true, force: true } },
        unknown.value,
      ),
    ).toEqual({ error: "mcp_binding_request_invalid" })
    const deniedTarget = app()
    registerMcpRoute(deniedTarget.value as never, options({ mutationActorForRequest: () => null }))
    const denied = reply()
    expect(
      await deniedTarget.patches.get(path)?.(
        { params: { mcpRef, agentRef }, body: { envelope, bound: true } },
        denied.value,
      ),
    ).toEqual({ error: "mcp_binding_actor_denied" })
    expect(calls).toBe(0)
  })

  it("maps missing targets and revision conflicts", async () => {
    let receipt = {
      ...active,
      state: "rejected" as const,
      reasonCode: "agent_ref_not_found",
      revision: 7,
    }
    const target = app()
    registerMcpRoute(target.value as never, options({ bindingExecutor: async () => receipt }))
    const path = "/api/capabilities/mcp/:mcpRef/bindings/:agentRef"
    const missing = reply()
    await target.patches.get(path)?.(
      { params: { mcpRef, agentRef }, body: { envelope, bound: true } },
      missing.value,
    )
    expect(missing.state.statusCode).toBe(404)
    receipt = { ...receipt, reasonCode: "mutation_revision_conflict" }
    const conflict = reply()
    await target.patches.get(path)?.(
      { params: { mcpRef, agentRef }, body: { envelope, bound: true } },
      conflict.value,
    )
    expect(conflict.state.statusCode).toBe(409)
  })
})
