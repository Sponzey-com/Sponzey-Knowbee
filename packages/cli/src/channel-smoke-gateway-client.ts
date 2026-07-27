export type ChannelSmokeGatewayErrorCode =
  | "gateway_disabled"
  | "gateway_host_invalid"
  | "gateway_port_invalid"
  | "gateway_auth_token_missing"
  | "gateway_request_policy_invalid"
  | "gateway_request_failed"
  | "gateway_request_rejected"
  | "gateway_authentication_failed"
  | "gateway_unavailable"
  | "gateway_http_failure"
  | "gateway_response_too_large"
  | "gateway_response_json_invalid"
  | "gateway_response_schema_invalid"
  | "gateway_response_mode_mismatch"
  | "gateway_response_counts_invalid"
  | "gateway_response_ok_invalid"
  | "gateway_response_result_invalid"

const ERROR_MESSAGES: Readonly<Record<ChannelSmokeGatewayErrorCode, string>> = Object.freeze({
  gateway_disabled: "Gateway is disabled in the startup configuration.",
  gateway_host_invalid: "Gateway host is invalid.",
  gateway_port_invalid: "Gateway port is invalid.",
  gateway_auth_token_missing: "Gateway authentication is enabled but its token is missing.",
  gateway_request_policy_invalid: "Gateway request policy is invalid.",
  gateway_request_failed: "Gateway request failed.",
  gateway_request_rejected: "Gateway rejected the live channel smoke request contract.",
  gateway_authentication_failed: "Gateway authentication rejected the live channel smoke request.",
  gateway_unavailable: "Gateway live channel smoke execution is unavailable.",
  gateway_http_failure: "Gateway rejected the live channel smoke request.",
  gateway_response_too_large: "Gateway response exceeded the allowed size.",
  gateway_response_json_invalid: "Gateway response was not valid JSON.",
  gateway_response_schema_invalid: "Gateway response did not match the channel smoke contract.",
  gateway_response_mode_mismatch: "Gateway response was not a live channel smoke run.",
  gateway_response_counts_invalid: "Gateway response counts were inconsistent.",
  gateway_response_ok_invalid: "Gateway response success state was inconsistent.",
  gateway_response_result_invalid: "Gateway response contained an invalid scenario result.",
})

export class ChannelSmokeGatewayError extends Error {
  readonly code: ChannelSmokeGatewayErrorCode

  constructor(code: ChannelSmokeGatewayErrorCode) {
    super(ERROR_MESSAGES[code])
    this.name = "ChannelSmokeGatewayError"
    this.code = code
  }
}

export interface ChannelSmokeGatewayConfigSnapshot {
  readonly enabled: boolean
  readonly host: string
  readonly port: number
  readonly auth: {
    readonly enabled: boolean
    readonly token?: string
  }
}

export interface ChannelSmokeGatewayTarget {
  readonly origin: string
  readonly bearerToken?: string
}

export type LiveChannelSmokeChannel = "webui" | "telegram" | "slack"
export type LiveChannelSmokeStatus = "passed" | "failed" | "skipped"

export interface LiveChannelSmokeResultProjection {
  readonly scenarioId: string
  readonly channel: LiveChannelSmokeChannel
  readonly kind: string
  readonly status: LiveChannelSmokeStatus
  readonly failureCount: number
  readonly auditObserved: boolean
}

export interface LiveChannelSmokeRunProjection {
  readonly ok: boolean
  readonly mode: "live-run"
  readonly runId: string
  readonly status: LiveChannelSmokeStatus
  readonly counts: Readonly<{
    total: number
    passed: number
    failed: number
    skipped: number
  }>
  readonly summary: string
  readonly results: readonly LiveChannelSmokeResultProjection[]
}

