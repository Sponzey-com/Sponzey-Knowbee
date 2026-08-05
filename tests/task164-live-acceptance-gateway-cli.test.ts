import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { resolveChannelSmokeGatewayTarget } from "../packages/cli/src/channel-smoke-gateway-client.ts"
import { liveAcceptanceCommand } from "../packages/cli/src/commands/live-acceptance.ts"
import {
  LiveAcceptanceGatewayError,
  requestProductionLiveAcceptance,
} from "../packages/cli/src/live-acceptance-gateway-client.ts"
import {
  type LiveAcceptanceRouteExecutor,
  registerLiveAcceptanceRoute,
} from "../packages/core/src/api/routes/live-acceptance.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  type LiveAcceptanceExecutionRequest,
  validateLiveAcceptanceExecutionRequest,
} from "../packages/core/src/release/live-acceptance-execution-request.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: {
  logger: boolean
}) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: {
    method: string
    url: string
    payload?: unknown
    headers?: Record<string, string>
  }): Promise<{ statusCode: number; json(): unknown }>
}

const NOW = Date.parse("2026-07-17T17:00:00.000Z")
const TOKEN = "task164-secret-token"
const KEY_ID = `sha256:${"a".repeat(64)}` as const
const tempDirs: string[] = []

function requestFixture(): LiveAcceptanceExecutionRequest {
  return {
    kind: "knowbee.release.live_acceptance_execution_request",
    schemaVersion: 2,
    candidate: { appVersion: "0.2.16", gitTag: "v0.2.16", gitCommit: "abc123" },
    authorization: {
      authorizationId: "authorization:task164",
      auditEventId: "audit:authorization:task164",
      approvedAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
    },
    selection: {
      extensions: [
        {
          capability: "skill",
          agentId: "agent:task164",
          bindingId: "binding:task164:skill",
          catalogId: "skill:task164",
          toolName: "task164_skill_read",
          readOnly: true,
          params: {},
        },
        {
          capability: "mcp",
          agentId: "agent:task164",
          bindingId: "binding:task164:mcp",
          catalogId: "task164",
          toolName: "mcp__task164__read",
          readOnly: true,
          params: {},
        },
      ],
      yeonjang: {
        instanceId: "instance:task164",
        sessionId: "session:task164",
        method: "system.info",
        readOnly: true,
      },
    },
    requestedKeyId: KEY_ID,
  }
}

function target() {
  return resolveChannelSmokeGatewayTarget({
    enabled: true,
    host: "0.0.0.0",
    port: 18888,
    auth: { enabled: true, token: TOKEN },
  })
}

function collectedResponse() {
  return {
    status: "collected",
    evidenceCount: 7,
    events: [{ state: "initialized" }, { state: "payload_written" }],
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) rmSync(path, { recursive: true, force: true })
  }
})

describe("Task 164 execution request contract", () => {
  it("accepts exact candidate, authorization window and public key id", () => {
    expect(validateLiveAcceptanceExecutionRequest(requestFixture(), NOW)).toEqual({
      status: "verified",
      request: requestFixture(),
    })
  })

  it.each([
    [{ ...requestFixture(), extra: true }, "live_acceptance_request_shape_invalid"],
    [
      { ...requestFixture(), candidate: { ...requestFixture().candidate, appVersion: "" } },
      "live_acceptance_request_candidate_invalid",
    ],
    [
      {
        ...requestFixture(),
        authorization: { ...requestFixture().authorization, expiresAt: NOW },
      },
      "live_acceptance_request_authorization_expired",
    ],
    [
      { ...requestFixture(), requestedKeyId: "sha256:invalid" },
      "live_acceptance_request_key_invalid",
    ],
  ])("rejects invalid request input", (value, reasonCode) => {
    expect(validateLiveAcceptanceExecutionRequest(value, NOW)).toEqual({
      status: "rejected",
      reasonCode,
    })
  })
})

