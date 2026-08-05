import { describe, expect, it } from "vitest"
import type {
  AgentIdentityCommand,
  AgentIdentityMutationReceipt,
} from "../packages/core/src/agents/agent-identity-command.js"
import { registerAgentWorkspaceRoute } from "../packages/core/src/api/routes/agent-workspace.js"

type Handler = (...args: unknown[]) => unknown
const ref = `agent_v1_${"a".repeat(24)}`
const projection = {
  items: [],
  details: [],
  summary: {
    total: 0,
    enabled: 0,
    disabled: 0,
    archived: 0,
    degraded: 0,
    issueCount: 0,
    diagnosticCodes: [],
  },
  observedAt: 1,
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
function register(execute: (command: AgentIdentityCommand) => AgentIdentityMutationReceipt) {
  const handlers = new Map<string, Handler>()
  const app = {
    get(path: string, _options: unknown, handler: Handler) {
      handlers.set(`GET ${path}`, handler)
    },
    post(path: string, _options: unknown, handler: Handler) {
      handlers.set(`POST ${path}`, handler)
    },
    patch(path: string, _options: unknown, handler: Handler) {
      handlers.set(`PATCH ${path}`, handler)
    },
  }
  registerAgentWorkspaceRoute(app as never, {
    projection: () => projection,
    executeIdentityCommand: (_request, command) => execute(command),
  })
  return handlers
}
const mutation = {
  mutationId: "m1",
  nonce: "secret-nonce",
  actorRef: "webui",
  scope: "agent_identity",
}

describe("Task 038 agent identity API", () => {
  it("accepts create and returns only public receipt fields", async () => {
    let received: AgentIdentityCommand | null = null
    const handlers = register((command) => {
      received = command
      return {
        mutationId: "m1",
        nonce: "secret-nonce",
        requestSignature: "private",
        kind: "create",
        state: "active",
        agentRef: ref,
        revision: 1,
        name: "Writer",
        role: "Drafts",
        transitions: ["draft", "validating", "persisting", "verifying", "active"],
      }
    })
    const result = await handlers.get("POST /api/agent-workspace")?.(
      { body: { mutation, name: "Writer", role: "Drafts" } },
      reply(),
    )
    expect(received).toMatchObject({ kind: "create", name: "Writer", role: "Drafts" })
    expect(result).toMatchObject({ code: 200, payload: { state: "active", agentRef: ref } })
    expect(JSON.stringify(result)).not.toMatch(/secret-nonce|requestSignature|agentId/iu)
  })

  it("requires opaque refs and maps stale revisions to conflict", async () => {
    const handlers = register((command) => ({
      mutationId: "m1",
      nonce: "secret-nonce",
      requestSignature: "private",
      kind: command.kind,
      state: "conflict",
      reasonCode: "agent_revision_conflict",
      transitions: ["draft", "validating", "conflict"],
    }))
    const rejected = await handlers.get("PATCH /api/agent-workspace/:agentRef")?.(
      { params: { agentRef: "agent:private" }, body: {} },
      reply(),
    )
    expect(rejected).toEqual({ code: 400, payload: { error: "agent_ref_invalid" } })
    const conflict = await handlers.get("PATCH /api/agent-workspace/:agentRef")?.(
      { params: { agentRef: ref }, body: { mutation, baseRevision: 1, name: "New", role: "Role" } },
      reply(),
    )
    expect(conflict).toMatchObject({
      code: 409,
      payload: { state: "conflict", reasonCode: "agent_revision_conflict" },
    })
  })

  it("requires explicit archive confirmation in the command", async () => {
    let confirmed: boolean | undefined
    const handlers = register((command) => {
      confirmed = command.confirmed
      return {
        mutationId: "m1",
        nonce: "secret-nonce",
        requestSignature: "private",
        kind: "archive",
        state: "cancelled",
        reasonCode: "agent_archive_confirmation_required",
        transitions: ["draft", "validating", "cancelled"],
      }
    })
    const result = await handlers.get("POST /api/agent-workspace/:agentRef/archive")?.(
      { params: { agentRef: ref }, body: { mutation, baseRevision: 1, confirmed: false } },
      reply(),
    )
    expect(confirmed).toBe(false)
    expect(result).toMatchObject({ code: 400, payload: { state: "cancelled" } })
  })
})
