import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import type {
  AgentOperationalSettingsCommand,
  AgentOperationalSettingsMutationReceipt,
} from "../packages/core/src/agents/agent-operational-settings-command.js"
import { registerAgentWorkspaceRoute } from "../packages/core/src/api/routes/agent-workspace.js"

type Handler = (...args: unknown[]) => unknown
const agentRef = `agent_v1_${"a".repeat(24)}`
const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: {
  logger: boolean
}) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: {
    method: string
    url: string
    headers?: Record<string, string>
    payload?: unknown
  }): Promise<{ statusCode: number; json(): unknown }>
}

function receipt(
  input: Partial<AgentOperationalSettingsMutationReceipt> = {},
): AgentOperationalSettingsMutationReceipt {
  return {
    mutationId: "agent-settings:request-12345678",
    kind: "update_model",
    state: "active",
    reasonCode: null,
    revision: 2,
    agentRef,
    allowedActions: [],
    ...input,
  }
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
  execute(
    command: AgentOperationalSettingsCommand,
  ): Promise<AgentOperationalSettingsMutationReceipt>
  commands?: AgentOperationalSettingsCommand[]
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
      now: () => 1_000,
      createMutationId: () => "server-generated-id",
      executeOperationalSettingsCommand: async (_request, command) => {
        input.commands?.push(command)
        return input.execute(command)
      },
      logger: {
        product: (fields) => input.logs?.push(fields),
        fieldDebug: (fields) => input.logs?.push(fields),
        development: (fields) => input.logs?.push(fields),
      },
    },
  )
  return handlers
}

function request(body: unknown, idempotencyKey = "request-12345678") {
  return {
    params: { agentRef },
    body,
    headers: { "idempotency-key": idempotencyKey },
  }
}

