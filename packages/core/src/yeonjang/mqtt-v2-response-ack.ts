import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { buildYeonjangMqttV2Topics, type YeonjangMqttV2Enrollment } from "./mqtt-v2-contract.js"
import type { YeonjangMqttV2ExpectedResponseIdentity, YeonjangMqttV2TerminalResult } from "./mqtt-v2-response.js"

export function createYeonjangMqttV2ResponseAck(input: {
  readonly enrollment: YeonjangMqttV2Enrollment
  readonly targetFingerprint: string
  readonly terminalIdentity: Omit<YeonjangMqttV2ExpectedResponseIdentity, "enrollment" | "targetFingerprint">
  readonly terminal: Pick<YeonjangMqttV2TerminalResult, "receiptId" | "responseDigest" | "terminalRevision">
  readonly identity: { readonly messageId: string; readonly requestId: string; readonly commandId: string; readonly operationId: string; readonly correlationId: string; readonly causationId: string; readonly idempotencyKey: string; readonly authorizationId: string; readonly nonce: string }
  readonly issuedAt: number
  readonly expiresAt: number
  readonly sequence: number
  readonly hmacKey: Uint8Array
}): { readonly topic: string; readonly envelope: Readonly<Record<string, unknown>> } {
  const ack = {
    receipt_id: input.terminal.receiptId,
    target_request_id: input.terminalIdentity.requestId,
    target_command_id: input.terminalIdentity.commandId,
    target_operation_id: input.terminalIdentity.operationId,
    target_idempotency_key: input.terminalIdentity.idempotencyKey,
    terminal_revision: input.terminal.terminalRevision,
    response_digest: input.terminal.responseDigest,
  }
  const payload = { control: "response.ack", params: ack }
  const authorization = {
    schema_version: 1, authorization_id: input.identity.authorizationId,
    issuer: input.enrollment.requesterId, key_id: "requester-hmac-v2",
    audience: input.enrollment.instanceId, scope: "response.ack",
    requester_id: input.enrollment.requesterId, command_id: input.identity.commandId,
    operation_id: input.identity.operationId, target_instance_id: input.enrollment.instanceId,
    target_session_id: input.enrollment.sessionId, target_fingerprint: input.targetFingerprint,
    idempotency_key: input.identity.idempotencyKey, ...ack,
    expires_at: input.expiresAt, nonce: input.identity.nonce, signature: "",
  }
  const envelope = {
    protocol_version: 2, schema_id: "yeonjang.control.v2", message_kind: "control",
    message_id: input.identity.messageId, request_id: input.identity.requestId,
    command_id: input.identity.commandId, operation_id: input.identity.operationId,
    correlation_id: input.identity.correlationId, causation_id: input.identity.causationId,
    requester_id: input.enrollment.requesterId, target_instance_id: input.enrollment.instanceId,
    target_session_id: input.enrollment.sessionId, target_fingerprint: input.targetFingerprint,
    idempotency_key: input.identity.idempotencyKey, issued_at: input.issuedAt,
    expires_at: input.expiresAt, sequence: input.sequence, payload, authorization,
  }
  const signature = createHmac("sha256", input.hmacKey).update(signingBytes(envelope, ack)).digest("hex")
  return {
    topic: buildYeonjangMqttV2Topics(input.enrollment).controlTopic,
    envelope: { ...envelope, authorization: { ...authorization, signature } },
  }
}

