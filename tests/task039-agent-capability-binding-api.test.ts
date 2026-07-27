import { describe, expect, it } from "vitest"
import type { AgentCapabilityBindingReceipt } from "../packages/core/src/agents/agent-capability-binding-command.js"
import type { AgentCapabilityBindingProjection } from "../packages/core/src/agents/agent-capability-binding-projection.js"
import { registerAgentWorkspaceRoute } from "../packages/core/src/api/routes/agent-workspace.js"

type Handler = (...args: unknown[]) => unknown

const agentRef = `agent_v1_${"a".repeat(24)}`
const skillRef = `skill_v1_${"b".repeat(24)}`
const projection: AgentCapabilityBindingProjection = {
  agentRef,
  items: [
    {
      capabilityRef: skillRef,
      kind: "skill",
      displayName: "UI UX Pro Max",
      catalogStatus: "enabled",
      runtimeStatus: "ready",
      bound: false,
      editable: true,
      revision: 7,
      reasonCodes: [],
    },
  ],
  orphanReasonCodes: [],
  revisions: { skill: 7, mcp_server: 3, yeonjang: 2 },
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

function routes(execute: (body: unknown) => Promise<AgentCapabilityBindingReceipt>) {
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
      capabilityProjection: (_request, ref) => (ref === agentRef ? projection : null),
      executeCapabilityBindingCommand: (_request, command) => execute(command),
    },
  )
  return handlers
}

describe("Task 039 agent capability binding API", () => {
  it("returns a bounded public projection and rejects internal references", async () => {
    const handlers = routes(async () => {
      throw new Error("not called")
    })
    const result = await handlers.get("GET /api/agent-workspace/:agentRef/capabilities")?.(
      { params: { agentRef }, query: { kind: "skill", search: "UI", limit: "999" } },
      reply(),
    )
    expect(result).toMatchObject({
      agentRef,
      items: [{ capabilityRef: skillRef, displayName: "UI UX Pro Max", bound: false }],
      revisions: { skill: 7 },
    })
    expect(JSON.stringify(result)).not.toMatch(
      /internalId|agentId|catalogId|bindingId|prompt|memory/iu,
    )
    const rejected = await handlers.get("GET /api/agent-workspace/:agentRef/capabilities")?.(
      { params: { agentRef: "agent:private" }, query: {} },
      reply(),
    )
    expect(rejected).toEqual({ code: 400, payload: { error: "agent_ref_invalid" } })
  })

  it("accepts a complete opaque mutation and maps conflict without leaking internals", async () => {
    let received: unknown
    const handlers = routes(async (command) => {
      received = command
      return {
        mutationId: "mutation-1",
        kind: "skill",
        state: "conflict",
        reasonCode: "capability_revision_conflict",
        revision: 7,
        agentRef,
        capabilityRef: skillRef,
        bound: false,
        allowedActions: ["retry"],
      }
    })
    const result = await handlers.get(
      "PATCH /api/agent-workspace/:agentRef/capabilities/:capabilityRef",
    )?.(
      {
        params: { agentRef, capabilityRef: skillRef },
        body: {
          kind: "skill",
          bound: true,
          mutation: {
            actorRef: "webui",
            scope: "capability:write",
            mutationId: "mutation-1",
            targetRevision: 8,
            purpose: "skill_bind",
            issuedAt: 1_000,
            nonce: "nonce-1",
          },
        },
      },
      reply(),
    )
    expect(received).toMatchObject({
      agentRef,
      capabilityRef: skillRef,
      kind: "skill",
      bound: true,
    })
    expect(result).toMatchObject({
      code: 409,
      payload: { state: "conflict", reasonCode: "capability_revision_conflict" },
    })
    expect(JSON.stringify(result)).not.toMatch(/internalId|agentId|catalogId|bindingId/iu)
  })

  it("rejects mismatched capability kinds and incomplete envelopes before execution", async () => {
    let calls = 0
    const handlers = routes(async () => {
      calls += 1
      throw new Error("not called")
    })
    const handler = handlers.get("PATCH /api/agent-workspace/:agentRef/capabilities/:capabilityRef")
    const wrongKind = await handler?.(
      { params: { agentRef, capabilityRef: skillRef }, body: { kind: "mcp_server", bound: true } },
      reply(),
    )
    expect(wrongKind).toEqual({
      code: 400,
      payload: { error: "agent_capability_binding_request_invalid" },
    })
    expect(calls).toBe(0)
  })
})
