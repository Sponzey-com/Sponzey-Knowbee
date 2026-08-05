import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { liveAcceptanceCommand } from "../packages/cli/src/commands/live-acceptance.ts"
import {
  LiveAcceptanceGatewayError,
  requestLiveAcceptanceReadiness,
} from "../packages/cli/src/live-acceptance-gateway-client.ts"
import { registerLiveAcceptanceRoute } from "../packages/core/src/api/routes/live-acceptance.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import type { LiveAcceptanceRuntimeIdentityAdmission } from "../packages/core/src/release/live-acceptance-runtime-identity.ts"

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
    remoteAddress?: string
  }): Promise<{ statusCode: number; json(): unknown }>
}

const TOKEN = "task177-token"
const roots: string[] = []
const READY_CAPABILITIES = Object.freeze([
  Object.freeze({ capability: "webui" as const, status: "ready" as const }),
  Object.freeze({ capability: "telegram" as const, status: "ready" as const }),
  Object.freeze({ capability: "slack" as const, status: "ready" as const }),
  Object.freeze({ capability: "web" as const, status: "ready" as const }),
  Object.freeze({ capability: "skill" as const, status: "ready" as const }),
  Object.freeze({ capability: "mcp" as const, status: "ready" as const }),
  Object.freeze({ capability: "yeonjang" as const, status: "ready" as const }),
])

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? "", { recursive: true, force: true })
})

async function appWith(
  options: Parameters<typeof registerLiveAcceptanceRoute>[1],
  authEnabled = true,
  inspectRuntimeIdentity: () => LiveAcceptanceRuntimeIdentityAdmission = () => ({
    status: "verified",
    receipt: {
      buildId: "build:task177",
      bundleSha256: `sha256:${"a".repeat(64)}`,
      processStartedAt: "2026-07-28T09:00:00.000Z",
      artifactBuiltAt: "2026-07-28T08:59:00.000Z",
      buildRequired: false,
      restartRequired: false,
    },
  }),
) {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task177-"))
  roots.push(root)
  const app = Fastify({ logger: false })
  const config = structuredClone(DEFAULT_CONFIG)
  config.webui.auth = { enabled: authEnabled, token: TOKEN }
  installApiRuntimeConfig(
    app as never,
    config,
    createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false }),
  )
  registerLiveAcceptanceRoute(app as never, {
    ...options,
    inspectReadiness: options.inspectReadiness ?? (() => READY_CAPABILITIES),
    inspectRuntimeIdentity,
  } as Parameters<typeof registerLiveAcceptanceRoute>[1])
  await app.ready()
  return app
}

