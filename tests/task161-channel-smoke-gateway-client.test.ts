import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  ChannelSmokeGatewayError,
  requestLiveChannelSmoke,
  resolveChannelSmokeGatewayTarget,
} from "../packages/cli/src/channel-smoke-gateway-client.ts"
import { channelSmokeCommand } from "../packages/cli/src/commands/smoke.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"

const TOKEN = "task161-secret-token"

function responseBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    mode: "live-run",
    runId: "smoke-run:161",
    status: "passed",
    counts: { total: 1, passed: 1, failed: 0, skipped: 0 },
    summary: "channel smoke passed",
    results: [
      {
        scenarioId: "webui.basic_query",
        channel: "webui",
        kind: "basic_query",
        status: "passed",
        failures: [],
        auditLogId: "audit:161",
      },
    ],
    ...overrides,
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

function fetchResponse(body: unknown, init: ResponseInit = {}): typeof fetch {
  return vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
      ...init,
    }),
  )
}

describe("Task 161 channel smoke Gateway target", () => {
  it("normalizes wildcard bind hosts to an immutable loopback target", () => {
    const resolved = target()

    expect(resolved).toEqual({
      origin: "http://127.0.0.1:18888",
      bearerToken: TOKEN,
    })
    expect(Object.isFrozen(resolved)).toBe(true)
  })

  it.each([
    [
      { enabled: false, host: "127.0.0.1", port: 18888, auth: { enabled: false } },
      "gateway_disabled",
    ],
    [
      { enabled: true, host: "http://attacker.test", port: 18888, auth: { enabled: false } },
      "gateway_host_invalid",
    ],
    [
      { enabled: true, host: "127.0.0.1/path", port: 18888, auth: { enabled: false } },
      "gateway_host_invalid",
    ],
    [
      { enabled: true, host: "127.0.0.1", port: 0, auth: { enabled: false } },
      "gateway_port_invalid",
    ],
    [
      { enabled: true, host: "127.0.0.1", port: 18888, auth: { enabled: true } },
      "gateway_auth_token_missing",
    ],
  ])("rejects invalid startup target snapshots", (config, code) => {
    expect(() => resolveChannelSmokeGatewayTarget(config)).toThrowError(
      expect.objectContaining({ code }),
    )
  })
})

describe("Task 161 channel smoke Gateway client", () => {
  it("posts one live request with the captured bearer token and returns a frozen projection", async () => {
    const request = fetchResponse(responseBody())

    const result = await requestLiveChannelSmoke({
      target: target(),
      channel: "webui",
      request,
      timeoutMs: 1_000,
      maxResponseBytes: 16_384,
    })

    expect(request).toHaveBeenCalledOnce()
    const call = vi.mocked(request).mock.calls[0]
    if (!call) throw new Error("expected one Gateway request")
    const [url, init] = call
    expect(url).toBe("http://127.0.0.1:18888/api/channel-smoke/runs")
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ mode: "live-run", channel: "webui" }),
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(result.mode).toBe("live-run")
    expect(result.status).toBe("passed")
    expect(Object.isFrozen(result)).toBe(true)
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })

  it("requests only the twelve supported channel scenarios when no channel is selected", async () => {
    const request = fetchResponse(responseBody())

    await requestLiveChannelSmoke({
      target: target(),
      request,
      timeoutMs: 1_000,
      maxResponseBytes: 16_384,
    })

    const call = vi.mocked(request).mock.calls[0]
    if (!call) throw new Error("expected one Gateway request")
    const body = JSON.parse(String(call[1]?.body)) as { scenarioIds: string[] }
    expect(body.scenarioIds).toHaveLength(12)
    expect(body.scenarioIds).toEqual(
      expect.arrayContaining([
        "webui.basic_query",
        "telegram.approval_required_tool",
        "slack.failure_tool",
      ]),
    )
    expect(body.scenarioIds.some((id) => id.startsWith("discord."))).toBe(false)
  })

  it.each([
    [responseBody({ mode: "dry-run" }), "gateway_response_mode_mismatch"],
    [
      responseBody({ counts: { total: 1, passed: 0, failed: 0, skipped: 0 } }),
      "gateway_response_counts_invalid",
    ],
    [
      responseBody({
        status: "failed",
        ok: true,
        counts: { total: 1, passed: 0, failed: 1, skipped: 0 },
        results: [
          {
            scenarioId: "webui.basic_query",
            channel: "webui",
            kind: "basic_query",
            status: "failed",
            failures: [],
          },
        ],
      }),
      "gateway_response_ok_invalid",
    ],
    [
      responseBody({
        results: [
          {
            scenarioId: "webui.basic_query",
            channel: "webui",
            kind: "basic_query",
            status: "unknown",
            failures: [],
          },
        ],
      }),
      "gateway_response_result_invalid",
    ],
  ])("rejects a structurally unsafe live response", async (body, code) => {
    await expect(
      requestLiveChannelSmoke({
        target: target(),
        request: fetchResponse(body),
        timeoutMs: 1_000,
        maxResponseBytes: 16_384,
      }),
    ).rejects.toEqual(expect.objectContaining({ code }))
  })

  it("classifies HTTP failures without exposing their response content", async () => {
    for (const [status, code] of [
      [400, "gateway_request_rejected"],
      [401, "gateway_authentication_failed"],
      [403, "gateway_authentication_failed"],
      [503, "gateway_unavailable"],
      [500, "gateway_http_failure"],
    ] as const) {
      const secret = `Bearer ${TOKEN}`
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(secret, { status }))

      const error = await requestLiveChannelSmoke({
        target: target(),
        request,
        timeoutMs: 1_000,
        maxResponseBytes: 16_384,
      }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(ChannelSmokeGatewayError)
      expect(error).toEqual(expect.objectContaining({ code }))
      expect(String(error)).not.toContain(TOKEN)
      expect(String(error)).not.toContain(secret)
    }
  })

  it("rejects non-JSON and oversized bodies without exposing their content", async () => {
    const secret = `Bearer ${TOKEN}`
    const invalidJson = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(secret, { status: 200 }))
    const oversized = fetchResponse(responseBody({ summary: "x".repeat(2_000) }))

    for (const [request, code, maxResponseBytes] of [
      [invalidJson, "gateway_response_json_invalid", 16_384],
      [oversized, "gateway_response_too_large", 256],
    ] as const) {
      const error = await requestLiveChannelSmoke({
        target: target(),
        request,
        timeoutMs: 1_000,
        maxResponseBytes,
      }).catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(ChannelSmokeGatewayError)
      expect(error).toEqual(expect.objectContaining({ code }))
      expect(String(error)).not.toContain(TOKEN)
      expect(String(error)).not.toContain(secret)
    }
  })

  it("keeps provider adapters, direct environment reads, and the unconditional refusal out of the CLI live path", () => {
    const command = readFileSync(
      new URL("../packages/cli/src/commands/smoke.ts", import.meta.url),
      "utf-8",
    )
    const client = readFileSync(
      new URL("../packages/cli/src/channel-smoke-gateway-client.ts", import.meta.url),
      "utf-8",
    )

    expect(command).not.toContain("live channel smoke executor is not configured in this build")
    expect(`${command}\n${client}`).not.toContain("process.env")
    expect(`${command}\n${client}`).not.toMatch(/telegram\/adapter|slack\/adapter|provider-direct/u)
  })
})

