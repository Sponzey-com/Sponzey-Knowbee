import type { LiveAcceptanceExecutionRequest } from "@knowbee/core"
import {
  type ChannelSmokeGatewayConfigSnapshot,
  type ChannelSmokeGatewayTarget,
  resolveChannelSmokeGatewayTarget,
} from "./channel-smoke-gateway-client.js"

export type LiveAcceptanceGatewayErrorCode =
  | "gateway_request_policy_invalid"
  | "gateway_administrator_token_missing"
  | "gateway_request_failed"
  | "gateway_http_failure"
  | "gateway_response_too_large"
  | "gateway_response_json_invalid"
  | "gateway_response_schema_invalid"
  | "live_acceptance_not_collected"

const MESSAGES: Readonly<Record<LiveAcceptanceGatewayErrorCode, string>> = Object.freeze({
  gateway_request_policy_invalid: "Gateway live acceptance request policy is invalid.",
  gateway_administrator_token_missing:
    "Gateway live acceptance requires a configured administrator token.",
  gateway_request_failed: "Gateway live acceptance request failed.",
  gateway_http_failure: "Gateway rejected the live acceptance request.",
  gateway_response_too_large: "Gateway live acceptance response exceeded the allowed size.",
  gateway_response_json_invalid: "Gateway live acceptance response was not valid JSON.",
  gateway_response_schema_invalid: "Gateway live acceptance response did not match the contract.",
  live_acceptance_not_collected: "Production live acceptance did not collect complete evidence.",
})

export class LiveAcceptanceGatewayError extends Error {
  readonly code: LiveAcceptanceGatewayErrorCode

  constructor(code: LiveAcceptanceGatewayErrorCode) {
    super(MESSAGES[code])
    this.name = "LiveAcceptanceGatewayError"
    this.code = code
  }
}

export interface LiveAcceptanceGatewayProjection {
  readonly status: "collected"
  readonly evidenceCount: number
  readonly events: readonly {
    readonly state: string
    readonly stage?: string
  }[]
}

const READINESS_CAPABILITIES = Object.freeze([
  "webui",
  "telegram",
  "slack",
  "web",
  "skill",
  "mcp",
  "yeonjang",
] as const)

type LiveAcceptanceReadinessCapability = (typeof READINESS_CAPABILITIES)[number]
type LiveAcceptanceReadinessReasonCode =
  | "live_acceptance_webui_target_unavailable"
  | "live_acceptance_telegram_target_unavailable"
  | "live_acceptance_slack_target_unavailable"
  | "live_acceptance_web_runtime_unavailable"
  | "live_acceptance_skill_selection_unavailable"
  | "live_acceptance_mcp_selection_unavailable"
  | "live_acceptance_yeonjang_selection_unavailable"

type LiveAcceptanceCapabilityReadiness =
  | Readonly<{ capability: LiveAcceptanceReadinessCapability; status: "ready" }>
  | Readonly<{
      capability: LiveAcceptanceReadinessCapability
      status: "unavailable"
      reasonCode: LiveAcceptanceReadinessReasonCode
    }>

export type LiveAcceptanceReadinessProjection =
  | Readonly<{
      status: "ready"
      capabilities: readonly LiveAcceptanceCapabilityReadiness[]
    }>
  | Readonly<{
      status: "disabled"
      reasonCode: "live_acceptance_disabled"
    }>
  | Readonly<{
      status: "unavailable"
      reasonCode:
        | "live_acceptance_executor_unavailable"
        | "live_acceptance_prerequisites_unavailable"
      capabilities: readonly LiveAcceptanceCapabilityReadiness[]
    }>

const READINESS_REASON: Readonly<
  Record<LiveAcceptanceReadinessCapability, LiveAcceptanceReadinessReasonCode>
