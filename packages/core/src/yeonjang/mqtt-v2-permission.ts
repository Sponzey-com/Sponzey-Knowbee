import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import {
  buildYeonjangMqttV2Topics,
  type YeonjangMqttV2Enrollment,
} from "./mqtt-v2-contract.js"

type PermissionReadOutcome =
  | "available"
  | "binding_mismatch"
  | "policy_unavailable"
  | "observation_unavailable"
type PermissionOsState =
  | "not_observed"
  | "not_required"
  | "granted"
  | "not_determined"
  | "denied"
  | "restricted"

export interface YeonjangMqttV2PermissionIdentity {
  readonly messageId: string
  readonly requestId: string
  readonly commandId: string
  readonly operationId: string
  readonly correlationId: string
  readonly causationId: string
  readonly idempotencyKey: string
  readonly authorizationId: string
  readonly nonce: string
}

export interface YeonjangMqttV2CapturePermission {
  readonly outcome: PermissionReadOutcome
  readonly policyRevision?: number
  readonly permissions?: readonly {
    readonly method: "camera.capture" | "screen.capture"
    readonly resource: "camera" | "screen"
    readonly settingName: "allow_camera_access" | "allow_screen_capture"
    readonly platformAvailable: boolean
    readonly localPolicy: "allowed" | "denied"
    readonly policyResource: "any" | "exact_camera" | "exact_display"
    readonly osPermission: PermissionOsState
  }[]
}

export interface YeonjangMqttV2CapturePermissionQuery {
  readonly topic: string
  readonly enrollment: YeonjangMqttV2Enrollment
  readonly envelope: {
    readonly protocol_version: 2
    readonly schema_id: "yeonjang.control.v2"
    readonly message_kind: "control"
    readonly message_id: string
    readonly request_id: string
    readonly command_id: string
    readonly operation_id: string
    readonly correlation_id: string
    readonly causation_id: string
    readonly requester_id: string
    readonly target_instance_id: string
    readonly target_session_id: string
    readonly target_fingerprint: string
    readonly idempotency_key: string
    readonly issued_at: number
    readonly expires_at: number
    readonly sequence: number
    readonly payload: { readonly control: "capture.permission.get"; readonly params: Record<string, never> }
    readonly authorization: {
      readonly schema_version: 1
      readonly authorization_id: string
      readonly issuer: string
      readonly key_id: "requester-hmac-v2"
      readonly audience: string
      readonly scope: "permission.read"
      readonly requester_id: string
      readonly command_id: string
      readonly operation_id: string
      readonly target_instance_id: string
      readonly target_session_id: string
      readonly target_fingerprint: string
      readonly idempotency_key: string
      readonly expires_at: number
      readonly nonce: string
      readonly signature: string
    }
  }
}

export type YeonjangMqttV2CapturePermissionAdmission =
  | { readonly ok: true; readonly permission: YeonjangMqttV2CapturePermission }
  | { readonly ok: false; readonly reasonCode:
      | "yeonjang_v2_permission_response_payload_invalid"
      | "yeonjang_v2_permission_response_identity_mismatch"
      | "yeonjang_v2_permission_response_expired"
      | "yeonjang_v2_permission_response_signature_rejected" }

/**
 * Builds the versioned, read-only permission control request accepted by the
 * existing Yeonjang v2 adapter. It intentionally has no device selector or
 * OS prompt parameter, so it cannot become a capture command by accident.
 */
