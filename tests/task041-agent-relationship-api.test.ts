import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import type { AgentRelationshipMutationReceipt } from "../packages/core/src/agents/agent-relationship-command.js"
import type { AgentRelationshipProjection } from "../packages/core/src/agents/agent-relationship-projection.js"
import { registerAgentWorkspaceRoute } from "../packages/core/src/api/routes/agent-workspace.js"

type Handler = (...args: unknown[]) => unknown

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: {
  logger: boolean
}) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: { method: string; url: string }): Promise<{
    statusCode: number
    json(): unknown
  }>
}

const rootRef = `agent_v1_${"0".repeat(24)}`
const childRef = `agent_v1_${"1".repeat(24)}`
const parentRef = `agent_v1_${"2".repeat(24)}`

function ref(prefix: "agent" | "relationship", value: number): string {
  return `${prefix}_v1_${value.toString(16).padStart(24, "0")}`
}

const projection: AgentRelationshipProjection = {
  root: { agentRef: rootRef, name: "마당쇠" },
  relationships: Array.from({ length: 105 }, (_, index) => ({
    relationshipRef: ref("relationship", index + 1),
    parentRef: index === 0 ? rootRef : ref("agent", index + 100),
    parentName: index === 0 ? "마당쇠" : `Parent ${index}`,
    childRef: ref("agent", index + 1),
    childName: `Agent ${index + 1}`,
    depth: index === 0 ? 1 : 2,
    sortOrder: index,
  })),
  revision: 18,
  observedAt: 1_000,
}

function reply() {
  return {
    code: 200,
    status(code: number) {
      this.code = code
      return this
    },
    send(payload: unknown) {
      return { code: this.code, payload }
    },
  }
}

function routes(input: {
  execute(command: unknown): Promise<AgentRelationshipMutationReceipt>
  logs?: Array<Record<string, unknown>>
}) {
  const handlers = new Map<string, Handler>()
  registerAgentWorkspaceRoute(
    {
      get(path: string, _options: unknown, handler: Handler) {
        handlers.set(`GET ${path}`, handler)
      },
      post(path: string, _options: unknown, handler: Handler) {
        handlers.set(`POST ${path}`, handler)
      },
      patch(path: string, _options: unknown, handler: Handler) {
        handlers.set(`PATCH ${path}`, handler)
      },
    } as never,
    {
      projection: () => ({ items: [], details: [], summary: {} }) as never,
      relationshipProjection: () => projection,
      executeRelationshipCommand: (_request, command) => input.execute(command),
      logger: {
        product: (fields) => input.logs?.push(fields),
        fieldDebug: (fields) => input.logs?.push(fields),
        development: (fields) => input.logs?.push(fields),
      },
    },
  )
  return handlers
}

function mutation(kind: "connect" | "reparent" | "disconnect") {
  return {
    kind,
    parentRef: kind === "disconnect" ? null : parentRef,
    mutation: {
      actorRef: "webui",
      scope: "agent_relationship:write",
      mutationId: `mutation-${kind}`,
      targetRevision: 19,
      purpose: `relationship_${kind}`,
      issuedAt: 1_000,
      nonce: `nonce-${kind}`,
    },
  }
}

describe("Task 041 agent relationship API", () => {
  it("matches the static relationships route before the opaque detail route", async () => {
    const app = Fastify({ logger: false })
    registerAgentWorkspaceRoute(app as never, {
      projection: () => ({ items: [], details: [], summary: {} }) as never,
      relationshipProjection: () => projection,
    })
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/agent-workspace/relationships?limit=1",
      })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        root: { agentRef: rootRef, name: "마당쇠" },
        relationships: [{ relationshipRef: ref("relationship", 1) }],
      })
    } finally {
      await app.close()
    }
  })

  it("returns only the bounded public relationship projection", async () => {
    const handlers = routes({
      execute: async () => {
        throw new Error("not called")
      },
    })
    const result = (await handlers.get("GET /api/agent-workspace/relationships")?.(
      { query: { limit: "999" } },
      reply(),
    )) as AgentRelationshipProjection

    expect(result.root).toEqual({ agentRef: rootRef, name: "마당쇠" })
    expect(result.relationships).toHaveLength(100)
    expect(result).toMatchObject({ revision: 18, observedAt: 1_000 })
    expect(JSON.stringify(result)).not.toMatch(/internal(Id|Agent|Edge)|prompt|memory|database/iu)
  })

  it("passes a complete opaque command and maps conflict without raw log data", async () => {
    let received: unknown
    const logs: Array<Record<string, unknown>> = []
    const handlers = routes({
      logs,
      execute: async (command) => {
        received = command
        return {
          mutationId: "mutation-reparent",
          kind: "reparent",
          state: "conflict",
          reasonCode: "mutation_revision_conflict",
          revision: 18,
          childRef,
          parentRef,
          allowedActions: ["retry"],
        }
      },
    })
    const result = await handlers.get("PATCH /api/agent-workspace/:childRef/parent")?.(
      { params: { childRef }, body: mutation("reparent") },
      reply(),
    )

    expect(received).toMatchObject({ kind: "reparent", childRef, parentRef })
    expect(result).toMatchObject({
      code: 409,
      payload: { state: "conflict", reasonCode: "mutation_revision_conflict" },
    })
    expect(logs).toHaveLength(3)
    expect(logs.every((entry) => !JSON.stringify(entry).includes(childRef))).toBe(true)
    expect(JSON.stringify(logs)).not.toMatch(/parentRef|childRef|actorRef|nonce|payload/iu)
  })

  it("maps non-conflict failures to 422", async () => {
    const handlers = routes({
      execute: async () => ({
        mutationId: "mutation-connect",
        kind: "connect",
        state: "rejected",
        reasonCode: "child_relationship_inactive",
        revision: 18,
        childRef,
        parentRef,
        allowedActions: [],
      }),
    })
    const result = await handlers.get("PATCH /api/agent-workspace/:childRef/parent")?.(
      { params: { childRef }, body: mutation("connect") },
      reply(),
    )
    expect(result).toMatchObject({ code: 422, payload: { state: "rejected" } })
  })

  it("rejects internal references and incomplete envelopes before execution", async () => {
    let calls = 0
    const handlers = routes({
      execute: async () => {
        calls += 1
        throw new Error("not called")
      },
    })
    const handler = handlers.get("PATCH /api/agent-workspace/:childRef/parent")
    const internalRef = await handler?.(
      { params: { childRef: "agent:private" }, body: mutation("connect") },
      reply(),
    )
    const incomplete = await handler?.(
      {
        params: { childRef },
        body: { ...mutation("connect"), mutation: { targetRevision: 19 } },
      },
      reply(),
    )
    const wrongParent = await handler?.(
      {
        params: { childRef },
        body: { ...mutation("connect"), parentRef: "internal-parent-id" },
      },
      reply(),
    )

    expect(internalRef).toEqual({ code: 400, payload: { error: "agent_ref_invalid" } })
    expect(incomplete).toEqual({
      code: 400,
      payload: { error: "agent_relationship_request_invalid" },
    })
    expect(wrongParent).toEqual({
      code: 400,
      payload: { error: "agent_relationship_request_invalid" },
    })
    expect(calls).toBe(0)
  })
})