describe("Task 044 operational settings PATCH API", () => {
  it("matches the settings mutation route before generic agent update", async () => {
    const app = Fastify({ logger: false })
    registerAgentWorkspaceRoute(app as never, {
      projection: () => ({ items: [], details: [], summary: {} }) as never,
      now: () => 1_000,
      executeOperationalSettingsCommand: async () => receipt(),
    })
    await app.ready()
    try {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/agent-workspace/${agentRef}/settings`,
        headers: { "idempotency-key": "request-12345678" },
        payload: {
          kind: "update_model",
          targetRevision: 2,
          value: { providerName: "openai", modelName: "gpt-5" },
        },
      })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ state: "active", revision: 2 })
    } finally {
      await app.close()
    }
  })

  it("builds the envelope on the server and reuses an explicit idempotency key", async () => {
    const commands: AgentOperationalSettingsCommand[] = []
    const stableReceipt = receipt()
    const handlers = routes({ execute: async () => stableReceipt, commands })
    const handler = handlers.get("PATCH /api/agent-workspace/:agentRef/settings")
    const body = {
      kind: "update_model",
      targetRevision: 2,
      value: {
        providerName: "provider-payload-marker",
        modelName: "model-payload-marker",
        effort: "high",
      },
    }
    expect(await handler?.(request(body), reply())).toMatchObject({
      code: 200,
      payload: stableReceipt,
    })
    expect(await handler?.(request(body), reply())).toMatchObject({ payload: stableReceipt })
    expect(commands).toHaveLength(2)
    expect(commands[0]?.envelope).toEqual({
      actorRef: "webui",
      scope: "agent_settings:write",
      mutationId: "agent-settings:request-12345678",
      targetRevision: 2,
      purpose: "agent_settings_update_model",
      issuedAt: 1_000,
      nonce: "agent-settings:request-12345678",
    })
    expect(commands[1]?.envelope).toEqual(commands[0]?.envelope)
  })

  it("rejects extra, private and incorrectly typed fields before command execution", async () => {
    const commands: AgentOperationalSettingsCommand[] = []
    const handlers = routes({ execute: async () => receipt(), commands })
    const handler = handlers.get("PATCH /api/agent-workspace/:agentRef/settings")
    const invalidBodies = [
      {
        kind: "update_model",
        targetRevision: 2,
        value: { providerName: "openai", modelName: "gpt-5", timeoutMs: 5_000 },
      },
      {
        kind: "update_memory",
        targetRevision: 2,
        value: {
          retentionPolicy: "long_term",
          capsuleMode: "rolling_summary",
          rawWindowSize: "20",
          compactThreshold: 40,
          writebackReviewRequired: true,
        },
      },
      {
        kind: "update_permission",
        targetRevision: 2,
        value: {
          riskCeiling: "safe",
          approvalRequiredFrom: "external",
          allowExternalNetwork: false,
          allowFilesystemWrite: false,
          allowShellExecution: false,
          allowScreenControl: false,
          allowedPaths: ["/private"],
        },
      },
    ]
    for (const body of invalidBodies)
      expect(await handler?.(request(body), reply())).toEqual({
        code: 400,
        payload: { error: "agent_settings_request_invalid" },
      })
    expect(commands).toHaveLength(0)
  })

  it("uses elevated scope only after explicit permission confirmation", async () => {
    const commands: AgentOperationalSettingsCommand[] = []
    const handlers = routes({
      execute: async (command) =>
        command.envelope.scope === "agent_permission:elevate"
          ? receipt({ kind: "update_permission" })
          : receipt({
              kind: "update_permission",
              state: "rejected",
              reasonCode: "mutation_scope_denied",
              revision: 1,
            }),
      commands,
    })
    const handler = handlers.get("PATCH /api/agent-workspace/:agentRef/settings")
    const value = {
      riskCeiling: "external",
      approvalRequiredFrom: "external",
      allowExternalNetwork: true,
      allowFilesystemWrite: false,
      allowShellExecution: false,
      allowScreenControl: false,
    }
    expect(
      await handler?.(request({ kind: "update_permission", targetRevision: 2, value }), reply()),
    ).toMatchObject({ code: 403 })
    expect(
      await handler?.(
        request({
          kind: "update_permission",
          targetRevision: 2,
          value,
          confirmElevation: true,
        }),
        reply(),
      ),
    ).toMatchObject({ code: 200 })
    expect(commands.map((command) => command.envelope.scope)).toEqual([
      "agent_settings:write",
      "agent_permission:elevate",
    ])
  })

  it.each([
    ["active", null, 200],
    ["conflict", "mutation_revision_conflict", 409],
    ["rejected", "agent_ref_not_found", 404],
    ["rejected", "agent_settings_inactive", 410],
    ["rejected", "agent_update_model_invalid", 400],
    ["rolled_back", "forced_verify_failure", 422],
  ] as const)("maps %s/%s to HTTP %s", async (state, reasonCode, status) => {
    const handlers = routes({
      execute: async () => receipt({ state, reasonCode, revision: state === "active" ? 2 : 1 }),
    })
    const result = await handlers.get("PATCH /api/agent-workspace/:agentRef/settings")?.(
      request({
        kind: "update_model",
        targetRevision: 2,
        value: { providerName: "openai", modelName: "gpt-5" },
      }),
      reply(),
    )
    expect(result).toMatchObject({ code: status })
  })

  it("keeps payload values and internal ids out of all log levels", async () => {
    const logs: Array<Record<string, unknown>> = []
    const handlers = routes({
      execute: async () =>
        receipt({ state: "rolled_back", reasonCode: "verification_failed", revision: 1 }),
      logs,
    })
    await handlers.get("PATCH /api/agent-workspace/:agentRef/settings")?.(
      request({
        kind: "update_model",
        targetRevision: 2,
        value: {
          providerName: "provider-payload-marker",
          modelName: "model-payload-marker",
        },
      }),
      reply(),
    )
    expect(logs).toHaveLength(3)
    expect(JSON.stringify(logs)).not.toMatch(
      /provider-payload-marker|model-payload-marker|agent:private/iu,
    )
  })
})