export function createYeonjangMqttV2CapturePermissionQuery(input: {
  readonly enrollment: YeonjangMqttV2Enrollment
  readonly targetFingerprint: string
  readonly identity: YeonjangMqttV2PermissionIdentity
  readonly issuedAt: number
  readonly expiresAt: number
  readonly sequence: number
  readonly hmacKey: Uint8Array
}): YeonjangMqttV2CapturePermissionQuery {
  validateQueryInput(input)
  const { enrollment, identity } = input
  const unsigned = {
    protocol_version: 2 as const,
    schema_id: "yeonjang.control.v2" as const,
    message_kind: "control" as const,
    message_id: identity.messageId,
    request_id: identity.requestId,
    command_id: identity.commandId,
    operation_id: identity.operationId,
    correlation_id: identity.correlationId,
    causation_id: identity.causationId,
    requester_id: enrollment.requesterId,
    target_instance_id: enrollment.instanceId,
    target_session_id: enrollment.sessionId,
    target_fingerprint: input.targetFingerprint,
    idempotency_key: identity.idempotencyKey,
    issued_at: input.issuedAt,
    expires_at: input.expiresAt,
    sequence: input.sequence,
    payload: { control: "capture.permission.get" as const, params: {} as Record<string, never> },
    authorization: {
      schema_version: 1 as const,
      authorization_id: identity.authorizationId,
      issuer: enrollment.requesterId,
      key_id: "requester-hmac-v2" as const,
      audience: enrollment.instanceId,
      scope: "permission.read" as const,
      requester_id: enrollment.requesterId,
      command_id: identity.commandId,
      operation_id: identity.operationId,
      target_instance_id: enrollment.instanceId,
      target_session_id: enrollment.sessionId,
      target_fingerprint: input.targetFingerprint,
      idempotency_key: identity.idempotencyKey,
      expires_at: input.expiresAt,
      nonce: identity.nonce,
      signature: "",
    },
  }
  const envelope = {
    ...unsigned,
    authorization: {
      ...unsigned.authorization,
      signature: createHmac("sha256", input.hmacKey)
        .update(permissionQuerySigningBytes(unsigned))
        .digest("hex"),
    },
  }
  return {
    topic: buildYeonjangMqttV2Topics(enrollment).controlTopic,
    enrollment,
    envelope,
  }
}

/** Verifies the exact response identity and HMAC before projecting OS state. */
export function admitYeonjangMqttV2CapturePermissionResponse(input: {
  readonly payload: Uint8Array
  readonly nowMs: number
  readonly hmacKey: Uint8Array
  readonly expected: {
    readonly enrollment: YeonjangMqttV2Enrollment
    readonly requestId: string
    readonly commandId: string
    readonly operationId: string
    readonly idempotencyKey: string
    readonly targetFingerprint: string
  }
}): YeonjangMqttV2CapturePermissionAdmission {
  if (input.payload.byteLength < 1 || input.payload.byteLength > 65_536 || input.hmacKey.byteLength < 16) {
    return { ok: false, reasonCode: "yeonjang_v2_permission_response_payload_invalid" }
  }
  let value: unknown
  try {
    value = JSON.parse(Buffer.from(input.payload).toString("utf8")) as unknown
  } catch {
    return { ok: false, reasonCode: "yeonjang_v2_permission_response_payload_invalid" }
  }
  const envelope = parsePermissionResponse(value)
  if (!envelope) return { ok: false, reasonCode: "yeonjang_v2_permission_response_payload_invalid" }
  const { expected } = input
  if (
    envelope.request_id !== expected.requestId
    || envelope.command_id !== expected.commandId
    || envelope.operation_id !== expected.operationId
    || envelope.idempotency_key !== expected.idempotencyKey
    || envelope.requester_id !== expected.enrollment.requesterId
    || envelope.target_instance_id !== expected.enrollment.instanceId
    || envelope.target_session_id !== expected.enrollment.sessionId
    || envelope.target_fingerprint !== expected.targetFingerprint
    || envelope.authorization.issuer !== expected.enrollment.instanceId
    || envelope.authorization.key_id !== "instance-hmac-v2"
    || envelope.authorization.audience !== expected.enrollment.requesterId
    || envelope.authorization.scope !== "response.publish"
    || envelope.authorization.requester_id !== envelope.requester_id
    || envelope.authorization.request_id !== envelope.request_id
    || envelope.authorization.command_id !== envelope.command_id
    || envelope.authorization.operation_id !== envelope.operation_id
    || envelope.authorization.target_instance_id !== envelope.target_instance_id
    || envelope.authorization.target_session_id !== envelope.target_session_id
    || envelope.authorization.target_fingerprint !== envelope.target_fingerprint
    || envelope.authorization.idempotency_key !== envelope.idempotency_key
    || envelope.authorization.expires_at !== envelope.expires_at
  ) return { ok: false, reasonCode: "yeonjang_v2_permission_response_identity_mismatch" }
  if (envelope.issued_at > input.nowMs || envelope.expires_at <= input.nowMs || envelope.expires_at <= envelope.issued_at) {
    return { ok: false, reasonCode: "yeonjang_v2_permission_response_expired" }
  }
  const observed = Buffer.from(envelope.authorization.signature, "hex")
  const expectedSignature = createHmac("sha256", input.hmacKey)
    .update(permissionResponseSigningBytes(envelope))
    .digest()
  if (observed.length !== expectedSignature.length || !timingSafeEqual(observed, expectedSignature)) {
    return { ok: false, reasonCode: "yeonjang_v2_permission_response_signature_rejected" }
  }
  return { ok: true, permission: envelope.payload }
}