describe("Task 164 authenticated Gateway route", () => {
  async function appWith(options: Parameters<typeof registerLiveAcceptanceRoute>[1]) {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task164-route-"))
    tempDirs.push(root)
    const app = Fastify({ logger: false })
    const config = structuredClone(DEFAULT_CONFIG)
    config.webui.auth = { enabled: true, token: TOKEN }
    installApiRuntimeConfig(
      app as never,
      config,
      createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false }),
    )
    registerLiveAcceptanceRoute(app as never, options)
    await app.ready()
    return app
  }

  it("constructs approval from the authenticated principal and returns only bounded output", async () => {
    const execute = vi.fn<LiveAcceptanceRouteExecutor>(async (input) => ({
      status: "collected" as const,
      payload: {
        kind: "knowbee.release.live_acceptance_bundle",
        schemaVersion: 2,
        candidate: input.candidate,
        approval: input.approval,
        evidence: Array.from({ length: 7 }, (_, index) => ({
          evidenceRef: `private:evidence:${index}`,
          capability: "webui",
          scenarioId: `private:scenario:${index}`,
          terminalStatus: "passed",
          auditEventId: `private:audit:${index}`,
          executedAt: NOW,
          redactionStatus: "verified",
        })),
      },
      events: [{ state: "initialized" }, { state: "payload_written" }],
    }))
    const app = await appWith({ enabled: true, execute, now: () => NOW })
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/live-acceptance/runs",
        payload: requestFixture(),
        headers: { authorization: `Bearer ${TOKEN}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual(collectedResponse())
      expect(execute).toHaveBeenCalledOnce()
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          candidate: requestFixture().candidate,
          requestedKeyId: KEY_ID,
          signal: expect.any(AbortSignal),
          approval: expect.objectContaining({
            principalId: "api:static-token-owner",
            authenticationId: "static_bearer_token",
            roles: ["release_administrator"],
          }),
        }),
      )
      expect(JSON.stringify(response.json())).not.toMatch(/private:|authorization:task164|audit:/u)
    } finally {
      await app.close()
    }
  })

  it("fails closed before execution when unauthenticated, disabled or unavailable", async () => {
    const execute = vi.fn()
    for (const [options, expectedStatus, authorized] of [
      [{ enabled: true, execute, now: () => NOW }, 403, false],
      [{ enabled: false, execute, now: () => NOW }, 400, true],
      [{ enabled: true, now: () => NOW }, 503, true],
    ] as const) {
      const app = await appWith(options)
      try {
        const response = await app.inject({
          method: "POST",
          url: "/api/live-acceptance/runs",
          payload: requestFixture(),
          ...(authorized ? { headers: { authorization: `Bearer ${TOKEN}` } } : {}),
        })
        expect(response.statusCode).toBe(expectedStatus)
      } finally {
        await app.close()
      }
    }
    expect(execute).not.toHaveBeenCalled()
  })
})

describe("Task 164 Gateway client and CLI", () => {
  it("posts one bounded authenticated request and freezes the safe response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(collectedResponse()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )

    const result = await requestProductionLiveAcceptance({
      target: target(),
      executionRequest: requestFixture(),
      request: fetcher,
      timeoutMs: 1_000,
      maxResponseBytes: 16_384,
    })

    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:18888/api/live-acceptance/runs",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestFixture()),
      }),
    )
    expect(result).toEqual(collectedResponse())
    expect(Object.isFrozen(result)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  it("rejects blocked, malformed, oversized and HTTP failure responses without exposing bodies", async () => {
    const cases: Array<[typeof fetch, string, number]> = [
      [
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(
            JSON.stringify({
              status: "blocked",
              blockers: [{ capability: "web", reasonCode: "private-reason" }],
              events: [{ state: "blocked" }],
            }),
          ),
        ),
        "live_acceptance_not_collected",
        16_384,
      ],
      [
        vi.fn<typeof fetch>().mockResolvedValue(new Response("private-body")),
        "gateway_response_json_invalid",
        16_384,
      ],
      [
        vi.fn<typeof fetch>().mockResolvedValue(new Response("x".repeat(2_000))),
        "gateway_response_too_large",
        256,
      ],
      [
        vi.fn<typeof fetch>().mockResolvedValue(new Response("private-body", { status: 503 })),
        "gateway_http_failure",
        16_384,
      ],
    ]
    for (const [request, code, maxResponseBytes] of cases) {
      const error = await requestProductionLiveAcceptance({
        target: target(),
        executionRequest: requestFixture(),
        request,
        timeoutMs: 1_000,
        maxResponseBytes,
      }).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(LiveAcceptanceGatewayError)
      expect(error).toEqual(expect.objectContaining({ code }))
      expect(String(error)).not.toMatch(/private-body|private-reason|task164-secret/u)
    }
  })

  it("prints only the safe collected projection and calls Gateway once", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(collectedResponse()), { status: 200 }))
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const config = structuredClone(DEFAULT_CONFIG)
    config.webui.auth = { enabled: true, token: TOKEN }

    await liveAcceptanceCommand(
      { json: true },
      {
        runtimeConfig: config,
        liveEnabled: true,
        executionRequest: requestFixture(),
        request: fetcher,
      },
    )

    const rendered = output.mock.calls.flat().join("\n")
    expect(fetcher).toHaveBeenCalledOnce()
    expect(rendered).toContain('"status": "collected"')
    expect(rendered).not.toMatch(/task164-secret|authorization:task164|audit:/u)
  })

  it("keeps direct env/provider access out of route, client and command", () => {
    const sources = [
      "packages/core/src/api/routes/live-acceptance.ts",
      "packages/cli/src/live-acceptance-gateway-client.ts",
      "packages/cli/src/commands/live-acceptance.ts",
    ]
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
    expect(sources).not.toContain("process.env")
    expect(sources).not.toMatch(/provider-direct|telegram\/adapter|slack\/adapter/u)
  })
})