export function admitYeonjangMqttV2ResponseAckResult(input: {
  readonly payload: Uint8Array
  readonly nowMs: number
  readonly hmacKey: Uint8Array
  readonly expected: { readonly enrollment: YeonjangMqttV2Enrollment; readonly requestId: string; readonly commandId: string; readonly operationId: string; readonly idempotencyKey: string; readonly targetFingerprint: string; readonly receiptId: string; readonly targetRequestId: string; readonly targetCommandId: string; readonly targetOperationId: string; readonly targetIdempotencyKey: string; readonly terminalRevision: number; readonly responseDigest: string }
}): { readonly ok: true; readonly outcome: "accepted" | "duplicate"; readonly deliveryRevision: number | null } | { readonly ok: false; readonly reasonCode: string } {
  let value: unknown
  try { value = JSON.parse(Buffer.from(input.payload).toString("utf8")) as unknown } catch { return { ok: false, reasonCode: "yeonjang_v2_response_ack_result_invalid" } }
  if (!record(value)
    || !exact(value, ["protocol_version", "schema_id", "message_kind", "message_id", "request_id", "command_id", "operation_id", "correlation_id", "causation_id", "requester_id", "target_instance_id", "target_session_id", "target_fingerprint", "idempotency_key", "issued_at", "expires_at", "sequence", "payload", "authorization"])
    || value.protocol_version !== 2
    || value.schema_id !== "yeonjang.response-ack-result.v2"
    || value.message_kind !== "response"
    || !record(value.payload)
    || !record(value.authorization)) return { ok: false, reasonCode: "yeonjang_v2_response_ack_result_invalid" }
  const expected = input.expected
  const payload = value.payload
  const auth = value.authorization
  const payloadKeys = ["schema_version", "receipt_id", "target_request_id", "target_command_id", "target_operation_id", "target_idempotency_key", "terminal_revision", "response_digest", "outcome", ...(payload.delivery_revision === undefined ? [] : ["delivery_revision"])]
  if (!exact(payload, payloadKeys)
    || !exact(auth, ["schema_version", "issuer", "key_id", "audience", "scope", "requester_id", "request_id", "command_id", "operation_id", "target_instance_id", "target_session_id", "target_fingerprint", "idempotency_key", "expires_at", "nonce", "signature"])
    || payload.schema_version !== 1
    || auth.schema_version !== 1) return { ok: false, reasonCode: "yeonjang_v2_response_ack_result_invalid" }
  if (value.request_id !== expected.requestId || value.command_id !== expected.commandId || value.operation_id !== expected.operationId || value.idempotency_key !== expected.idempotencyKey || value.requester_id !== expected.enrollment.requesterId || value.target_instance_id !== expected.enrollment.instanceId || value.target_session_id !== expected.enrollment.sessionId || value.target_fingerprint !== expected.targetFingerprint || payload.receipt_id !== expected.receiptId || payload.target_request_id !== expected.targetRequestId || payload.target_command_id !== expected.targetCommandId || payload.target_operation_id !== expected.targetOperationId || payload.target_idempotency_key !== expected.targetIdempotencyKey || payload.terminal_revision !== expected.terminalRevision || payload.response_digest !== expected.responseDigest || auth.requester_id !== value.requester_id || auth.request_id !== value.request_id || auth.command_id !== value.command_id || auth.operation_id !== value.operation_id || auth.target_instance_id !== value.target_instance_id || auth.target_session_id !== value.target_session_id || auth.target_fingerprint !== value.target_fingerprint || auth.idempotency_key !== value.idempotency_key || auth.expires_at !== value.expires_at) return { ok: false, reasonCode: "yeonjang_v2_response_ack_result_identity_mismatch" }
  const bounded = [value.message_id, value.request_id, value.command_id, value.operation_id, value.correlation_id, value.causation_id, value.requester_id, value.target_instance_id, value.target_session_id, value.idempotency_key, auth.issuer, auth.key_id, auth.audience, auth.nonce]
  if ((payload.outcome !== "accepted" && payload.outcome !== "duplicate")
    || !bounded.every(isBoundedText)
    || !Number.isSafeInteger(value.issued_at) || !Number.isSafeInteger(value.expires_at) || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1
    || Number(value.issued_at) > input.nowMs || Number(value.expires_at) <= input.nowMs || Number(value.expires_at) <= Number(value.issued_at)
    || !Number.isSafeInteger(payload.terminal_revision) || Number(payload.terminal_revision) < 1
    || (payload.delivery_revision !== undefined && (!Number.isSafeInteger(payload.delivery_revision) || Number(payload.delivery_revision) < 1))
    || typeof payload.receipt_id !== "string" || !/^receipt-[0-9a-f]{56}$/u.test(payload.receipt_id)
    || typeof payload.response_digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(payload.response_digest)
    || typeof value.target_fingerprint !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(value.target_fingerprint)
    || auth.scope !== "response.ack.result" || auth.issuer !== expected.enrollment.instanceId || auth.audience !== expected.enrollment.requesterId || typeof auth.signature !== "string" || !/^[0-9a-f]{64}$/u.test(auth.signature)) return { ok: false, reasonCode: "yeonjang_v2_response_ack_result_invalid" }
  const payloadDigest = createHash("sha256").update(JSON.stringify(payload)).digest()
  const bytes: Buffer[] = []
  for (const [name, nested] of [["domain", "yeonjang.response-ack-result.authorization.v2"], ["payload_sha256", payloadDigest], ...["message_id", "request_id", "command_id", "operation_id", "correlation_id", "causation_id", "requester_id", "target_instance_id", "target_session_id", "target_fingerprint", "idempotency_key"].map((key) => [key, value[key]]), ["authorization_issuer", auth.issuer], ["authorization_key_id", auth.key_id], ["authorization_audience", auth.audience], ["authorization_scope", auth.scope], ["authorization_nonce", auth.nonce], ["issued_at", value.issued_at], ["expires_at", value.expires_at], ["sequence", value.sequence]] as Array<[string, unknown]>) field(bytes, name, Buffer.isBuffer(nested) ? nested : typeof nested === "number" ? u64(nested) : Buffer.from(String(nested)))
  const calculated = createHmac("sha256", input.hmacKey).update(Buffer.concat(bytes)).digest()
  const observed = Buffer.from(auth.signature, "hex")
  if (observed.length !== calculated.length || !timingSafeEqual(observed, calculated)) return { ok: false, reasonCode: "yeonjang_v2_response_ack_result_signature_rejected" }
  return { ok: true, outcome: payload.outcome, deliveryRevision: Number.isSafeInteger(payload.delivery_revision) ? Number(payload.delivery_revision) : null }
}

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value) }
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key)) }
function isBoundedText(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= 256 }