type PermissionResponseEnvelope = {
  readonly protocol_version: 2
  readonly schema_id: "yeonjang.capture-permission-response.v2"
  readonly message_kind: "response"
  readonly message_id: string
  readonly request_id: string
  readonly command_id: string
  readonly operation_id: string
  readonly correlation_id: string
  readonly causation_id: string
  readonly requester_id: string
  readonly target_instance_id: string
  readonly target_session_id: string
  readonly target_fingerprint: string
  readonly idempotency_key: string
  readonly issued_at: number
  readonly expires_at: number
  readonly sequence: number
  readonly payload: YeonjangMqttV2CapturePermission
  readonly authorization: {
    readonly schema_version: 1
    readonly issuer: string
    readonly key_id: string
    readonly audience: string
    readonly scope: "response.publish"
    readonly requester_id: string
    readonly request_id: string
    readonly command_id: string
    readonly operation_id: string
    readonly target_instance_id: string
    readonly target_session_id: string
    readonly target_fingerprint: string
    readonly idempotency_key: string
    readonly expires_at: number
    readonly nonce: string
    readonly signature: string
  }
}

function parsePermissionResponse(value: unknown): PermissionResponseEnvelope | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "protocol_version", "schema_id", "message_kind", "message_id", "request_id", "command_id",
    "operation_id", "correlation_id", "causation_id", "requester_id", "target_instance_id",
    "target_session_id", "target_fingerprint", "idempotency_key", "issued_at", "expires_at",
    "sequence", "payload", "authorization",
  ])) return null
  if (
    value.protocol_version !== 2
    || value.schema_id !== "yeonjang.capture-permission-response.v2"
    || value.message_kind !== "response"
    || !["message_id", "request_id", "command_id", "operation_id", "correlation_id", "causation_id", "requester_id", "target_instance_id", "target_session_id", "idempotency_key"].every((key) => isIdentifier(value[key]))
    || !isSha256Fingerprint(value.target_fingerprint)
    || !isSafeTimestamp(value.issued_at)
    || !isSafeTimestamp(value.expires_at)
    || !isPositiveSequence(value.sequence)
  ) return null
  const permission = parsePermissionPayload(value.payload)
  const authorization = parsePermissionResponseAuthorization(value.authorization)
  if (!permission || !authorization) return null
  return { ...value, payload: permission, authorization } as PermissionResponseEnvelope
}

function parsePermissionPayload(value: unknown): YeonjangMqttV2CapturePermission | null {
  if (!isRecord(value)) return null
  const outcome = value.outcome
  if (!isPermissionOutcome(outcome)) return null
  if (outcome !== "available") {
    return hasExactKeys(value, ["outcome"])
      ? { outcome }
      : null
  }
  if (!hasExactKeys(value, ["outcome", "policyRevision", "permissions"])) return null
  const policyRevision = value.policyRevision
  if (typeof policyRevision !== "number" || !Number.isSafeInteger(policyRevision) || policyRevision < 0 || !Array.isArray(value.permissions)) return null
  const permissions = value.permissions.map(parsePermissionRow)
  if (permissions.some((row) => row === null) || permissions.length < 1 || permissions.length > 2) return null
  return {
    outcome,
    policyRevision,
    permissions: permissions as NonNullable<typeof permissions[number]>[],
  }
}

function parsePermissionRow(value: unknown): YeonjangMqttV2CapturePermission["permissions"] extends readonly (infer Row)[] | undefined ? Row | null : never {
  if (!isRecord(value) || !hasExactKeys(value, [
    "method", "resource", "settingName", "platformAvailable", "localPolicy", "policyResource", "osPermission",
  ])) return null as never
  if (
    (value.method !== "camera.capture" && value.method !== "screen.capture")
    || (value.resource !== "camera" && value.resource !== "screen")
    || (value.settingName !== "allow_camera_access" && value.settingName !== "allow_screen_capture")
    || typeof value.platformAvailable !== "boolean"
    || (value.localPolicy !== "allowed" && value.localPolicy !== "denied")
    || (value.policyResource !== "any" && value.policyResource !== "exact_camera" && value.policyResource !== "exact_display")
    || !isPermissionOsState(value.osPermission)
  ) return null as never
  return {
    method: value.method,
    resource: value.resource,
    settingName: value.settingName,
    platformAvailable: value.platformAvailable,
    localPolicy: value.localPolicy,
    policyResource: value.policyResource,
    osPermission: value.osPermission,
  } as never
}

