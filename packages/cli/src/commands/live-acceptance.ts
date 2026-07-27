import { lstatSync, readFileSync } from "node:fs"
import {
  redactUiValue,
  type KnowbeeConfig,
  type LiveAcceptanceExecutionRequest,
} from "@knowbee/core"
import {
  requestLiveAcceptanceReadiness,
  requestProductionLiveAcceptance,
  resolveLiveAcceptanceAdministratorGatewayTarget,
} from "../live-acceptance-gateway-client.js"
import { getCliBaseEnv, getCliCwd, isCliLiveAcceptanceEnabled } from "../runtime-env.js"

export interface LiveAcceptanceCommandOptions {
  readonly requestPath?: string
  readonly check?: boolean
  readonly json?: boolean
}

export interface LiveAcceptanceCommandDependencies {
  readonly runtimeConfig?: KnowbeeConfig
  readonly liveEnabled?: boolean
  readonly executionRequest?: LiveAcceptanceExecutionRequest
  readonly request?: typeof fetch
}

const REQUEST_LIMIT_BYTES = 64 * 1024
const RESPONSE_LIMIT_BYTES = 64 * 1024
const REQUEST_TIMEOUT_MS = 60 * 60_000

export function redactLiveAcceptanceCommandOutput<T>(value: T): T {
  return redactUiValue(value, { audience: "advanced" }).value as T
}

async function resolveRuntimeConfig(provided?: KnowbeeConfig): Promise<KnowbeeConfig> {
  if (provided) return provided
  const core = await import("@knowbee/core")
  const baseEnv = getCliBaseEnv()
  return core.loadConfigSnapshot({
    baseEnv,
    cwd: getCliCwd(),
    paths: core.createRuntimePaths(baseEnv),
  })
}

function loadExecutionRequest(path: string | undefined): LiveAcceptanceExecutionRequest {
  if (!path?.trim()) throw new Error("live_acceptance_request_path_required")
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > REQUEST_LIMIT_BYTES) {
    throw new Error("live_acceptance_request_path_unsafe")
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as LiveAcceptanceExecutionRequest
  } catch {
    throw new Error("live_acceptance_request_json_invalid")
  }
}

export async function liveAcceptanceCommand(
  options: LiveAcceptanceCommandOptions,
  dependencies: LiveAcceptanceCommandDependencies = {},
): Promise<void> {
  if (options.check && options.requestPath) {
    throw new Error("live_acceptance_check_request_conflict")
  }
  const config = await resolveRuntimeConfig(dependencies.runtimeConfig)
  const request = dependencies.request ?? globalThis.fetch
  const target = resolveLiveAcceptanceAdministratorGatewayTarget(config.webui)
  if (options.check) {
    const readiness = await requestLiveAcceptanceReadiness({
      target,
      request,
      timeoutMs: 10_000,
      maxResponseBytes: 4 * 1024,
    })
    const safeReadiness = redactLiveAcceptanceCommandOutput(readiness)
    if (options.json) {
      console.log(JSON.stringify(safeReadiness, null, 2))
    } else {
      console.log(`Live acceptance readiness: ${safeReadiness.status}`)
      if (safeReadiness.status !== "ready") console.log(`Reason: ${safeReadiness.reasonCode}`)
    }
    if (readiness.status !== "ready") {
      throw new Error("live_acceptance_readiness_unavailable")
    }
    return
  }
  if (!(dependencies.liveEnabled ?? isCliLiveAcceptanceEnabled())) {
    throw new Error("live acceptance requires KNOWBEE_LIVE_ACCEPTANCE=1 at startup")
  }
  const executionRequest =
    dependencies.executionRequest ?? loadExecutionRequest(options.requestPath)
  const result = await requestProductionLiveAcceptance({
    target,
    executionRequest,
    request,
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxResponseBytes: RESPONSE_LIMIT_BYTES,
  })
  const safeResult = redactLiveAcceptanceCommandOutput(result)
  if (options.json) {
    console.log(JSON.stringify(safeResult, null, 2))
    return
  }
  console.log(`Live acceptance: ${safeResult.status}`)
  console.log(`Evidence: ${safeResult.evidenceCount}/7`)
}
