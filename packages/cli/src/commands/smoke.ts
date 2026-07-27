export interface ChannelSmokeCommandOptions {
  channel?: string
  live?: boolean
  json?: boolean
}

import { redactUiValue, type KnowbeeConfig } from "@knowbee/core"

import {
  type LiveChannelSmokeRunProjection,
  requestLiveChannelSmoke,
  resolveChannelSmokeGatewayTarget,
} from "../channel-smoke-gateway-client.js"
import { getCliBaseEnv, getCliCwd, isCliChannelSmokeLiveEnabled } from "../runtime-env.js"

const CHANNELS = new Set(["webui", "telegram", "slack"])
const CHANNEL_SMOKE_LIVE_ENABLED = isCliChannelSmokeLiveEnabled()
const LIVE_REQUEST_TIMEOUT_MS = 15 * 60_000
const LIVE_RESPONSE_LIMIT_BYTES = 64 * 1024

export interface ChannelSmokeCommandDependencies {
  readonly runtimeConfig?: KnowbeeConfig
  readonly liveEnabled?: boolean
  readonly request?: typeof fetch
}

export function redactChannelSmokeCommandOutput<T>(value: T): T {
  return redactUiValue(value, { audience: "advanced" }).value as T
}

async function resolveRuntimeConfig(provided: KnowbeeConfig | undefined): Promise<KnowbeeConfig> {
  if (provided) return provided
  const core = await import("@knowbee/core")
  const baseEnv = getCliBaseEnv()
  return core.loadConfigSnapshot({
    baseEnv,
    cwd: getCliCwd(),
    paths: core.createRuntimePaths(baseEnv),
  })
}

function printLiveResult(result: LiveChannelSmokeRunProjection, json: boolean): void {
  const safeResult = redactChannelSmokeCommandOutput(result)
  if (json) {
    console.log(JSON.stringify(safeResult, null, 2))
    return
  }
  console.log(`Channel smoke run: ${safeResult.runId}`)
  console.log(`Mode: ${safeResult.mode}`)
  console.log(`Status: ${safeResult.status}`)
  console.log(`Summary: ${safeResult.summary}`)
  console.log(
    `Counts: passed=${safeResult.counts.passed}, failed=${safeResult.counts.failed}, skipped=${safeResult.counts.skipped}, total=${safeResult.counts.total}`,
  )
  for (const item of safeResult.results) {
    console.log(`- ${item.scenarioId}: ${item.status} (failures=${item.failureCount})`)
  }
}

export async function channelSmokeCommand(
  options: ChannelSmokeCommandOptions,
  dependencies: ChannelSmokeCommandDependencies = {},
): Promise<void> {
  const config = await resolveRuntimeConfig(dependencies.runtimeConfig)

  const channel = options.channel?.trim()
  if (channel && !CHANNELS.has(channel)) {
    throw new Error(`unknown channel: ${channel}`)
  }

  const mode = options.live ? "live-run" : "dry-run"
  if (mode === "live-run") {
    if (!(dependencies.liveEnabled ?? CHANNEL_SMOKE_LIVE_ENABLED)) {
      throw new Error("live channel smoke requires KNOWBEE_CHANNEL_SMOKE_LIVE=1")
    }
    const result = await requestLiveChannelSmoke({
      target: resolveChannelSmokeGatewayTarget(config.webui),
      ...(channel ? { channel: channel as "webui" | "telegram" | "slack" } : {}),
      request: dependencies.request ?? globalThis.fetch,
      timeoutMs: LIVE_REQUEST_TIMEOUT_MS,
      maxResponseBytes: LIVE_RESPONSE_LIMIT_BYTES,
    })
    printLiveResult(result, options.json === true)
    if (result.status !== "passed" || result.counts.passed !== result.counts.total) {
      throw new Error(`live_channel_smoke_incomplete:${result.status}`)
    }
    return
  }

  const core = await import("@knowbee/core")
  await core.bootstrapRuntime(config)

  const allScenarios = core.getDefaultChannelSmokeScenarios()
  const scenarios = channel
    ? allScenarios.filter((scenario) => scenario.channel === channel)
    : allScenarios

  const result = await core.runPersistedChannelSmokeScenarios({
    config,
    mode,
    scenarios,
    initiatedBy: "cli",
    metadata: {
      command: "knowbee smoke channels",
      channel: channel ?? null,
    },
    executeScenario: core.createDryRunChannelSmokeExecutor(),
  })
  const safeResult = redactChannelSmokeCommandOutput(result)

  if (options.json) {
    console.log(JSON.stringify(safeResult, null, 2))
    return
  }

  console.log(`Channel smoke run: ${safeResult.runId}`)
  console.log(`Mode: ${safeResult.mode}`)
  console.log(`Status: ${safeResult.status}`)
  console.log(`Summary: ${safeResult.summary}`)
  console.log(
    `Counts: passed=${safeResult.counts.passed}, failed=${safeResult.counts.failed}, skipped=${safeResult.counts.skipped}, total=${safeResult.counts.total}`,
  )
  for (const item of safeResult.results) {
    const suffix = item.reason ? ` (${item.reason})` : ""
    console.log(`- ${item.scenario.id}: ${item.status}${suffix}`)
  }
}