const CHANNELS = new Set<LiveChannelSmokeChannel>(["webui", "telegram", "slack"])
const STATUSES = new Set<LiveChannelSmokeStatus>(["passed", "failed", "skipped"])
const SCENARIO_KINDS = new Set([
  "basic_query",
  "approval_required_tool",
  "artifact_delivery",
  "failure_tool",
])
const LIVE_CHANNEL_SCENARIO_IDS = Object.freeze(
  (["webui", "telegram", "slack"] as const).flatMap((channel) =>
    [...SCENARIO_KINDS].map((kind) => `${channel}.${kind}`),
  ),
)

function fail(code: ChannelSmokeGatewayErrorCode): never {
  throw new ChannelSmokeGatewayError(code)
}

function normalizeConnectHost(host: string): string {
  const trimmed = host.trim()
  if (!trimmed || trimmed === "0.0.0.0" || trimmed === "::" || trimmed === "[::]") {
    return "127.0.0.1"
  }
  if (/[/\\?#@\s]/u.test(trimmed) || trimmed.includes("://")) {
    fail("gateway_host_invalid")
  }
  if (trimmed.startsWith("[") || trimmed.endsWith("]")) {
    if (!/^\[[0-9a-f:]+\]$/iu.test(trimmed)) fail("gateway_host_invalid")
    return trimmed
  }
  if (trimmed.includes(":")) {
    if (!/^[0-9a-f:]+$/iu.test(trimmed)) fail("gateway_host_invalid")
    return `[${trimmed}]`
  }
  if (!/^[a-z0-9.-]+$/iu.test(trimmed)) fail("gateway_host_invalid")
  return trimmed
}

export function resolveChannelSmokeGatewayTarget(
  config: ChannelSmokeGatewayConfigSnapshot,
): Readonly<ChannelSmokeGatewayTarget> {
  if (!config.enabled) fail("gateway_disabled")
  if (!Number.isSafeInteger(config.port) || config.port < 1 || config.port > 65_535) {
    fail("gateway_port_invalid")
  }
  const host = normalizeConnectHost(config.host)
  const token = config.auth.token?.trim()
  if (config.auth.enabled && !token) fail("gateway_auth_token_missing")
  return Object.freeze({
    origin: `http://${host}:${config.port}`,
    ...(config.auth.enabled && token ? { bearerToken: token } : {}),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function boundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<string> {
  const declared = Number.parseInt(response.headers.get("content-length") ?? "", 10)
  if (Number.isFinite(declared) && declared > maxBytes) fail("gateway_response_too_large")
  if (!response.body) return ""

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ""
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    bytes += chunk.value.byteLength
    if (bytes > maxBytes) {
      await reader.cancel()
      fail("gateway_response_too_large")
    }
    text += decoder.decode(chunk.value, { stream: true })
  }
  return text + decoder.decode()
}

function parseCounts(value: unknown): LiveChannelSmokeRunProjection["counts"] {
  if (!isRecord(value)) fail("gateway_response_counts_invalid")
  const { total, passed, failed, skipped } = value
  if (
    !nonNegativeInteger(total) ||
    !nonNegativeInteger(passed) ||
    !nonNegativeInteger(failed) ||
    !nonNegativeInteger(skipped) ||
    total !== passed + failed + skipped
  ) {
    fail("gateway_response_counts_invalid")
  }
  return Object.freeze({ total, passed, failed, skipped })
}

function parseResult(value: unknown): Readonly<LiveChannelSmokeResultProjection> {
  if (!isRecord(value)) fail("gateway_response_result_invalid")
  const { scenarioId, channel, kind, status, failures, auditLogId } = value
  if (
    !boundedString(scenarioId, 160) ||
    !CHANNELS.has(channel as LiveChannelSmokeChannel) ||
    !SCENARIO_KINDS.has(String(kind)) ||
    !STATUSES.has(status as LiveChannelSmokeStatus) ||
    !Array.isArray(failures) ||
    failures.length > 32 ||
    failures.some((item) => typeof item !== "string" || item.length > 256) ||
    (auditLogId !== undefined && !boundedString(auditLogId, 256))
  ) {
    fail("gateway_response_result_invalid")
  }
  return Object.freeze({
    scenarioId,
    channel: channel as LiveChannelSmokeChannel,
    kind: String(kind),
    status: status as LiveChannelSmokeStatus,
    failureCount: failures.length,
    auditObserved: typeof auditLogId === "string" && auditLogId.length > 0,
  })
}

function parseResponse(value: unknown): Readonly<LiveChannelSmokeRunProjection> {
  if (!isRecord(value)) fail("gateway_response_schema_invalid")
  if (value.mode !== "live-run") fail("gateway_response_mode_mismatch")
  if (
    typeof value.ok !== "boolean" ||
    !boundedString(value.runId, 256) ||
    !STATUSES.has(value.status as LiveChannelSmokeStatus) ||
    !Array.isArray(value.results) ||
    value.results.length > 100
  ) {
    fail("gateway_response_schema_invalid")
  }

  const status = value.status as LiveChannelSmokeStatus
  const counts = parseCounts(value.counts)
  const results = Object.freeze(value.results.map(parseResult))
  const observed = {
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
  }
  if (
    results.length !== counts.total ||
    observed.passed !== counts.passed ||
    observed.failed !== counts.failed ||
    observed.skipped !== counts.skipped
  ) {
    fail("gateway_response_counts_invalid")
  }
  const derivedStatus: LiveChannelSmokeStatus =
    counts.failed > 0 ? "failed" : counts.passed > 0 ? "passed" : "skipped"
  if (status !== derivedStatus) fail("gateway_response_counts_invalid")
  if (value.ok !== (status !== "failed")) fail("gateway_response_ok_invalid")

  return Object.freeze({
    ok: value.ok,
    mode: "live-run",
    runId: value.runId,
    status,
    counts,
    summary: `channel smoke ${status}: passed=${counts.passed}, failed=${counts.failed}, skipped=${counts.skipped}`,
    results,
  })
}

export async function requestLiveChannelSmoke(input: {
  readonly target: ChannelSmokeGatewayTarget
  readonly channel?: LiveChannelSmokeChannel
  readonly request: typeof fetch
  readonly timeoutMs: number
  readonly maxResponseBytes: number
}): Promise<Readonly<LiveChannelSmokeRunProjection>> {
  if (
    !Number.isSafeInteger(input.timeoutMs) ||
    input.timeoutMs < 1 ||
    input.timeoutMs > 30 * 60_000 ||
    !Number.isSafeInteger(input.maxResponseBytes) ||
    input.maxResponseBytes < 128 ||
    input.maxResponseBytes > 1024 * 1024 ||
    (input.channel !== undefined && !CHANNELS.has(input.channel))
  ) {
    fail("gateway_request_policy_invalid")
  }

  let response: Response
  try {
    response = await input.request(`${input.target.origin}/api/channel-smoke/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(input.target.bearerToken
          ? { authorization: `Bearer ${input.target.bearerToken}` }
          : {}),
      },
      body: JSON.stringify({
        mode: "live-run",
        ...(input.channel
          ? { channel: input.channel }
          : { scenarioIds: LIVE_CHANNEL_SCENARIO_IDS }),
      }),
      signal: AbortSignal.timeout(input.timeoutMs),
    })
  } catch {
    fail("gateway_request_failed")
  }
  if (!response.ok) {
    if (response.status === 400) fail("gateway_request_rejected")
    if (response.status === 401 || response.status === 403) {
      fail("gateway_authentication_failed")
    }
    if (response.status === 503) fail("gateway_unavailable")
    fail("gateway_http_failure")
  }

  let text: string
  try {
    text = await readBoundedBody(response, input.maxResponseBytes)
  } catch (error) {
    if (error instanceof ChannelSmokeGatewayError) throw error
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