function parsePermissionResponseAuthorization(value: unknown): PermissionResponseEnvelope["authorization"] | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "schema_version", "issuer", "key_id", "audience", "scope", "requester_id", "request_id", "command_id",
    "operation_id", "target_instance_id", "target_session_id", "target_fingerprint", "idempotency_key",
    "expires_at", "nonce", "signature",
  ])) return null
  if (
    value.schema_version !== 1
    || value.scope !== "response.publish"
    || !["issuer", "key_id", "audience", "requester_id", "request_id", "command_id", "operation_id", "target_instance_id", "target_session_id", "idempotency_key", "nonce"].every((key) => isIdentifier(value[key]))
    || !isSha256Fingerprint(value.target_fingerprint)
    || !isSafeTimestamp(value.expires_at)
    || !isLowerHex(value.signature)
  ) return null
  return value as PermissionResponseEnvelope["authorization"]
}

function permissionQuerySigningBytes(envelope: Omit<YeonjangMqttV2CapturePermissionQuery["envelope"], "authorization"> & { readonly authorization: Omit<YeonjangMqttV2CapturePermissionQuery["envelope"]["authorization"], "signature"> }): Buffer {
  const chunks: Buffer[] = []
  appendText(chunks, "domain", "yeonjang.capture-permission-query.authorization.v2")
  appendU64(chunks, "protocol_version", envelope.protocol_version)
  appendText(chunks, "schema_id", envelope.schema_id)
  appendText(chunks, "message_kind", envelope.message_kind)
  appendText(chunks, "control", envelope.payload.control)
  for (const [name, value] of [
    ["message_id", envelope.message_id], ["request_id", envelope.request_id], ["command_id", envelope.command_id],
    ["operation_id", envelope.operation_id], ["correlation_id", envelope.correlation_id], ["causation_id", envelope.causation_id],
    ["requester_id", envelope.requester_id], ["target_instance_id", envelope.target_instance_id], ["target_session_id", envelope.target_session_id],
    ["target_fingerprint", envelope.target_fingerprint], ["idempotency_key", envelope.idempotency_key],
  ] as const) appendText(chunks, name, value)
  appendI64(chunks, "issued_at", envelope.issued_at)
  appendI64(chunks, "expires_at", envelope.expires_at)
  appendU64(chunks, "sequence", envelope.sequence)
  appendU64(chunks, "authorization_schema_version", envelope.authorization.schema_version)
  for (const [name, value] of [
    ["authorization_id", envelope.authorization.authorization_id], ["authorization_issuer", envelope.authorization.issuer],
    ["authorization_key_id", envelope.authorization.key_id], ["authorization_audience", envelope.authorization.audience],
    ["authorization_scope", envelope.authorization.scope], ["authorization_requester_id", envelope.authorization.requester_id],
    ["authorization_command_id", envelope.authorization.command_id], ["authorization_operation_id", envelope.authorization.operation_id],
    ["authorization_target_instance_id", envelope.authorization.target_instance_id], ["authorization_target_session_id", envelope.authorization.target_session_id],
    ["authorization_target_fingerprint", envelope.authorization.target_fingerprint], ["authorization_idempotency_key", envelope.authorization.idempotency_key],
  ] as const) appendText(chunks, name, value)
  appendI64(chunks, "authorization_expires_at", envelope.authorization.expires_at)
  appendText(chunks, "authorization_nonce", envelope.authorization.nonce)
  return Buffer.concat(chunks)
}