function signingBytes(envelope: Record<string, unknown>, ack: Record<string, unknown>): Buffer {
  const payloadParts: Buffer[] = []
  for (const [name, value] of [
    ["control", "response.ack"], ["receipt_id", ack.receipt_id], ["target_request_id", ack.target_request_id],
    ["target_command_id", ack.target_command_id], ["target_operation_id", ack.target_operation_id],
    ["target_idempotency_key", ack.target_idempotency_key], ["response_digest", ack.response_digest],
    ["terminal_revision", ack.terminal_revision],
  ] as const) field(payloadParts, name, typeof value === "number" ? u64(value) : Buffer.from(String(value)))
  const digest = createHash("sha256").update(Buffer.concat(payloadParts)).digest()
  const auth = envelope.authorization as Record<string, unknown>
  const values: Array<[string, unknown]> = [
    ["domain", "yeonjang.response-ack.authorization.v2"], ["protocol_version", 2], ["schema_id", envelope.schema_id], ["message_kind", "control"], ["payload_sha256", digest],
    ...["message_id", "request_id", "command_id", "operation_id", "correlation_id", "causation_id", "requester_id", "target_instance_id", "target_session_id", "target_fingerprint", "idempotency_key"].map((name) => [name, envelope[name]] as [string, unknown]),
    ["issued_at", envelope.issued_at], ["expires_at", envelope.expires_at], ["sequence", envelope.sequence], ["authorization_schema_version", 1],
    ...[["authorization_id", "authorization_id"], ["authorization_issuer", "issuer"], ["authorization_key_id", "key_id"], ["authorization_audience", "audience"], ["authorization_scope", "scope"], ["authorization_requester_id", "requester_id"], ["authorization_command_id", "command_id"], ["authorization_operation_id", "operation_id"], ["authorization_target_instance_id", "target_instance_id"], ["authorization_target_session_id", "target_session_id"], ["authorization_target_fingerprint", "target_fingerprint"], ["authorization_idempotency_key", "idempotency_key"], ["authorization_receipt_id", "receipt_id"], ["authorization_target_request_id", "target_request_id"], ["authorization_target_command_id", "target_command_id"], ["authorization_target_operation_id", "target_operation_id"], ["authorization_target_idempotency_key", "target_idempotency_key"], ["authorization_response_digest", "response_digest"]].map(([out, key]) => [out!, auth[key!]] as [string, unknown]),
    ["authorization_terminal_revision", auth.terminal_revision], ["authorization_expires_at", auth.expires_at], ["authorization_nonce", auth.nonce],
  ]
  const output: Buffer[] = []
  for (const [name, value] of values) field(output, name, Buffer.isBuffer(value) ? value : typeof value === "number" ? u64(value) : Buffer.from(String(value)))
  return Buffer.concat(output)
}
function field(output: Buffer[], name: string, value: Buffer): void { const key = Buffer.from(name); output.push(u64(key.length), key, u64(value.length), value) }
function u64(value: number): Buffer { const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(value)); return bytes }
