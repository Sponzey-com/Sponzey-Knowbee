import { createHash, createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  admitYeonjangMqttV2CapturePermissionResponse,
  createYeonjangMqttV2CapturePermissionQuery,
} from "../packages/core/src/yeonjang/mqtt-v2-permission.ts"

const hmacKey = Buffer.from("22".repeat(32), "hex")

describe("Yeonjang MQTT v2 capture permission contract", () => {
  it("builds one signed, read-only capture permission control query", () => {
    const query = createYeonjangMqttV2CapturePermissionQuery({
      enrollment: { instanceId: "instance-a", sessionId: "session-a", requesterId: "requester-a" },
      targetFingerprint: `sha256:${"34".repeat(32)}`,
      identity: {
        messageId: "message-a", requestId: "request-a", commandId: "command-a",
        operationId: "operation-a", correlationId: "correlation-a", causationId: "causation-a",
        idempotencyKey: "idempotency-a", authorizationId: "authorization-a", nonce: "nonce-a",
      },
      issuedAt: 1_000,
      expiresAt: 2_000,
      sequence: 1,
      hmacKey,
    })

    expect(query.topic).toBe(
      "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/control",
    )
    expect(query.envelope).toMatchObject({
      protocol_version: 2,
      schema_id: "yeonjang.control.v2",
      message_kind: "control",
      payload: { control: "capture.permission.get", params: {} },
      authorization: {
        scope: "permission.read",
        issuer: "requester-a",
        audience: "instance-a",
        signature: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
    })
  })

  it("accepts a valid v2 identity that starts with a digit", () => {
    expect(() => createYeonjangMqttV2CapturePermissionQuery({
      enrollment: { instanceId: "1instance", sessionId: "2session", requesterId: "3requester" },
      targetFingerprint: `sha256:${"34".repeat(32)}`,
      identity: {
        messageId: "4message", requestId: "5request", commandId: "6command",
        operationId: "7operation", correlationId: "8correlation", causationId: "9causation",
        idempotencyKey: "0idempotency", authorizationId: "1authorization", nonce: "2nonce",
      },
      issuedAt: 1_000,
      expiresAt: 2_000,
      sequence: 1,
      hmacKey,
    })).not.toThrow()
  })

  it("admits only a signed permission response bound to the exact query identity", () => {
    const identity = {
      messageId: "message-a", requestId: "request-a", commandId: "command-a",
      operationId: "operation-a", correlationId: "correlation-a", causationId: "causation-a",
      idempotencyKey: "idempotency-a", authorizationId: "authorization-a", nonce: "nonce-a",
    }
    const query = createYeonjangMqttV2CapturePermissionQuery({
      enrollment: { instanceId: "instance-a", sessionId: "session-a", requesterId: "requester-a" },
      targetFingerprint: `sha256:${"34".repeat(32)}`,
      identity,
      issuedAt: 1_000,
      expiresAt: 2_000,
      sequence: 1,
      hmacKey,
    })
    const payload = {
      outcome: "available",
      policyRevision: 1,
      permissions: [{
        method: "camera.capture",
        resource: "camera",
        settingName: "allow_camera_access",
        platformAvailable: true,
        localPolicy: "allowed",
        policyResource: "any",
        osPermission: "granted",
      }],
    }
    const response = {
      protocol_version: 2,
      schema_id: "yeonjang.capture-permission-response.v2",
      message_kind: "response",
      message_id: "permission-response-a",
      request_id: identity.requestId,
      command_id: identity.commandId,
      operation_id: identity.operationId,
      correlation_id: identity.correlationId,
      causation_id: identity.messageId,
      requester_id: "requester-a",
      target_instance_id: "instance-a",
      target_session_id: "session-a",
      target_fingerprint: `sha256:${"34".repeat(32)}`,
      idempotency_key: identity.idempotencyKey,
      issued_at: 1_100,
      expires_at: 2_000,
      sequence: 1,
      payload,
      authorization: {
        schema_version: 1,
        issuer: "instance-a",
        key_id: "instance-hmac-v2",
        audience: "requester-a",
        scope: "response.publish",
        requester_id: "requester-a",
        request_id: identity.requestId,
        command_id: identity.commandId,
        operation_id: identity.operationId,
        target_instance_id: "instance-a",
        target_session_id: "session-a",
        target_fingerprint: `sha256:${"34".repeat(32)}`,
        idempotency_key: identity.idempotencyKey,
        expires_at: 2_000,
        nonce: "permission-response-nonce",
        signature: "",
      },
    }
    response.authorization.signature = createHmac("sha256", hmacKey)
      .update(permissionResponseSigningBytes(response))
      .digest("hex")

    expect(admitYeonjangMqttV2CapturePermissionResponse({
      payload: Buffer.from(JSON.stringify(response)),
      nowMs: 1_500,
      hmacKey,
      expected: {
        enrollment: query.enrollment,
        requestId: identity.requestId,
        commandId: identity.commandId,
        operationId: identity.operationId,
        idempotencyKey: identity.idempotencyKey,
        targetFingerprint: `sha256:${"34".repeat(32)}`,
      },
    })).toEqual({
      ok: true,
      permission: {
        outcome: "available",
        policyRevision: 1,
        permissions: [{
          method: "camera.capture",
          resource: "camera",
          settingName: "allow_camera_access",
          platformAvailable: true,
          localPolicy: "allowed",
          policyResource: "any",
          osPermission: "granted",
        }],
      },
    })
  })
})

type PermissionResponseFixture = {
  readonly protocol_version: number
  readonly schema_id: string
  readonly message_kind: string
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
  readonly payload: Record<string, unknown>
  readonly authorization: {
    readonly schema_version: number
    readonly issuer: string
    readonly key_id: string
    readonly audience: string
    readonly scope: string
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
    signature: string
  }
}

function permissionResponseSigningBytes(response: PermissionResponseFixture): Buffer {
  const chunks: Buffer[] = []
  const append = (name: string, value: Buffer) => {
    const nameBytes = Buffer.from(name)
    const length = Buffer.alloc(8)
    length.writeBigUInt64BE(BigInt(nameBytes.length))
    const valueLength = Buffer.alloc(8)
    valueLength.writeBigUInt64BE(BigInt(value.length))
    chunks.push(length, nameBytes, valueLength, value)
  }
  const text = (name: string, value: string) => append(name, Buffer.from(value))
  const u64 = (name: string, value: number) => {
    const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(value)); append(name, bytes)
  }
  const i64 = (name: string, value: number) => {
    const bytes = Buffer.alloc(8); bytes.writeBigInt64BE(BigInt(value)); append(name, bytes)
  }
  const authorization = response.authorization
  text("domain", "yeonjang.capture-permission-response.authorization.v2")
  append("payload_sha256", createHash("sha256").update(JSON.stringify(response.payload)).digest())
  for (const [name, value] of [
    ["schema_id", response.schema_id], ["message_kind", response.message_kind], ["message_id", response.message_id],
    ["request_id", response.request_id], ["command_id", response.command_id], ["operation_id", response.operation_id],
    ["correlation_id", response.correlation_id], ["causation_id", response.causation_id], ["requester_id", response.requester_id],
    ["target_instance_id", response.target_instance_id], ["target_session_id", response.target_session_id],
    ["target_fingerprint", response.target_fingerprint], ["idempotency_key", response.idempotency_key],
    ["authorization_issuer", authorization.issuer], ["authorization_key_id", authorization.key_id],
    ["authorization_audience", authorization.audience], ["authorization_scope", authorization.scope],
    ["authorization_requester_id", authorization.requester_id], ["authorization_request_id", authorization.request_id],
    ["authorization_command_id", authorization.command_id], ["authorization_operation_id", authorization.operation_id],
    ["authorization_target_instance_id", authorization.target_instance_id], ["authorization_target_session_id", authorization.target_session_id],
    ["authorization_target_fingerprint", authorization.target_fingerprint], ["authorization_idempotency_key", authorization.idempotency_key],
    ["authorization_nonce", authorization.nonce],
  ] as const) text(name, value)
  u64("protocol_version", response.protocol_version)
  u64("sequence", response.sequence)
  u64("authorization_schema_version", authorization.schema_version)
  i64("issued_at", response.issued_at)
  i64("expires_at", response.expires_at)
  i64("authorization_expires_at", authorization.expires_at)
  return Buffer.concat(chunks)
}
