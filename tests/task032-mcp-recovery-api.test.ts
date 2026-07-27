import { describe, expect, it } from "vitest"
import { registerMcpRoute } from "../packages/core/src/api/routes/mcp.js"
import type { McpMutationRuntime } from "../packages/core/src/capabilities/mcp-mutation-runtime.js"

type Handler = (request: unknown, reply: unknown) => unknown
function harness() {
  const posts = new Map<string, Handler>()
  return {
    posts,
    app: {
      get() {},
      patch() {},
      delete() {},
      post(path: string, _options: unknown, handler: Handler) {
        posts.set(path, handler)
      },
    },
  }
}
function reply() {
  const state = { statusCode: 200 }
  return {
    state,
    api: {
      status(code: number) {
        state.statusCode = code
        return this
      },
      send(value: unknown) {
        return value
      },
    },
  }
}
const mcpRef = `mcp_v1_${"a".repeat(24)}`
const envelope = {
  scope: "capability:write",
  mutationId: "recover-1",
  targetRevision: 8,
  purpose: "mcp_recover",
  issuedAt: 100,
  nonce: "nonce-1",
}

function runtime(executeRecovery: McpMutationRuntime["executeRecovery"]): McpMutationRuntime {
  return { executeRecovery } as McpMutationRuntime
}

describe("task032 MCP recovery API", () => {
  it("derives the server actor and returns only the public recovery receipt", async () => {
    let received: unknown
    const target = harness()
    registerMcpRoute(target.app as never, {
      mutationRuntime: runtime(async (input) => {
        received = input
        return {
          mutationId: "recover-1",
          state: "active",
          reasonCode: null,
          allowedActions: [],
          revision: 8,
          mcpRef,
          ready: true,
          toolCount: 2,
        }
      }),
      mutationActorForRequest: () => "api:owner",
      now: () => 100,
    })
    const out = reply()
    const result = await target.posts.get("/api/capabilities/mcp/:mcpRef/recover")?.(
      { params: { mcpRef }, body: { envelope } },
      out.api,
    )
    expect(out.state.statusCode).toBe(200)
    expect(received).toMatchObject({
      mcpRef,
      envelope: { actorRef: "api:owner", purpose: "mcp_recover" },
    })
    expect(result).toMatchObject({ ready: true, toolCount: 2, revision: 8 })
    expect(JSON.stringify(result)).not.toMatch(
      /command|args|cwd|environment|secret|internalMcpId|actorRef/,
    )
  })

  it("rejects target overrides, actor spoofing and a missing authenticated actor", async () => {
    let calls = 0
    const target = harness()
    registerMcpRoute(target.app as never, {
      mutationRuntime: runtime(async () => {
        calls += 1
        throw new Error("unexpected")
      }),
      mutationActorForRequest: () => "api:owner",
    })
    const handler = target.posts.get("/api/capabilities/mcp/:mcpRef/recover")
    expect(handler).toBeDefined()
    if (!handler) throw new Error("recovery handler missing")
    for (const body of [
      { envelope, force: true },
      { envelope, command: "node" },
      { envelope, environment: { TOKEN: "secret" } },
      { envelope: { ...envelope, actorRef: "api:spoof" } },
    ]) {
      const out = reply()
      expect(await handler({ params: { mcpRef }, body }, out.api)).toEqual({
        error: "mcp_recovery_request_invalid",
      })
      expect(out.state.statusCode).toBe(400)
    }
    const denied = harness()
    registerMcpRoute(denied.app as never, {
      mutationRuntime: runtime(async () => {
        calls += 1
        throw new Error("unexpected")
      }),
      mutationActorForRequest: () => null,
    })
    const out = reply()
    expect(
      await denied.posts.get("/api/capabilities/mcp/:mcpRef/recover")?.(
        { params: { mcpRef }, body: { envelope } },
        out.api,
      ),
    ).toEqual({ error: "mcp_recovery_actor_denied" })
    expect(out.state.statusCode).toBe(403)
    expect(calls).toBe(0)
  })
})
