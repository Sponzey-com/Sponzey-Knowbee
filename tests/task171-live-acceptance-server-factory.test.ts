import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import type { LiveAcceptanceRouteExecutor } from "../packages/core/src/api/routes/live-acceptance.ts"
import {
  createApiServerRuntimeContext,
  resolveApiLiveAcceptanceExecutor,
} from "../packages/core/src/api/server-runtime-context.ts"
import type { ChannelSmokeRunnerOptions } from "../packages/core/src/channels/smoke-runner.ts"
import { createStartupProcessContext } from "../packages/core/src/runtime/startup-process-context.ts"

const result = Object.freeze({
  status: "blocked" as const,
  blockers: Object.freeze([{ capability: "collection" as const, reasonCode: "test" }]),
  events: Object.freeze([{ state: "blocked" as const }]),
})

const direct: LiveAcceptanceRouteExecutor = vi.fn(async () => result)
const channelExecutor: ChannelSmokeRunnerOptions["executeScenario"] = vi.fn(async () => ({
  sourceChannel: "webui",
}))

function startup() {
  return createStartupProcessContext({
    env: { KNOWBEE_LIVE_ACCEPTANCE: "1" },
    argv: ["node", "knowbee"],
    cwd: "/workspace",
  })
}

describe("Task 171 API live acceptance executor factory seam", () => {
  it("uses a bootstrap target only when no explicit Telegram target was supplied", () => {
    const fallback = Object.freeze({ chatId: 171, userId: 171 })
    const fromFallback = createApiServerRuntimeContext(startup(), {
      telegramLiveSmokeTarget: fallback,
    })
    const explicit = createApiServerRuntimeContext(
      createStartupProcessContext({
        env: {
          KNOWBEE_CHANNEL_SMOKE_TELEGRAM_CHAT_ID: "172",
          KNOWBEE_CHANNEL_SMOKE_TELEGRAM_USER_ID: "172",
        },
        argv: ["node", "knowbee"],
        cwd: "/workspace",
      }),
      { telegramLiveSmokeTarget: fallback },
    )
    const invalidExplicit = createApiServerRuntimeContext(
      createStartupProcessContext({
        env: { KNOWBEE_CHANNEL_SMOKE_TELEGRAM_CHAT_ID: "invalid" },
        argv: ["node", "knowbee"],
        cwd: "/workspace",
      }),
      { telegramLiveSmokeTarget: fallback },
    )

    expect(fromFallback.telegramLiveSmokeTarget).toEqual(fallback)
    expect(explicit.telegramLiveSmokeTarget).toEqual({ chatId: 172, userId: 172 })
    expect(invalidExplicit.telegramLiveSmokeTarget).toBeUndefined()
  })

  it("captures a startup factory in the immutable runtime context", () => {
    const factory = vi.fn(() => direct)
    const inspector = vi.fn(() => [])
    const runtime = createApiServerRuntimeContext(startup(), {
      liveAcceptanceExecutorFactory: factory,
      liveAcceptanceSelectionAvailabilityInspector: inspector,
    })

    expect(Object.isFrozen(runtime)).toBe(true)
    expect(runtime.liveAcceptanceExecutorFactory).toBe(factory)
    expect(runtime.liveAcceptanceSelectionAvailabilityInspector).toBe(inspector)
  })

  it("prefers a direct executor without invoking the factory", () => {
    const factory = vi.fn(() => direct)
    const resolved = resolveApiLiveAcceptanceExecutor({
      runtime: {
        ...createApiServerRuntimeContext(startup(), { liveAcceptanceExecutorFactory: factory }),
        liveAcceptanceExecutor: direct,
      },
      channelSmokeLiveExecutor: channelExecutor,
    })

    expect(resolved).toEqual({ status: "ready", executor: direct })
    expect(factory).not.toHaveBeenCalled()
  })

  it("calls the startup factory once with the resolved channel executor", () => {
    const factory = vi.fn(() => direct)
    const runtime = createApiServerRuntimeContext(startup(), {
      liveAcceptanceExecutorFactory: factory,
    })
    const resolved = resolveApiLiveAcceptanceExecutor({
      runtime,
      channelSmokeLiveExecutor: channelExecutor,
    })

    expect(resolved).toEqual({ status: "ready", executor: direct })
    expect(factory).toHaveBeenCalledOnce()
    expect(factory).toHaveBeenCalledWith(
      Object.freeze({ channelSmokeLiveExecutor: channelExecutor }),
    )
  })

  it.each([
    ["missing", undefined],
    ["factory_unavailable", vi.fn(() => undefined)],
    [
      "factory_failed",
      vi.fn(() => {
        throw new Error("private /tmp/config secret")
      }),
    ],
  ] as const)("returns bounded unavailable state for %s", (reasonCode, factory) => {
    const runtime = createApiServerRuntimeContext(
      startup(),
      factory ? { liveAcceptanceExecutorFactory: factory } : {},
    )
    const resolved = resolveApiLiveAcceptanceExecutor({ runtime })

    expect(resolved).toEqual({
      status: "unavailable",
      reasonCode: `live_acceptance_executor_${reasonCode}`,
    })
    expect(JSON.stringify(resolved)).not.toMatch(/private|\/tmp|secret/u)
  })

  it("registers only the resolved executor and does not resolve inside the request route", () => {
    const server = readFileSync("packages/core/src/api/server.ts", "utf8")
    const route = readFileSync("packages/core/src/api/routes/live-acceptance.ts", "utf8")

    expect(server).toContain("resolveApiLiveAcceptanceExecutor")
    expect(server).toContain('liveAcceptanceResolution.status === "ready"')
    expect(route).not.toContain("liveAcceptanceExecutorFactory")
  })
})