> = Object.freeze({
  webui: "live_acceptance_webui_target_unavailable",
  telegram: "live_acceptance_telegram_target_unavailable",
  slack: "live_acceptance_slack_target_unavailable",
  web: "live_acceptance_web_runtime_unavailable",
  skill: "live_acceptance_skill_selection_unavailable",
  mcp: "live_acceptance_mcp_selection_unavailable",
  yeonjang: "live_acceptance_yeonjang_selection_unavailable",
})

function fail(code: LiveAcceptanceGatewayErrorCode): never {
  throw new LiveAcceptanceGatewayError(code)
}

export function resolveLiveAcceptanceAdministratorGatewayTarget(
  config: ChannelSmokeGatewayConfigSnapshot,
): Readonly<ChannelSmokeGatewayTarget> {
  const target = resolveChannelSmokeGatewayTarget(config)
  const token = config.auth.token?.trim()
  if (!token) fail("gateway_administrator_token_missing")
  return Object.freeze({ origin: target.origin, bearerToken: token })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value)
}

function parseCapabilityReadiness(value: unknown): readonly LiveAcceptanceCapabilityReadiness[] {
  if (!Array.isArray(value) || value.length !== READINESS_CAPABILITIES.length) {
    fail("gateway_response_schema_invalid")
  }
  return Object.freeze(
    value.map((item, index) => {
      if (!isRecord(item)) fail("gateway_response_schema_invalid")
      const capability = READINESS_CAPABILITIES[index]
      if (!capability) fail("gateway_response_schema_invalid")
      if (item.capability !== capability) fail("gateway_response_schema_invalid")
      if (item.status === "ready" && hasExactKeys(item, ["capability", "status"])) {
        return Object.freeze({ capability, status: "ready" as const })
      }
      if (
        item.status === "unavailable" &&
        item.reasonCode === READINESS_REASON[capability] &&
        hasExactKeys(item, ["capability", "status", "reasonCode"])
      ) {
        return Object.freeze({
          capability,
          status: "unavailable" as const,
          reasonCode: READINESS_REASON[capability],
        })
      }
      fail("gateway_response_schema_invalid")
    }),
  )
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10)
  if (Number.isFinite(declared) && declared > maxBytes) fail("gateway_response_too_large")
  if (!response.body) return ""
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ""
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    size += chunk.value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      fail("gateway_response_too_large")
    }
    text += decoder.decode(chunk.value, { stream: true })
  }
  return text + decoder.decode()
}

function parseResponse(value: unknown): Readonly<LiveAcceptanceGatewayProjection> {
  if (!isRecord(value)) fail("gateway_response_schema_invalid")
  if (value.status !== "collected") fail("live_acceptance_not_collected")
  if (value.evidenceCount !== 7 || !Array.isArray(value.events) || value.events.length > 32) {
    fail("gateway_response_schema_invalid")
  }
  const events = value.events.map((event) => {
    if (!isRecord(event) || typeof event.state !== "string" || event.state.length > 64) {
      fail("gateway_response_schema_invalid")
    }
    if (event.stage !== undefined && (typeof event.stage !== "string" || event.stage.length > 64)) {
      fail("gateway_response_schema_invalid")
    }
    return Object.freeze({ state: event.state, ...(event.stage ? { stage: event.stage } : {}) })
  })
  return Object.freeze({ status: "collected", evidenceCount: 7, events: Object.freeze(events) })
}

