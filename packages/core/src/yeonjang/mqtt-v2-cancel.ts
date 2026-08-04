import { createHash, createHmac } from "node:crypto"
import {
  buildYeonjangMqttV2Topics,
  parseYeonjangMqttV2Enrollment,
  type YeonjangMqttV2Enrollment,
} from "./mqtt-v2-contract.js"

interface YeonjangMqttV2CancellationTarget {
  readonly requestId: string
  readonly commandId: string
  readonly operationId: string
  readonly idempotencyKey: string
  readonly cancellationId: string
  readonly cancelToken: string
}

interface YeonjangMqttV2CancellationIdentity {
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

export interface YeonjangMqttV2CancellationEnvelope {
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
  readonly payload: {
    readonly control: "command.cancel"
    readonly params: Readonly<Record<string, string>>
  }
  readonly authorization: Readonly<Record<string, unknown>> & { readonly signature: string }
}

/**
 * Builds the producer-owned v2 command cancellation contract. The target
 * identity is copied from the dispatched command; no alias or prose is
 * reinterpreted while cancelling an active effect.
 */
export function createYeonjangMqttV2Cancellation(input: {
  readonly enrollment: YeonjangMqttV2Enrollment
  readonly targetFingerprint: string
  readonly target: YeonjangMqttV2CancellationTarget
  readonly identity: YeonjangMqttV2CancellationIdentity
  readonly issuedAt: number
  readonly expiresAt: number
  readonly sequence: number
  readonly hmacKey: Uint8Array
  readonly reason?: "user_requested" | "deadline_exceeded" | "runtime_shutdown"
}): { readonly topic: string; readonly envelope: YeonjangMqttV2CancellationEnvelope } {
  const parsedEnrollment = parseYeonjangMqttV2Enrollment(input.enrollment)
  const identifiers = [
    ...Object.values(input.identity),
    input.target.requestId,
    input.target.commandId,
    input.target.operationId,
    input.target.idempotencyKey,
    input.target.cancellationId,
  ]
  if (
    !parsedEnrollment.ok
    || !identifiers.every(isIdentifier)
    || !input.target.cancelToken.trim()
    || Buffer.byteLength(input.target.cancelToken, "utf8") > 256
    || !/^sha256:[0-9a-f]{64}$/u.test(input.targetFingerprint)
    || !Number.isSafeInteger(input.issuedAt)
    || !Number.isSafeInteger(input.expiresAt)
    || input.expiresAt <= input.issuedAt
    || !Number.isSafeInteger(input.sequence)
    || input.sequence < 1
    || input.hmacKey.byteLength < 16
  ) {
    throw new Error("yeonjang_v2_cancellation_invalid")
  }

  const enrollment = parsedEnrollment.enrollment
  const params = {
    target_request_id: input.target.requestId,
    target_command_id: input.target.commandId,
    target_operation_id: input.target.operationId,
    target_idempotency_key: input.target.idempotencyKey,
    cancellation_id: input.target.cancellationId,
    cancel_token: input.target.cancelToken,
    reason: input.reason ?? "user_requested",
  } as const
  const authorization = {
    schema_version: 1,
    authorization_id: input.identity.authorizationId,
    issuer: enrollment.requesterId,
    key_id: "requester-hmac-v2",
    audience: enrollment.instanceId,
    scope: "effect.cancel",
    requester_id: enrollment.requesterId,
    command_id: input.identity.commandId,
    operation_id: input.identity.operationId,
    target_instance_id: enrollment.instanceId,
    target_session_id: enrollment.sessionId,
    target_fingerprint: input.targetFingerprint,
    idempotency_key: input.identity.idempotencyKey,
    ...params,
    expires_at: input.expiresAt,
    nonce: input.identity.nonce,
    signature: "",
  }
  const unsigned: YeonjangMqttV2CancellationEnvelope = {
    protocol_version: 2,
    schema_id: "yeonjang.control.v2",
    message_kind: "control",
    message_id: input.identity.messageId,
    request_id: input.identity.requestId,
    command_id: input.identity.commandId,
    operation_id: input.identity.operationId,
    correlation_id: input.identity.correlationId,
    causation_id: input.identity.causationId,
    requester_id: enrollment.requesterId,
    target_instance_id: enrollment.instanceId,
    target_session_id: enrollment.sessionId,
    target_fingerprint: input.targetFingerprint,
    idempotency_key: input.identity.idempotencyKey,
    issued_at: input.issuedAt,
    expires_at: input.expiresAt,
    sequence: input.sequence,
    payload: { control: "command.cancel", params },
    authorization,
  }
  const signature = createHmac("sha256", input.hmacKey)
    .update(cancellationSigningBytes(unsigned))
    .digest("hex")
  return {
    topic: buildYeonjangMqttV2Topics(enrollment).controlTopic,
    envelope: { ...unsigned, authorization: { ...authorization, signature } },
  }
}

function cancellationSigningBytes(envelope: YeonjangMqttV2CancellationEnvelope): Buffer {
  const params = envelope.payload.params
  const payload: Buffer[] = []
  for (const [name, value] of [
    ["control", "command.cancel"],
    ["target_request_id", String(params.target_request_id)],
    ["target_command_id", String(params.target_command_id)],
    ["target_operation_id", String(params.target_operation_id)],
    ["target_idempotency_key", String(params.target_idempotency_key)],
    ["cancellation_id", String(params.cancellation_id)],
    ["cancel_token", String(params.cancel_token)],
    ["reason", String(params.reason)],
  ] as const) appendField(payload, name, Buffer.from(value))
  const payloadDigest = createHash("sha256").update(Buffer.concat(payload)).digest()
  const authorization = envelope.authorization
  const fields: ReadonlyArray<readonly [string, string | number | Buffer]> = [
    ["domain", "yeonjang.control.authorization.v2"],
    ["protocol_version", 2],
    ["schema_id", envelope.schema_id],
    ["message_kind", envelope.message_kind],
    ["payload_sha256", payloadDigest],
    ["message_id", envelope.message_id],
    ["request_id", envelope.request_id],
    ["command_id", envelope.command_id],
    ["operation_id", envelope.operation_id],
    ["correlation_id", envelope.correlation_id],
    ["causation_id", envelope.causation_id],
    ["requester_id", envelope.requester_id],
    ["target_instance_id", envelope.target_instance_id],
    ["target_session_id", envelope.target_session_id],
    ["target_fingerprint", envelope.target_fingerprint],
    ["idempotency_key", envelope.idempotency_key],
    ["issued_at", envelope.issued_at],
    ["expires_at", envelope.expires_at],
    ["sequence", envelope.sequence],
    ["authorization_schema_version", 1],
    ["authorization_id", String(authorization.authorization_id)],
    ["authorization_issuer", String(authorization.issuer)],
    ["authorization_key_id", String(authorization.key_id)],
    ["authorization_audience", String(authorization.audience)],
    ["authorization_scope", "effect.cancel"],
    ["authorization_requester_id", String(authorization.requester_id)],
    ["authorization_command_id", String(authorization.command_id)],
    ["authorization_operation_id", String(authorization.operation_id)],
    ["authorization_target_instance_id", String(authorization.target_instance_id)],
    ["authorization_target_session_id", String(authorization.target_session_id)],
    ["authorization_target_fingerprint", String(authorization.target_fingerprint)],
    ["authorization_idempotency_key", String(authorization.idempotency_key)],
    ["authorization_target_request_id", String(authorization.target_request_id)],
    ["authorization_target_command_id", String(authorization.target_command_id)],
    ["authorization_target_operation_id", String(authorization.target_operation_id)],
    ["authorization_target_idempotency_key", String(authorization.target_idempotency_key)],
    ["authorization_cancellation_id", String(authorization.cancellation_id)],
    ["authorization_cancel_token", String(authorization.cancel_token)],
    ["authorization_expires_at", Number(authorization.expires_at)],
    ["authorization_nonce", String(authorization.nonce)],
  ]
  const output: Buffer[] = []
  for (const [name, value] of fields) {
    appendField(output, name, Buffer.isBuffer(value) ? value : typeof value === "number" ? u64(value) : Buffer.from(value))
  }
  return Buffer.concat(output)
}

function isIdentifier(value: string): boolean {
  return /^[a-z0-9_-]+$/u.test(value) && Buffer.byteLength(value, "utf8") <= 64
}

function appendField(output: Buffer[], name: string, value: Buffer): void {
  const key = Buffer.from(name)
  output.push(u64(key.length), key, u64(value.length), value)
}

function u64(value: number): Buffer {
  const bytes = Buffer.alloc(8)
  bytes.writeBigUInt64BE(BigInt(value))
  return bytes
}