function permissionResponseSigningBytes(envelope: PermissionResponseEnvelope): Buffer {
  const chunks: Buffer[] = []
  appendText(chunks, "domain", "yeonjang.capture-permission-response.authorization.v2")
  appendBytes(chunks, "payload_sha256", createHash("sha256").update(JSON.stringify(toWirePermissionPayload(envelope.payload))).digest())
  for (const [name, value] of [
    ["schema_id", envelope.schema_id], ["message_kind", envelope.message_kind], ["message_id", envelope.message_id],
    ["request_id", envelope.request_id], ["command_id", envelope.command_id], ["operation_id", envelope.operation_id],
    ["correlation_id", envelope.correlation_id], ["causation_id", envelope.causation_id], ["requester_id", envelope.requester_id],
    ["target_instance_id", envelope.target_instance_id], ["target_session_id", envelope.target_session_id], ["target_fingerprint", envelope.target_fingerprint],
    ["idempotency_key", envelope.idempotency_key], ["authorization_issuer", envelope.authorization.issuer], ["authorization_key_id", envelope.authorization.key_id],
    ["authorization_audience", envelope.authorization.audience], ["authorization_scope", envelope.authorization.scope],
    ["authorization_requester_id", envelope.authorization.requester_id], ["authorization_request_id", envelope.authorization.request_id],
    ["authorization_command_id", envelope.authorization.command_id], ["authorization_operation_id", envelope.authorization.operation_id],
    ["authorization_target_instance_id", envelope.authorization.target_instance_id], ["authorization_target_session_id", envelope.authorization.target_session_id],
    ["authorization_target_fingerprint", envelope.authorization.target_fingerprint], ["authorization_idempotency_key", envelope.authorization.idempotency_key],
    ["authorization_nonce", envelope.authorization.nonce],
  ] as const) appendText(chunks, name, value)
  appendU64(chunks, "protocol_version", envelope.protocol_version)
  appendU64(chunks, "sequence", envelope.sequence)
  appendU64(chunks, "authorization_schema_version", envelope.authorization.schema_version)
  appendI64(chunks, "issued_at", envelope.issued_at)
  appendI64(chunks, "expires_at", envelope.expires_at)
  appendI64(chunks, "authorization_expires_at", envelope.authorization.expires_at)
  return Buffer.concat(chunks)
}

function toWirePermissionPayload(permission: YeonjangMqttV2CapturePermission): Record<string, unknown> {
  if (permission.outcome !== "available") return { outcome: permission.outcome }
  return {
    outcome: permission.outcome,
    policyRevision: permission.policyRevision,
    permissions: permission.permissions?.map((row) => ({
      method: row.method, resource: row.resource, settingName: row.settingName,
      platformAvailable: row.platformAvailable, localPolicy: row.localPolicy,
      policyResource: row.policyResource, osPermission: row.osPermission,
    })),
  }
}

function validateQueryInput(input: Parameters<typeof createYeonjangMqttV2CapturePermissionQuery>[0]): void {
  const values = [
    input.enrollment.instanceId, input.enrollment.sessionId, input.enrollment.requesterId,
    input.identity.messageId, input.identity.requestId, input.identity.commandId, input.identity.operationId,
    input.identity.correlationId, input.identity.causationId, input.identity.idempotencyKey,
    input.identity.authorizationId, input.identity.nonce,
  ]
  if (!values.every(isIdentifier) || !isSha256Fingerprint(input.targetFingerprint) || !isSafeTimestamp(input.issuedAt) || !isSafeTimestamp(input.expiresAt) || input.expiresAt <= input.issuedAt || input.expiresAt - input.issuedAt > 300_000 || !isPositiveSequence(input.sequence) || input.hmacKey.byteLength < 16) {
    throw new Error("yeonjang_v2_permission_query_invalid")
  }
}

function appendText(chunks: Buffer[], name: string, value: string): void { appendBytes(chunks, name, Buffer.from(value, "utf8")) }
function appendU64(chunks: Buffer[], name: string, value: number): void { const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(value)); appendBytes(chunks, name, bytes) }
function appendI64(chunks: Buffer[], name: string, value: number): void { const bytes = Buffer.alloc(8); bytes.writeBigInt64BE(BigInt(value)); appendBytes(chunks, name, bytes) }
function appendBytes(chunks: Buffer[], name: string, value: Uint8Array): void { const bytes = Buffer.from(name, "utf8"); const nameLength = Buffer.alloc(8); nameLength.writeBigUInt64BE(BigInt(bytes.length)); const valueLength = Buffer.alloc(8); valueLength.writeBigUInt64BE(BigInt(value.byteLength)); chunks.push(nameLength, bytes, valueLength, Buffer.from(value)) }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value) }
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key)) }
/** Matches the v2 producer identity grammar: lowercase ASCII alphanumeric at both ends. */
function isIdentifier(value: unknown): value is string { return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/u.test(value) }
function isSha256Fingerprint(value: unknown): value is string { return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value) }
function isLowerHex(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value) }
function isSafeTimestamp(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 }
function isPositiveSequence(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 }
function isPermissionOutcome(value: unknown): value is PermissionReadOutcome { return value === "available" || value === "binding_mismatch" || value === "policy_unavailable" || value === "observation_unavailable" }
function isPermissionOsState(value: unknown): value is PermissionOsState { return value === "not_observed" || value === "not_required" || value === "granted" || value === "not_determined" || value === "denied" || value === "restricted" }