describe("Task 177 live acceptance readiness route", () => {
  it("returns bounded readiness only to an authenticated administrator", async () => {
    const execute = vi.fn()
    const app = await appWith({ enabled: true, execute, now: Date.now })
    try {
      const authorized = await app.inject({
        method: "GET",
        url: "/api/live-acceptance/readiness",
        headers: { authorization: `Bearer ${TOKEN}` },
      })
      const denied = await app.inject({
        method: "GET",
        url: "/api/live-acceptance/readiness",
      })

      expect(authorized.statusCode).toBe(200)
      expect(authorized.json()).toEqual({
        status: "ready",
        capabilities: READY_CAPABILITIES,
      })
      expect(denied.statusCode).toBe(403)
      expect(execute).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it("accepts the exact local administrator token when general WebUI auth is disabled", async () => {
    const execute = vi.fn()
    const app = await appWith({ enabled: true, execute, now: Date.now }, false)
    try {
      const authorized = await app.inject({
        method: "GET",
        url: "/api/live-acceptance/readiness",
        headers: { authorization: `Bearer ${TOKEN}` },
      })
      const missing = await app.inject({
        method: "GET",
        url: "/api/live-acceptance/readiness",
      })
      const incorrect = await app.inject({
        method: "GET",
        url: "/api/live-acceptance/readiness",
        headers: { authorization: "Bearer incorrect-token" },
      })

      expect(authorized.statusCode).toBe(200)
      expect(authorized.json()).toEqual({
        status: "ready",
        capabilities: READY_CAPABILITIES,
      })
      expect(missing.statusCode).toBe(403)
      expect(incorrect.statusCode).toBe(403)
      expect(execute).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it("does not grant administrator access to a remote token when WebUI auth is disabled", async () => {
    const execute = vi.fn()
    const app = await appWith({ enabled: true, execute, now: Date.now }, false)
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/live-acceptance/readiness",
        headers: { authorization: `Bearer ${TOKEN}` },
        remoteAddress: "203.0.113.10",
      })

      expect(response.statusCode).toBe(403)
      expect(execute).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })

  it.each([
    [false, true, { status: "disabled", reasonCode: "live_acceptance_disabled" }],
    [
      true,
      false,
      {
        status: "unavailable",
        reasonCode: "live_acceptance_executor_unavailable",
        capabilities: READY_CAPABILITIES,
      },
    ],
  ] as const)(
    "projects enabled=%s executor=%s without invoking execution",
    async (enabled, present, expected) => {
      const execute = vi.fn()
      const app = await appWith({
        enabled,
        ...(present ? { execute } : {}),
        now: Date.now,
      })
      try {
        const response = await app.inject({
          method: "GET",
          url: "/api/live-acceptance/readiness",
          headers: { authorization: `Bearer ${TOKEN}` },
        })

        expect(response.statusCode).toBe(200)
        expect(response.json()).toEqual(expected)
        expect(execute).not.toHaveBeenCalled()
      } finally {
        await app.close()
      }
    },
  )

  it("reports bounded capability blockers without exposing target identifiers", async () => {
    const capabilities = Object.freeze([
      ...READY_CAPABILITIES.slice(0, 1),
      Object.freeze({
        capability: "telegram" as const,
        status: "unavailable" as const,
        reasonCode: "live_acceptance_telegram_target_unavailable" as const,
      }),
      ...READY_CAPABILITIES.slice(2),
    ])
    const app = await appWith({
      enabled: true,
      execute: vi.fn(),
      inspectReadiness: () => capabilities,
      now: Date.now,
    })
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/live-acceptance/readiness",
        headers: { authorization: `Bearer ${TOKEN}` },
      })

      expect(response.json()).toEqual({
        status: "unavailable",
        reasonCode: "live_acceptance_prerequisites_unavailable",
        capabilities,
      })
      expect(JSON.stringify(response.json())).not.toMatch(/chatId|userId|threadId|token/u)
    } finally {
      await app.close()
    }
  })

  it("blocks readiness when the active Gateway bundle requires restart", async () => {
    const execute = vi.fn()
    const app = await appWith(
      { enabled: true, execute, now: Date.now },
      true,
      () => ({
        status: "blocked",
        reasonCode: "live_acceptance_runtime_restart_required",
      }),
    )
    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/live-acceptance/readiness",
        headers: { authorization: `Bearer ${TOKEN}` },
      })

      expect(response.json()).toEqual({
        status: "unavailable",
        reasonCode: "live_acceptance_runtime_restart_required",
      })
      expect(execute).not.toHaveBeenCalled()
    } finally {
      await app.close()
    }
  })
})

const target = Object.freeze({
  origin: "http://127.0.0.1:18888",
  bearerToken: TOKEN,
})

