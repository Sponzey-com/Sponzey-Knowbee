import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import type { AgentOperationalSettingsProjection } from "../packages/core/src/agents/agent-operational-settings-projection.js"
import { registerAgentWorkspaceRoute } from "../packages/core/src/api/routes/agent-workspace.js"

type Handler = (...args: unknown[]) => unknown
const agentRef = `agent_v1_${"a".repeat(24)}`
const projection: AgentOperationalSettingsProjection = {
  agentRef,
  status: "enabled",
  revision: 7,
  model: {
    configured: true,
    availability: "configured",
    providerName: "openai",
    modelName: "gpt-5",
  },
  memory: {
    retentionPolicy: "long_term",
    capsuleMode: "rolling_summary",
    rawWindowSize: 20,
    compactThreshold: 40,
    writebackReviewRequired: true,
    lastCompactedAt: null,
    capsuleCount: 0,
  },
  permission: {
    riskCeiling: "moderate",
    approvalRequiredFrom: "external",
    allowExternalNetwork: true,
    allowFilesystemWrite: false,
    allowShellExecution: false,
    allowScreenControl: false,
    allowedPathCount: 1,
  },
  diagnosticCodes: [],
  observedAt: 1_000,
}

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
  find(ref: string): AgentOperationalSettingsProjection | null
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
      settingsProjection: (_request, ref) => input.find(ref),
      logger: {
        product: (fields) => input.logs?.push(fields),
        fieldDebug: (fields) => input.logs?.push(fields),
        development: (fields) => input.logs?.push(fields),
      },
    },
  )
  return handlers
}

describe("Task 042 agent operational settings API", () => {
  it("matches the settings route before generic detail in actual Fastify", async () => {
    const app = Fastify({ logger: false })
    registerAgentWorkspaceRoute(app as never, {
      projection: () => ({ items: [], details: [], summary: {} }) as never,
      settingsProjection: () => projection,
    })
    await app.ready()
    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/agent-workspace/${agentRef}/settings`,
      })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ agentRef, revision: 7 })
    } finally {
      await app.close()
    }
  })

  it("returns the public projection with allowlisted log fields", async () => {
    const logs: Array<Record<string, unknown>> = []
    const handlers = routes({ find: () => projection, logs })
    const result = await handlers.get("GET /api/agent-workspace/:agentRef/settings")?.(
      { params: { agentRef } },
      reply(),
    )
    expect(result).toMatchObject({ agentRef, revision: 7, model: { modelName: "gpt-5" } })
    expect(logs).toHaveLength(2)
    expect(JSON.stringify(logs)).not.toMatch(
      /agentRef|providerName|modelName|owner|path|memory|profile/iu,
    )
    expect(JSON.stringify(result)).not.toMatch(/owner|allowedPaths|profileId|secretScope/iu)
  })

  it("distinguishes invalid, missing and archived agents", async () => {
    const handlers = routes({
      find: (ref) => (ref === agentRef ? { ...projection, status: "archived" as const } : null),
    })
    const handler = handlers.get("GET /api/agent-workspace/:agentRef/settings")
    expect(await handler?.({ params: { agentRef: "agent:private" } }, reply())).toEqual({
      code: 400,
      payload: { error: "agent_ref_invalid" },
    })
    expect(
      await handler?.({ params: { agentRef: `agent_v1_${"b".repeat(24)}` } }, reply()),
    ).toEqual({ code: 404, payload: { error: "agent_ref_not_found" } })
    expect(await handler?.({ params: { agentRef } }, reply())).toEqual({
      code: 410,
      payload: { error: "agent_archived" },
    })
  })
})
