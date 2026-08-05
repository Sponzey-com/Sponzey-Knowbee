import { describe, expect, it } from "vitest"
import { registerMcpRoute } from "../packages/core/src/api/routes/mcp.js"
import type { McpMutationRuntime } from "../packages/core/src/capabilities/mcp-mutation-runtime.js"

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

function app() {
  type Handler = (...args: unknown[]) => unknown
  const posts = new Map<string, Handler>()
  const patches = new Map<string, Handler>()
  return {
    posts,
    patches,
    value: {
      get() {},
      post(path: string, _options: unknown, handler: Handler) {
        posts.set(path, handler)
      },
      patch(path: string, _options: unknown, handler: Handler) {
        patches.set(path, handler)
      },
    },
  }
}

const mcpRef = "mcp_v1_0123456789abcdef01234567"
const envelope = {
  scope: "capability:write",
  mutationId: "mutation-2",
  targetRevision: 9,
  purpose: "mcp_update",
  issuedAt: 100,
  nonce: "nonce-2",
}
const active = {
  mutationId: "mutation-2",
  state: "active" as const,
  reasonCode: null,
  allowedActions: [],
  revision: 9,
  mcpRef,
}

function runtime(overrides: Partial<McpMutationRuntime> = {}): McpMutationRuntime {
  return {
    currentRevision: () => 8,
    executeCreate: async () => active,
    executeUpdate: async () => active,
    executeProtectedUpdate: async () => active,
    inspectExisting: async () => ({
      state: "ready",
      ready: true,
      reasonCode: null,
      observedAt: 100,
    }),
    ...overrides,
  }
}

describe("task030 MCP protected mutation API", () => {
  it("probes a saved connection by opaque ref without returning connection details", async () => {
    const target = app()
    let received: unknown
    registerMcpRoute(target.value as never, {
      mutationRuntime: runtime({
        inspectExisting: async (input) => {
          received = input
          return { state: "ready", ready: true, reasonCode: null, observedAt: 100 }
        },
      }),
      mutationActorForRequest: () => "api:owner",
      now: () => 100,
    })
    const out = reply()
    const result = await target.posts.get("/api/capabilities/mcp/:mcpRef/probe")?.(
      { params: { mcpRef }, body: {} },
      out.value,
    )
    expect(out.state.statusCode).toBe(200)
    expect(received).toMatchObject({ mcpRef })
    expect(result).toEqual({ state: "ready", ready: true, reasonCode: null, observedAt: 100 })
    expect(JSON.stringify(result)).not.toMatch(/command|args|cwd|environment|secret|private/)
  })

  it("routes a protected change and derives the actor inside the mutation envelope", async () => {
    const target = app()
    let received: unknown
    registerMcpRoute(target.value as never, {
      mutationRuntime: runtime({
        executeProtectedUpdate: async (input) => {
          received = input
          return active
        },
      }),
      mutationActorForRequest: () => "api:owner",
      now: () => 100,
    })
    const out = reply()
    const result = await target.patches.get("/api/capabilities/mcp/:mcpRef")?.(
      {
        params: { mcpRef },
        body: { envelope, change: { displayName: "Penpot Design", required: true } },
      },
      out.value,
    )
    expect(out.state.statusCode).toBe(200)
    expect(received).toMatchObject({
      mcpRef,
      change: { displayName: "Penpot Design", required: true },
      envelope: { actorRef: "api:owner" },
    })
    expect(result).toEqual(active)
    expect(JSON.stringify(result)).not.toMatch(/command|args|cwd|environment|secret|private/)
  })

  it("rejects hidden-field injection and denied actors before runtime execution", async () => {
    let calls = 0
    const target = app()
    registerMcpRoute(target.value as never, {
      mutationRuntime: runtime({
        executeProtectedUpdate: async () => {
          calls += 1
          return active
        },
      }),
      mutationActorForRequest: () => "api:owner",
    })
    const dangerous = reply()
    expect(
      await target.patches.get("/api/capabilities/mcp/:mcpRef")?.(
        {
          params: { mcpRef },
          body: {
            envelope,
            change: {
              replacement: {
                transport: "stdio",
                command: "node",
                args: [],
                cwd: "",
                environment: { TOKEN: "secret" },
              },
            },
          },
        },
        dangerous.value,
      ),
    ).toEqual({ error: "mcp_update_request_invalid" })
    expect(dangerous.state.statusCode).toBe(400)

    const deniedTarget = app()
    registerMcpRoute(deniedTarget.value as never, {
      mutationRuntime: runtime({
        inspectExisting: async () => {
          calls += 1
          return { state: "ready", ready: true, reasonCode: null, observedAt: 100 }
        },
      }),
      mutationActorForRequest: () => null,
    })
    const denied = reply()
    expect(
      await deniedTarget.posts.get("/api/capabilities/mcp/:mcpRef/probe")?.(
        { params: { mcpRef }, body: {} },
        denied.value,
      ),
    ).toEqual({ error: "mcp_existing_probe_actor_denied" })
    expect(denied.state.statusCode).toBe(403)
    expect(calls).toBe(0)
  })
})