describe("Task 177 bounded readiness client", () => {
  it.each([
    [
      { status: "ready", capabilities: READY_CAPABILITIES },
      { status: "ready", capabilities: READY_CAPABILITIES },
    ],
    [
      { status: "disabled", reasonCode: "live_acceptance_disabled" },
      { status: "disabled", reasonCode: "live_acceptance_disabled" },
    ],
    [
      {
        status: "unavailable",
        reasonCode: "live_acceptance_executor_unavailable",
        capabilities: READY_CAPABILITIES,
      },
      {
        status: "unavailable",
        reasonCode: "live_acceptance_executor_unavailable",
        capabilities: READY_CAPABILITIES,
      },
    ],
  ] as const)("accepts exact bounded projection %#", async (payload, expected) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
      }),
    )

    const result = await requestLiveAcceptanceReadiness({
      target,
      request,
      timeoutMs: 1_000,
      maxResponseBytes: 4_096,
    })

    expect(result).toEqual(expected)
    expect(Object.isFrozen(result)).toBe(true)
    expect(request).toHaveBeenCalledWith(
      "http://127.0.0.1:18888/api/live-acceptance/readiness",
      expect.objectContaining({
        method: "GET",
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    )
  })

  it.each([
    [new Response("private failure", { status: 503 }), "gateway_http_failure", 4_096],
    [
      new Response(JSON.stringify({ status: "ready", secret: "private" })),
      "gateway_response_schema_invalid",
      4_096,
    ],
    [new Response("x".repeat(1_000)), "gateway_response_too_large", 128],
  ] as const)("rejects unsafe response %#", async (response, code, maxResponseBytes) => {
    const error = await requestLiveAcceptanceReadiness({
      target,
      request: vi.fn<typeof fetch>().mockResolvedValue(response),
      timeoutMs: 1_000,
      maxResponseBytes,
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(LiveAcceptanceGatewayError)
    expect(error).toEqual(expect.objectContaining({ code }))
    expect(String(error)).not.toMatch(/private failure|secret/u)
  })
})

describe("Task 177 CLI readiness check", () => {
  it("checks readiness without a request file or execution enable flag", async () => {
    const config = structuredClone(DEFAULT_CONFIG)
    config.webui.auth = { enabled: false, token: TOKEN }
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "ready", capabilities: READY_CAPABILITIES })),
      )
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined)

    await liveAcceptanceCommand(
      { check: true, json: true },
      { runtimeConfig: config, liveEnabled: false, request },
    )

    expect(request).toHaveBeenCalledOnce()
    expect(request).toHaveBeenCalledWith(
      "http://127.0.0.1:18888/api/live-acceptance/readiness",
      expect.objectContaining({
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    )
    expect(output.mock.calls.flat().join("\n")).toContain('"capability": "yeonjang"')
  })

  it("rejects mixing readiness check with an execution request", async () => {
    const error = await liveAcceptanceCommand(
      { check: true, requestPath: "/private/request.json" },
      { runtimeConfig: DEFAULT_CONFIG },
    ).catch((caught: unknown) => caught)

    expect(error).toEqual(new Error("live_acceptance_check_request_conflict"))
  })

  it("returns a failing command result when bounded prerequisites are unavailable", async () => {
    const config = structuredClone(DEFAULT_CONFIG)
    config.webui.auth = { enabled: false, token: TOKEN }
    const blockedCapabilities = Object.freeze([
      ...READY_CAPABILITIES.slice(0, 1),
      Object.freeze({
        capability: "telegram" as const,
        status: "unavailable" as const,
        reasonCode: "live_acceptance_telegram_target_unavailable" as const,
      }),
      ...READY_CAPABILITIES.slice(2),
    ])
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined)

    const error = await liveAcceptanceCommand(
      { check: true, json: true },
      {
        runtimeConfig: config,
        request: vi.fn<typeof fetch>().mockResolvedValue(
          new Response(
            JSON.stringify({
              status: "unavailable",
              reasonCode: "live_acceptance_prerequisites_unavailable",
              capabilities: blockedCapabilities,
            }),
          ),
        ),
      },
    ).catch((caught: unknown) => caught)

    expect(error).toEqual(new Error("live_acceptance_readiness_unavailable"))
    expect(output.mock.calls.flat().join("\n")).toContain(
      '"reasonCode": "live_acceptance_telegram_target_unavailable"',
    )
  })

  it("rejects readiness before transport when no administrator token is configured", async () => {
    const config = structuredClone(DEFAULT_CONFIG)
    config.webui.auth = { enabled: false }
    const request = vi.fn<typeof fetch>()

    const error = await liveAcceptanceCommand(
      { check: true, json: true },
      { runtimeConfig: config, request },
    ).catch((caught: unknown) => caught)

    expect(error).toEqual(expect.objectContaining({ code: "gateway_administrator_token_missing" }))
    expect(request).not.toHaveBeenCalled()
  })
})