describe("Task 161 live CLI composition", () => {
  it("calls the Gateway client path exactly once and prints only the safe projection", async () => {
    const request = fetchResponse(responseBody())
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const runtimeConfig = structuredClone(DEFAULT_CONFIG)
    runtimeConfig.webui.auth = { enabled: true, token: TOKEN }
    let rendered = ""

    try {
      await channelSmokeCommand(
        { live: true, channel: "webui", json: true },
        { runtimeConfig, liveEnabled: true, request },
      )
      rendered = output.mock.calls.flat().join("\n")
    } finally {
      output.mockRestore()
    }

    expect(request).toHaveBeenCalledOnce()
    expect(rendered).not.toContain(TOKEN)
    expect(rendered).not.toContain("audit:161")
    expect(rendered).toContain('"mode": "live-run"')
  })

  it("does not promote a valid failed Gateway run to CLI success", async () => {
    const failed = responseBody({
      ok: false,
      status: "failed",
      counts: { total: 1, passed: 0, failed: 1, skipped: 0 },
      results: [
        {
          scenarioId: "webui.basic_query",
          channel: "webui",
          kind: "basic_query",
          status: "failed",
          failures: ["scenario_execution_failed"],
        },
      ],
    })
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined)

    try {
      await expect(
        channelSmokeCommand(
          { live: true, channel: "webui" },
          {
            runtimeConfig: structuredClone(DEFAULT_CONFIG),
            liveEnabled: true,
            request: fetchResponse(failed),
          },
        ),
      ).rejects.toThrow("live_channel_smoke_incomplete:failed")
    } finally {
      output.mockRestore()
    }
  })

  it("does not accept a partially passed run with skipped scenarios", async () => {
    const partial = responseBody({
      counts: { total: 2, passed: 1, failed: 0, skipped: 1 },
      results: [
        {
          scenarioId: "webui.basic_query",
          channel: "webui",
          kind: "basic_query",
          status: "passed",
          failures: [],
          auditLogId: "audit:161",
        },
        {
          scenarioId: "telegram.basic_query",
          channel: "telegram",
          kind: "basic_query",
          status: "skipped",
          failures: [],
        },
      ],
    })
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined)

    try {
      await expect(
        channelSmokeCommand(
          { live: true },
          {
            runtimeConfig: structuredClone(DEFAULT_CONFIG),
            liveEnabled: true,
            request: fetchResponse(partial),
          },
        ),
      ).rejects.toThrow("live_channel_smoke_incomplete:passed")
    } finally {
      output.mockRestore()
    }
  })
})