function parseReadiness(value: unknown): LiveAcceptanceReadinessProjection {
  if (!isRecord(value)) fail("gateway_response_schema_invalid")
  if (value.status === "ready" && hasExactKeys(value, ["status", "capabilities"])) {
    const capabilities = parseCapabilityReadiness(value.capabilities)
    if (capabilities.some((item) => item.status !== "ready")) {
      fail("gateway_response_schema_invalid")
    }
    return Object.freeze({ status: "ready", capabilities })
  }
  if (
    value.status === "disabled" &&
    value.reasonCode === "live_acceptance_disabled" &&
    hasExactKeys(value, ["status", "reasonCode"])
  ) {
    return Object.freeze({ status: "disabled", reasonCode: "live_acceptance_disabled" })
  }
  if (
    value.status === "unavailable" &&
    (value.reasonCode === "live_acceptance_executor_unavailable" ||
      value.reasonCode === "live_acceptance_prerequisites_unavailable") &&
    hasExactKeys(value, ["status", "reasonCode", "capabilities"])
  ) {
    const capabilities = parseCapabilityReadiness(value.capabilities)
    if (
      value.reasonCode === "live_acceptance_prerequisites_unavailable" &&
      capabilities.every((item) => item.status === "ready")
    ) {
      fail("gateway_response_schema_invalid")
    }
    return Object.freeze({
      status: "unavailable",
      reasonCode: value.reasonCode,
      capabilities,
    })
  }
  fail("gateway_response_schema_invalid")
}

export async function requestLiveAcceptanceReadiness(input: {
  readonly target: ChannelSmokeGatewayTarget
  readonly request: typeof fetch
  readonly timeoutMs: number
  readonly maxResponseBytes: number
}): Promise<LiveAcceptanceReadinessProjection> {
  if (
    !Number.isSafeInteger(input.timeoutMs) ||
    input.timeoutMs < 1 ||
    input.timeoutMs > 60_000 ||
    !Number.isSafeInteger(input.maxResponseBytes) ||
    input.maxResponseBytes < 128 ||
    input.maxResponseBytes > 64 * 1024
  ) {
    fail("gateway_request_policy_invalid")
  }
  let response: Response
  try {
    response = await input.request(`${input.target.origin}/api/live-acceptance/readiness`, {
      method: "GET",
      headers: input.target.bearerToken
        ? { authorization: `Bearer ${input.target.bearerToken}` }
        : {},
      signal: AbortSignal.timeout(input.timeoutMs),
    })
  } catch {
    fail("gateway_request_failed")
  }
  if (!response.ok) fail("gateway_http_failure")
  let text: string
  try {
    text = await readBoundedBody(response, input.maxResponseBytes)
  } catch (error) {
    if (error instanceof LiveAcceptanceGatewayError) throw error
    fail("gateway_request_failed")
  }
  try {
    return parseReadiness(JSON.parse(text))
  } catch (error) {
    if (error instanceof LiveAcceptanceGatewayError) throw error
    fail("gateway_response_json_invalid")
  }
}

export async function requestProductionLiveAcceptance(input: {
  readonly target: ChannelSmokeGatewayTarget
  readonly executionRequest: LiveAcceptanceExecutionRequest
  readonly request: typeof fetch
  readonly timeoutMs: number
  readonly maxResponseBytes: number
}): Promise<Readonly<LiveAcceptanceGatewayProjection>> {
  if (
    !Number.isSafeInteger(input.timeoutMs) ||
    input.timeoutMs < 1 ||
    input.timeoutMs > 60 * 60_000 ||
    !Number.isSafeInteger(input.maxResponseBytes) ||
    input.maxResponseBytes < 128 ||
    input.maxResponseBytes > 1024 * 1024
  ) {
    fail("gateway_request_policy_invalid")
  }
  let response: Response
  try {
    response = await input.request(`${input.target.origin}/api/live-acceptance/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(input.target.bearerToken
          ? { authorization: `Bearer ${input.target.bearerToken}` }
          : {}),
      },
      body: JSON.stringify(input.executionRequest),
      signal: AbortSignal.timeout(input.timeoutMs),
    })
  } catch {
    fail("gateway_request_failed")
  }
  if (!response.ok) fail("gateway_http_failure")
  let text: string
  try {
    text = await readBoundedBody(response, input.maxResponseBytes)
  } catch (error) {
    if (error instanceof LiveAcceptanceGatewayError) throw error
    fail("gateway_request_failed")
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail("gateway_response_json_invalid")
  }
  return parseResponse(parsed)
}
