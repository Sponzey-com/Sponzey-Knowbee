import type { LiveAcceptanceBundleCandidate } from "./live-acceptance-bundle.js"
import {
  isYeonjangLiveSmokeReadOnlyMethod,
  type YeonjangLiveSmokeReadOnlyMethod,
} from "../runs/yeonjang-live-smoke.js"

export interface LiveAcceptanceExecutionAuthorization {
  readonly authorizationId: string
  readonly auditEventId: string
  readonly approvedAt: number
  readonly expiresAt: number
}

export type LiveAcceptanceExtensionCapability = "skill" | "mcp"

export type LiveAcceptanceSelectionJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly LiveAcceptanceSelectionJsonValue[]
  | { readonly [key: string]: LiveAcceptanceSelectionJsonValue }

export interface LiveAcceptanceExtensionSelection {
  readonly capability: LiveAcceptanceExtensionCapability
  readonly agentId: string
  readonly bindingId: string
  readonly catalogId: string
  readonly toolName: string
  readonly readOnly: true
  readonly params: Readonly<Record<string, LiveAcceptanceSelectionJsonValue>>
}

export interface LiveAcceptanceYeonjangSelection {
  readonly instanceId: string
  readonly sessionId: string
  readonly method: YeonjangLiveSmokeReadOnlyMethod
  readonly params?: Readonly<Record<string, LiveAcceptanceSelectionJsonValue>>
  readonly readOnly: true
}

export interface LiveAcceptanceExecutionSelection {
  readonly extensions: readonly LiveAcceptanceExtensionSelection[]
  readonly yeonjang: LiveAcceptanceYeonjangSelection
}

export interface LiveAcceptanceExecutionRequest {
  readonly kind: "knowbee.release.live_acceptance_execution_request"
  readonly schemaVersion: 2
  readonly candidate: Readonly<LiveAcceptanceBundleCandidate>
  readonly authorization: LiveAcceptanceExecutionAuthorization
  readonly selection: LiveAcceptanceExecutionSelection
  readonly requestedKeyId: `sha256:${string}`
}

export type LiveAcceptanceExecutionRequestValidation =
  | { status: "verified"; request: Readonly<LiveAcceptanceExecutionRequest> }
  | { status: "rejected"; reasonCode: string }

const TOP_LEVEL_KEYS = [
  "authorization",
  "candidate",
  "kind",
  "requestedKeyId",
  "schemaVersion",
  "selection",
]
const CANDIDATE_KEYS = ["appVersion", "gitCommit", "gitTag"]
const AUTHORIZATION_KEYS = ["approvedAt", "auditEventId", "authorizationId", "expiresAt"]
const SELECTION_KEYS = ["extensions", "yeonjang"]
const EXTENSION_KEYS = [
  "agentId",
  "bindingId",
  "capability",
  "catalogId",
  "params",
  "readOnly",
  "toolName",
]
const YEONJANG_KEYS = ["instanceId", "method", "readOnly", "sessionId"]
const YEONJANG_KEYS_WITH_PARAMS = ["instanceId", "method", "params", "readOnly", "sessionId"]
const KEY_ID = /^sha256:[a-f0-9]{64}$/u
const MAX_SELECTION_JSON_BYTES = 8_192
const MAX_SELECTION_JSON_DEPTH = 4
const MAX_SELECTION_JSON_NODES = 64

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function exact(value: unknown, max = 256): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max
}

function validJsonValue(
  value: unknown,
  depth: number,
  counter: { count: number },
): value is LiveAcceptanceSelectionJsonValue {
  counter.count += 1
  if (counter.count > MAX_SELECTION_JSON_NODES || depth > MAX_SELECTION_JSON_DEPTH) return false
  if (value === null || typeof value === "boolean") return true
  if (typeof value === "string") return value.length <= 512
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) {
    return value.length <= 16 && value.every((item) => validJsonValue(item, depth + 1, counter))
  }
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  return (
    keys.length <= 16 &&
    keys.every(
      (key) =>
        key.length > 0 &&
        key.length <= 64 &&
        key !== "__proto__" &&
        key !== "constructor" &&
        key !== "prototype" &&
        validJsonValue(value[key], depth + 1, counter),
    )
  )
}

function freezeJsonValue(
  value: LiveAcceptanceSelectionJsonValue,
): LiveAcceptanceSelectionJsonValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => freezeJsonValue(item)))
  }
  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          freezeJsonValue(item as LiveAcceptanceSelectionJsonValue),
        ]),
      ),
    )
  }
  return value
}

