import { describe, expect, it } from "vitest"
import { registerAgentWorkspaceRoute } from "../packages/core/src/api/routes/agent-workspace.js"

type Handler = (...args: unknown[]) => unknown

const item = {
  agentRef: `agent_v1_${"a".repeat(24)}`,
  name: "Researcher",
  role: "Research",
  status: "enabled" as const,
  profileVersion: 1,
  updatedAt: 1_000,
  model: { configured: true, availability: "ready" as const, modelName: "worker" },
  parentName: "마당쇠",
  directChildCount: 0,
  bindingCounts: { skills: 1, mcpServers: 0, yeonjang: 1 },
  diagnosticCodes: [],
}
const projection = {
  items: [item],
  details: [
    {
      ...item,
      bindingNames: { skills: ["UI UX Pro Max"], mcpServers: [], yeonjang: ["Studio Mac"] },
      directChildNames: [],
    },
  ],
  summary: {
    total: 1,
    enabled: 1,
    disabled: 0,
    archived: 0,
    degraded: 0,
    issueCount: 0,
    diagnosticCodes: [],
  },
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

describe("Task 037 agent workspace API", () => {
  it("serves bounded list and opaque detail while rejecting internal ids", async () => {
    const handlers = new Map<string, Handler>()
    registerAgentWorkspaceRoute(
      {
        get(path: string, _options: unknown, handler: Handler) {
          handlers.set(path, handler)
        },
        post(path: string, _options: unknown, handler: Handler) {
          handlers.set(`POST ${path}`, handler)
        },
        patch(path: string, _options: unknown, handler: Handler) {
          handlers.set(`PATCH ${path}`, handler)
        },
      } as never,
      { projection: () => projection },
    )
    const list = await handlers.get("/api/agent-workspace")?.(
      { query: { limit: "1", search: "research" } },
      reply(),
    )
    expect(list).toMatchObject({
      items: [{ agentRef: item.agentRef, name: "Researcher" }],
      cursorValid: true,
    })
    const detail = await handlers.get("/api/agent-workspace/:agentRef")?.(
      { params: { agentRef: item.agentRef } },
      reply(),
    )
    expect(detail).toMatchObject({
      ...item,
      bindingNames: { skills: ["UI UX Pro Max"], mcpServers: [], yeonjang: ["Studio Mac"] },
    })
    const rejected = await handlers.get("/api/agent-workspace/:agentRef")?.(
      { params: { agentRef: "agent:private" } },
      reply(),
    )
    expect(rejected).toEqual({ code: 400, payload: { error: "agent_ref_invalid" } })
    expect(JSON.stringify({ list, detail })).not.toMatch(
      /agent:private|agentId|bindingId|catalogId|prompt|memory/iu,
    )
  })
})