function validateSelection(value: unknown): LiveAcceptanceExecutionSelection | null {
  if (!isRecord(value) || !exactKeys(value, SELECTION_KEYS)) return null
  if (!Array.isArray(value.extensions) || value.extensions.length !== 2) return null
  const extensions: LiveAcceptanceExtensionSelection[] = []
  for (const item of value.extensions) {
    if (
      !isRecord(item) ||
      !exactKeys(item, EXTENSION_KEYS) ||
      (item.capability !== "skill" && item.capability !== "mcp") ||
      !exact(item.agentId) ||
      !exact(item.bindingId) ||
      !exact(item.catalogId) ||
      !exact(item.toolName) ||
      item.readOnly !== true ||
      !isRecord(item.params)
    ) {
      return null
    }
    let paramsBytes = Number.POSITIVE_INFINITY
    try {
      paramsBytes = new TextEncoder().encode(JSON.stringify(item.params)).byteLength
    } catch {
      return null
    }
    if (paramsBytes > MAX_SELECTION_JSON_BYTES || !validJsonValue(item.params, 0, { count: 0 })) {
      return null
    }
    extensions.push(
      Object.freeze({
        capability: item.capability,
        agentId: item.agentId,
        bindingId: item.bindingId,
        catalogId: item.catalogId,
        toolName: item.toolName,
        readOnly: true,
        params: freezeJsonValue(item.params) as Readonly<
          Record<string, LiveAcceptanceSelectionJsonValue>
        >,
      }),
    )
  }
  if (
    new Set(extensions.map((item) => item.capability)).size !== 2 ||
    !extensions.some((item) => item.capability === "skill") ||
    !extensions.some((item) => item.capability === "mcp") ||
    new Set(extensions.map((item) => item.bindingId)).size !== 2 ||
    new Set(extensions.map((item) => item.catalogId)).size !== 2 ||
    new Set(extensions.map((item) => item.toolName)).size !== 2
  ) {
    return null
  }
  const yeonjang = value.yeonjang
  if (
    !isRecord(yeonjang) ||
    (!exactKeys(yeonjang, YEONJANG_KEYS) && !exactKeys(yeonjang, YEONJANG_KEYS_WITH_PARAMS)) ||
    !exact(yeonjang.instanceId) ||
    !exact(yeonjang.sessionId) ||
    !isYeonjangLiveSmokeReadOnlyMethod(yeonjang.method) ||
    yeonjang.readOnly !== true
  ) {
    return null
  }
  let yeonjangParams:
    | Readonly<Record<string, LiveAcceptanceSelectionJsonValue>>
    | undefined
  if ("params" in yeonjang) {
    if (!isRecord(yeonjang.params)) return null
    let paramsBytes = Number.POSITIVE_INFINITY
    try {
      paramsBytes = new TextEncoder().encode(JSON.stringify(yeonjang.params)).byteLength
    } catch {
      return null
    }
    if (
      paramsBytes > MAX_SELECTION_JSON_BYTES ||
      !validJsonValue(yeonjang.params, 0, { count: 0 })
    ) {
      return null
    }
    yeonjangParams = freezeJsonValue(yeonjang.params) as Readonly<
      Record<string, LiveAcceptanceSelectionJsonValue>
    >
  }
  const resolvedYeonjang = {
    instanceId: yeonjang.instanceId,
    sessionId: yeonjang.sessionId,
    method: yeonjang.method,
    ...(yeonjangParams ? { params: yeonjangParams } : {}),
    readOnly: true as const,
  }
  return Object.freeze({
    extensions: Object.freeze(extensions),
    yeonjang: Object.freeze(resolvedYeonjang),
  })
}

export function validateLiveAcceptanceExecutionRequest(
  value: unknown,
  now: number,
): LiveAcceptanceExecutionRequestValidation {
  if (!isRecord(value) || !exactKeys(value, TOP_LEVEL_KEYS)) {
    return { status: "rejected", reasonCode: "live_acceptance_request_shape_invalid" }
  }
  if (
    value.kind !== "knowbee.release.live_acceptance_execution_request" ||
    value.schemaVersion !== 2
  ) {
    return { status: "rejected", reasonCode: "live_acceptance_request_schema_invalid" }
  }
  const candidate = value.candidate
  if (
    !isRecord(candidate) ||
    !exactKeys(candidate, CANDIDATE_KEYS) ||
    !exact(candidate.appVersion, 128) ||
    (candidate.gitTag !== null && !exact(candidate.gitTag, 256)) ||
    (candidate.gitCommit !== null && !exact(candidate.gitCommit, 256))
  ) {
    return { status: "rejected", reasonCode: "live_acceptance_request_candidate_invalid" }
  }
  const authorization = value.authorization
  const approvedAt = isRecord(authorization) ? authorization.approvedAt : undefined
  const expiresAt = isRecord(authorization) ? authorization.expiresAt : undefined
  if (
    !isRecord(authorization) ||
    !exactKeys(authorization, AUTHORIZATION_KEYS) ||
    !exact(authorization.authorizationId) ||
    !exact(authorization.auditEventId) ||
    typeof approvedAt !== "number" ||
    typeof expiresAt !== "number" ||
    !Number.isSafeInteger(approvedAt) ||
    !Number.isSafeInteger(expiresAt) ||
    approvedAt > now ||
    approvedAt >= expiresAt
  ) {
    return { status: "rejected", reasonCode: "live_acceptance_request_authorization_invalid" }
  }
  if (expiresAt <= now) {
    return { status: "rejected", reasonCode: "live_acceptance_request_authorization_expired" }
  }
  if (!KEY_ID.test(String(value.requestedKeyId))) {
    return { status: "rejected", reasonCode: "live_acceptance_request_key_invalid" }
  }
  const selection = validateSelection(value.selection)
  if (!selection) {
    return { status: "rejected", reasonCode: "live_acceptance_request_selection_invalid" }
  }
  return {
    status: "verified",
    request: Object.freeze({
      kind: "knowbee.release.live_acceptance_execution_request",
      schemaVersion: 2,
      candidate: Object.freeze({
        appVersion: candidate.appVersion,
        gitTag: candidate.gitTag as string | null,
        gitCommit: candidate.gitCommit as string | null,
      }),
      authorization: Object.freeze({
        authorizationId: authorization.authorizationId,
        auditEventId: authorization.auditEventId,
        approvedAt,
        expiresAt,
      }),
      selection,
      requestedKeyId: value.requestedKeyId as `sha256:${string}`,
    }),
  }
}
