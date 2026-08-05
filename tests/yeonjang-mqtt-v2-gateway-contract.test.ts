import { createHash, createHmac } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { connect, createServer } from "node:net"
import mqtt from "../packages/core/node_modules/mqtt/build/index.js"
import { describe, expect, it, vi } from "vitest"
import { loadConfigSnapshot } from "../packages/core/src/config/index.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import {
  admitYeonjangMqttV2Observation,
  buildYeonjangMqttV2Topics,
  createYeonjangMqttV2Command,
  deriveYeonjangMqttV2HmacKey,
  mapYeonjangMqttV2WireIdentity,
  parseYeonjangMqttV2Enrollment,
  parseYeonjangMqttV2ObservationTopic,
} from "../packages/core/src/yeonjang/mqtt-v2-contract.js"
import { projectYeonjangMqttV2StatusToRegistryObservation } from "../packages/core/src/yeonjang/mqtt-v2-registry-adapter.js"
import { admitYeonjangMqttV2TerminalResponse } from "../packages/core/src/yeonjang/mqtt-v2-response.js"
import { resolveYeonjangMqttV2Target } from "../packages/core/src/yeonjang/mqtt-v2-target.js"
import {
  admitYeonjangMqttV2ArtifactFetchRejection,
  createYeonjangMqttV2ArtifactAssembler,
  createYeonjangMqttV2ArtifactControl,
} from "../packages/core/src/yeonjang/mqtt-v2-artifact.js"
import { admitYeonjangMqttV2ResponseAckResult, createYeonjangMqttV2ResponseAck } from "../packages/core/src/yeonjang/mqtt-v2-response-ack.js"
import { createYeonjangMqttV2Cancellation } from "../packages/core/src/yeonjang/mqtt-v2-cancel.js"
import { closeDb } from "../packages/core/src/db/index.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"
import {
  admitMqttV2RequesterRoute,
  createMqttV2RequesterRouteError,
  expireMqttV2Observations,
  getMqttBrokerSnapshot,
  getMqttExtensionSnapshots,
  startMqttBroker,
  stopMqttBroker,
} from "../packages/core/src/mqtt/broker.js"
import {
  invokeYeonjangMethod,
  projectYeonjangMqttV2TerminalFailure,
} from "../packages/core/src/yeonjang/mqtt-client.js"
import {
  listYeonjangRegistryInstances,
  upsertYeonjangRegistryObservation,
} from "../packages/core/src/yeonjang/registry.ts"

const mqttFieldDebug = vi.hoisted(() => vi.fn())

vi.mock("../packages/core/src/logger/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../packages/core/src/logger/index.js")>()
  return {
    ...actual,
    createLogger(namespace: string) {
      return { ...actual.createLogger(namespace), fieldDebug: mqttFieldDebug }
    },
  }
})

describe("Gateway Yeonjang MQTT v2 external contract", () => {
  it("preserves a camera OS preflight rejection from the signed v2 terminal", () => {
    expect(projectYeonjangMqttV2TerminalFailure({
      method: "camera.capture",
      commandId: "command-v2",
      operationId: "operation-v2",
      targetFingerprint: `sha256:${"34".repeat(32)}`,
      executionOutcome: "blocked",
      failure: {
        stage: "os_preflight",
        reason_code: "permission_not_determined",
        effect_state: "not_started",
        retry_safety: "local_action_required",
        recovery_action: "complete_local_os_setup",
      },
    })).toEqual({
      code: "camera_permission_not_determined",
      message: "Yeonjang MQTT v2 execution did not succeed.",
      attempt: {
        schemaVersion: 1,
        method: "camera.capture",
        commandId: "command-v2",
        operationId: "operation-v2",
        targetFingerprint: `sha256:${"34".repeat(32)}`,
        terminalStage: "rejected",
        reasonCode: "camera_permission_not_determined",
        retrySafety: "change_strategy",
      },
    })
  })

  it("projects a screen OS permission denial as a screen-specific pre-effect rejection", () => {
    expect(projectYeonjangMqttV2TerminalFailure({
      method: "screen.capture",
      commandId: "command-screen-v2",
      operationId: "operation-screen-v2",
      targetFingerprint: `sha256:${"56".repeat(32)}`,
      executionOutcome: "blocked",
      failure: {
        stage: "os_preflight",
        reason_code: "permission_denied",
        effect_state: "not_started",
        retry_safety: "local_action_required",
        recovery_action: "complete_local_os_setup",
      },
    })).toMatchObject({
      code: "screen_permission_denied",
      attempt: {
        method: "screen.capture",
        terminalStage: "rejected",
        reasonCode: "screen_permission_denied",
        retrySafety: "change_strategy",
      },
    })
  })

  it("loads one explicit requester identity from the immutable startup snapshot", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-config-"))
    try {
      const paths = createRuntimePaths(
        { KNOWBEE_STATE_DIR: root },
        { homeDir: root, exists: () => false },
      )
      const config = loadConfigSnapshot({
        baseEnv: { KNOWBEE_MQTT_V2_REQUESTER_ID: "gateway-main" },
        cwd: root,
        paths,
      })

      expect(config.mqtt.yeonjangV2).toEqual({ requesterId: "gateway-main" })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("adds requester enrollment without replacing persisted broker configuration", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-config-merge-"))
    try {
      const paths = createRuntimePaths(
        { KNOWBEE_STATE_DIR: root },
        { homeDir: root, exists: () => false },
      )
      writeFileSync(paths.configFile, JSON.stringify({
        mqtt: {
          enabled: true,
          host: "127.0.0.1",
          port: 28_883,
          username: "persisted-user",
          password: "persisted-password",
          allowAnonymous: false,
        },
      }))

      const config = loadConfigSnapshot({
        baseEnv: { KNOWBEE_MQTT_V2_REQUESTER_ID: "gateway-main" },
        cwd: root,
        paths,
      })

      expect(config.mqtt).toEqual({
        enabled: true,
        host: "127.0.0.1",
        port: 28_883,
        username: "persisted-user",
        password: "persisted-password",
        allowAnonymous: false,
        yeonjangV2: { requesterId: "gateway-main" },
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects an invalid requester identity at the startup configuration boundary", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-config-invalid-"))
    try {
      const paths = createRuntimePaths(
        { KNOWBEE_STATE_DIR: root },
        { homeDir: root, exists: () => false },
      )
      expect(() => loadConfigSnapshot({
        baseEnv: { KNOWBEE_MQTT_V2_REQUESTER_ID: "Gateway/+" },
        cwd: root,
        paths,
      })).toThrow("Invalid MQTT v2 requester ID")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("binds every route to one exact instance, session, and requester", () => {
    expect(buildYeonjangMqttV2Topics({
      instanceId: "instance-a",
      sessionId: "session-a",
      requesterId: "requester-a",
    })).toEqual({
      commandTopic: "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/command",
      controlTopic: "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/control",
      adminTopic: "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/admin",
      responseTopic: "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/response",
      eventTopic: "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/event",
      statusTopic: "yeonjang/v2/instances/instance-a/sessions/session-a/status",
      capabilitiesTopic: "yeonjang/v2/instances/instance-a/sessions/session-a/capabilities",
      artifactChunkFilter: "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/artifact/+/chunk",
    })
  })

  it("rejects requester-scoped broker routes that do not match immutable startup enrollment", () => {
    expect(admitMqttV2RequesterRoute(
      "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/command",
      "requester-a",
    )).toEqual({ ok: true, requesterId: "requester-a" })
    expect(admitMqttV2RequesterRoute(
      "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-b/response",
      "requester-a",
    )).toEqual({ ok: false, reasonCode: "mqtt_v2_requester_mismatch" })
    expect(admitMqttV2RequesterRoute(
      "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/control",
      "",
    )).toEqual({ ok: false, reasonCode: "mqtt_v2_requester_config_required" })
    expect(admitMqttV2RequesterRoute(
      "yeonjang/v2/instances/instance-a/sessions/session-a/status",
      "requester-a",
    )).toEqual({ ok: true, requesterId: null })
  })

  it("keeps requester-route authorization failures distinct from broker credential failures", () => {
    expect(createMqttV2RequesterRouteError("mqtt_v2_requester_mismatch"))
      .toMatchObject({
        message: "MQTT v2 requester route rejected: mqtt_v2_requester_mismatch",
        code: "mqtt_v2_requester_mismatch",
        returnCode: 5,
      })
    expect(createMqttV2RequesterRouteError("mqtt_v2_requester_config_required").message)
      .not.toContain("인증")
  })

  it("rejects empty, wildcard, mixed-case, and overlong enrollment identities", () => {
    for (const instanceId of ["", "instance/+", "Instance-a", `a${"b".repeat(64)}`]) {
      expect(parseYeonjangMqttV2Enrollment({
        instanceId,
        sessionId: "session-a",
        requesterId: "requester-a",
      })).toEqual({ ok: false, reasonCode: "yeonjang_v2_enrollment_invalid" })
    }
  })

  it("recognizes only exact status and capability projection topics", () => {
    expect(parseYeonjangMqttV2ObservationTopic(
      "yeonjang/v2/instances/instance-a/sessions/session-a/status",
    )).toEqual({
      instanceId: "instance-a",
      sessionId: "session-a",
      kind: "status",
    })
    expect(parseYeonjangMqttV2ObservationTopic(
      "yeonjang/v2/instances/instance-a/sessions/session-a/capabilities",
    )).toEqual({
      instanceId: "instance-a",
      sessionId: "session-a",
      kind: "capabilities",
    })
    for (const topic of [
      "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/status",
      "yeonjang/v2/instances/instance-a/sessions/session-a/response",
      "yeonjang/v2/instances/+/sessions/session-a/status",
      "knowbee/v1/node/instance-a/status",
    ]) {
      expect(parseYeonjangMqttV2ObservationTopic(topic)).toBeNull()
    }
  })

  it("admits a retained, signed, exact-session online status projection", () => {
    const hmacKey = Buffer.from("22".repeat(32), "hex")
    const fixture = signedStatusFixture(hmacKey)
    expect(admitYeonjangMqttV2Observation({
      topic: "yeonjang/v2/instances/instance-a/sessions/session-a/status",
      payload: Buffer.from(JSON.stringify(fixture)),
      retained: true,
      nowMs: 1_000,
      hmacKey,
    })).toEqual({
      ok: true,
      observation: {
        kind: "status",
        instanceId: "instance-a",
        sessionId: "session-a",
        targetFingerprint: `sha256:${"34".repeat(32)}`,
        state: "online",
        observedAt: 900,
        expiresAt: 2_000,
        sequence: 1,
      },
    })
  })

  it("rejects non-retained, tampered, and wrong-session status projections", () => {
    const hmacKey = Buffer.from("22".repeat(32), "hex")
    const fixture = signedStatusFixture(hmacKey)
    const base = {
      topic: "yeonjang/v2/instances/instance-a/sessions/session-a/status",
      payload: Buffer.from(JSON.stringify(fixture)),
      retained: true,
      nowMs: 1_000,
      hmacKey,
    }
    expect(admitYeonjangMqttV2Observation({ ...base, retained: false }))
      .toEqual({ ok: false, reasonCode: "yeonjang_v2_observation_non_retained" })
    expect(admitYeonjangMqttV2Observation({
      ...base,
      payload: Buffer.from(JSON.stringify({ ...fixture, sequence: 2 })),
    })).toEqual({ ok: false, reasonCode: "yeonjang_v2_observation_signature_rejected" })
    expect(admitYeonjangMqttV2Observation({
      ...base,
      topic: "yeonjang/v2/instances/instance-a/sessions/session-b/status",
    })).toEqual({ ok: false, reasonCode: "yeonjang_v2_observation_identity_mismatch" })
  })

  it("admits the signed retained offline Last Will without losing i64::MAX precision", () => {
    const hmacKey = Buffer.from("22".repeat(32), "hex")
    expect(admitYeonjangMqttV2Observation({
      topic: "yeonjang/v2/instances/instance-a/sessions/session-a/status",
      payload: signedOfflineStatusFixture(hmacKey),
      retained: true,
      nowMs: 1_000,
      hmacKey,
    })).toEqual({
      ok: true,
      observation: expect.objectContaining({ state: "offline", expiresAt: null, sequence: 2 }),
    })
  })

  it("admits the signed v2 camera and screen capability projection", () => {
    const hmacKey = Buffer.from("22".repeat(32), "hex")
    const fixture = signedCapabilitiesFixture(hmacKey)
    expect(admitYeonjangMqttV2Observation({
      topic: "yeonjang/v2/instances/instance-a/sessions/session-a/capabilities",
      payload: Buffer.from(JSON.stringify(fixture)),
      retained: true,
      nowMs: 1_000,
      hmacKey,
    })).toEqual({
      ok: true,
      observation: expect.objectContaining({
        kind: "capabilities",
        instanceId: "instance-a",
        sessionId: "session-a",
        platform: "macos",
        policyRevision: 1,
        advertisedMethods: ["camera.capture", "screen.capture"],
        sequence: 1,
      }),
    })
  })

  it("projects admitted v2 liveness through the existing registry writer identity", () => {
    expect(projectYeonjangMqttV2StatusToRegistryObservation({
      status: {
        kind: "status",
        instanceId: "instance-a",
        sessionId: "session-v2",
        targetFingerprint: `sha256:${"34".repeat(32)}`,
        state: "online",
        observedAt: 1_000,
        expiresAt: 2_000,
        sequence: 1,
      },
      clientId: "client-v2",
      existing: {
        instanceId: "instance-a",
        instanceAlias: "localhost",
        displayName: "Yeonjang",
        nodeId: "yeonjang-main",
        supportProfile: "desktop_interactive",
        platform: "macos",
        arch: "aarch64",
        version: "0.1.0",
        capabilityHash: "sha256:existing",
        methodCount: 37,
        workspaceScopeId: "workspace-local",
        trustState: "trusted",
      },
    })).toEqual(expect.objectContaining({
      instanceId: "instance-a",
      instanceAlias: "localhost",
      displayName: "Yeonjang",
      nodeId: "yeonjang-main",
      sessionId: "session-v2",
      connectionState: "online",
      protocolVersion: "2",
      transport: ["mqtt_v2"],
      methodCount: 0,
      trustState: "trusted",
      observedAt: 1_000,
    }))
  })

  it("derives the requester HMAC key with the Yeonjang v2 domain separator", () => {
    expect(deriveYeonjangMqttV2HmacKey(Buffer.from("0123456789abcdef")).toString("hex"))
      .toBe("58174b32bbc2a3af27839071caa1f8dac3a9f27230966c43f203d19c74aaac7b")
  })

  it("maps non-wire canonical identities deterministically without semantic inference", () => {
    expect(mapYeonjangMqttV2WireIdentity("operation", "operation:run:executing:tool:camera:123"))
      .toMatch(/^operation-[0-9a-f]{54}$/u)
    expect(mapYeonjangMqttV2WireIdentity("command", "command-v2")).toBe("command-v2")
  })

  it("signs one exact camera command without reconstructing operation identity", () => {
    const command = createYeonjangMqttV2Command({
      enrollment: {
        instanceId: "instance-a",
        sessionId: "session-a",
        requesterId: "requester-a",
      },
      targetFingerprint: `sha256:${"34".repeat(32)}`,
      method: "camera.capture",
      params: { device_id: "camera-a", capture_timeout_ms: 1_000 },
      identity: {
        messageId: "message-v2",
        requestId: "request-v2",
        commandId: "command-v2",
        operationId: "operation-v2",
        correlationId: "correlation-v2",
        causationId: "causation-v2",
        idempotencyKey: "idempotency-v2",
        cancellationId: "cancel-v2",
        cancelToken: "cancel-token-v2",
        authorizationId: "authorization-v2",
        nonce: "nonce-v2",
      },
      issuedAt: 900,
      expiresAt: 2_000,
      sequence: 1,
      hmacKey: Buffer.from("11".repeat(32), "hex"),
    })

    expect(command.topic).toBe(
      "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/command",
    )
    expect(command.envelope.authorization).toEqual(expect.objectContaining({
      issuer: "requester-a",
      key_id: "requester-hmac-v2",
      audience: "instance-a",
      scope: "effect.execute",
      command_id: "command-v2",
      operation_id: "operation-v2",
      target_session_id: "session-a",
    }))
    expect(command.envelope.authorization.signature).toMatch(/^[0-9a-f]{64}$/u)
  })

  it("rejects invalid camera params and expired timing before signing", () => {
    const base = {
      enrollment: {
        instanceId: "instance-a",
        sessionId: "session-a",
        requesterId: "requester-a",
      },
      targetFingerprint: `sha256:${"34".repeat(32)}`,
      method: "camera.capture" as const,
      identity: {
        messageId: "message-v2",
        requestId: "request-v2",
        commandId: "command-v2",
        operationId: "operation-v2",
        correlationId: "correlation-v2",
        causationId: "causation-v2",
        idempotencyKey: "idempotency-v2",
        cancellationId: "cancel-v2",
        cancelToken: "cancel-token-v2",
        authorizationId: "authorization-v2",
        nonce: "nonce-v2",
      },
      issuedAt: 900,
      expiresAt: 2_000,
      sequence: 1,
      hmacKey: Buffer.from("11".repeat(32), "hex"),
    }
    expect(() => createYeonjangMqttV2Command({
      ...base,
      params: { capture_timeout_ms: 60_001 },
    })).toThrow("yeonjang_v2_command_invalid")
    expect(() => createYeonjangMqttV2Command({
      ...base,
      params: {},
      expiresAt: 900,
    })).toThrow("yeonjang_v2_command_invalid")
  })

  it("admits only a signed terminal bound to the exact dispatched operation", () => {
    const hmacKey = Buffer.from("22".repeat(32), "hex")
    const response = signedTerminalFixture(hmacKey)
    const expected = {
      enrollment: { instanceId: "instance-a", sessionId: "session-a", requesterId: "requester-a" },
      requestId: "request-v2",
      commandId: "command-v2",
      operationId: "operation-v2",
      idempotencyKey: "idempotency-v2",
      targetFingerprint: `sha256:${"34".repeat(32)}`,
    } as const
    expect(admitYeonjangMqttV2TerminalResponse({
      payload: Buffer.from(JSON.stringify(response)),
      nowMs: 1_000,
      hmacKey,
      expected,
    })).toEqual({
      ok: true,
      terminal: expect.objectContaining({
        executionOutcome: "succeeded",
        receiptId: expect.stringMatching(/^receipt-[0-9a-f]{56}$/u),
        artifact: expect.objectContaining({ mediaType: "image/jpeg", sizeBytes: 4 }),
      }),
    })

    expect(admitYeonjangMqttV2TerminalResponse({
      payload: Buffer.from(JSON.stringify(response)),
      nowMs: 1_000,
      hmacKey,
      expected: { ...expected, operationId: "another-operation" },
    })).toEqual({ ok: false, reasonCode: "yeonjang_v2_response_identity_mismatch" })
    expect(admitYeonjangMqttV2TerminalResponse({
      payload: Buffer.from(JSON.stringify({ ...response, message_id: "response-tampered" })),
      nowMs: 1_000,
      hmacKey,
      expected,
    })).toEqual({ ok: false, reasonCode: "yeonjang_v2_response_signature_rejected" })
  })

  it("admits a newly registered screen artifact before its first fetch", () => {
    const hmacKey = Buffer.from("22".repeat(32), "hex")
    const expected = {
      enrollment: { instanceId: "instance-a", sessionId: "session-a", requesterId: "requester-a" },
      requestId: "request-v2",
      commandId: "command-v2",
      operationId: "operation-v2",
      idempotencyKey: "idempotency-v2",
      targetFingerprint: `sha256:${"34".repeat(32)}`,
    } as const

    expect(admitYeonjangMqttV2TerminalResponse({
      payload: Buffer.from(JSON.stringify(signedTerminalFixture(hmacKey, "screen"))),
      nowMs: 1_000,
      hmacKey,
      expected,
    })).toEqual({
      ok: true,
      terminal: expect.objectContaining({
        executionOutcome: "succeeded",
        artifact: expect.objectContaining({
          kind: "screen_png",
          mediaType: "image/png",
          lifecycleRevision: 0,
        }),
      }),
    })
  })

  it("admits only the signed fetch rejection bound to the exact artifact transfer", () => {
    const hmacKey = Buffer.from("22".repeat(32), "hex")
    const response = signedArtifactFetchRejectionFixture(hmacKey)
    const expected = {
      enrollment: { instanceId: "instance-a", sessionId: "session-a", requesterId: "requester-a" },
      targetFingerprint: `sha256:${"34".repeat(32)}`,
      messageId: "fetch-message",
      requestId: "fetch-request",
      commandId: "fetch-command",
      operationId: "fetch-operation",
      correlationId: "request-v2",
      idempotencyKey: "fetch-idempotency",
      artifactRef: `capture:${"90".repeat(32)}`,
      ownerRequestId: "request-v2",
      ownerOperationId: "operation-v2",
      transferId: "transfer-a",
      expectedRevision: 1,
    } as const

    expect(admitYeonjangMqttV2ArtifactFetchRejection({
      payload: Buffer.from(JSON.stringify(response)),
      nowMs: 1_000,
      hmacKey,
      expected,
    })).toEqual({ ok: true, rejection: { reason: "revision_conflict" } })
    expect(admitYeonjangMqttV2ArtifactFetchRejection({
      payload: Buffer.from(JSON.stringify(response)),
      nowMs: 1_000,
      hmacKey,
      expected: { ...expected, transferId: "transfer-other" },
    })).toEqual({ ok: false, reasonCode: "yeonjang_v2_artifact_fetch_identity_mismatch" })
    expect(admitYeonjangMqttV2ArtifactFetchRejection({
      payload: Buffer.from(JSON.stringify({ ...response, message_id: "tampered" })),
      nowMs: 1_000,
      hmacKey,
      expected,
    })).toEqual({ ok: false, reasonCode: "yeonjang_v2_artifact_fetch_signature_rejected" })
  })

  it("selects v2 only from one exact live registry projection and never aliases ambiguity", () => {
    const snapshots = [
      { extensionId: "instance-a", nodeId: "yeonjang-main", instanceId: "instance-a", sessionId: "session-a", protocolVersion: "2", state: "online", targetFingerprint: `sha256:${"34".repeat(32)}` },
    ]
    expect(resolveYeonjangMqttV2Target({ snapshots, requestedExtensionId: "yeonjang-main", expectedSessionId: "session-a" }))
      .toEqual({ ok: true, target: { instanceId: "instance-a", sessionId: "session-a", targetFingerprint: `sha256:${"34".repeat(32)}` } })
    expect(resolveYeonjangMqttV2Target({ snapshots, requestedExtensionId: "yeonjang-main", expectedSessionId: "session-b" }))
      .toEqual({ ok: false, reasonCode: "yeonjang_v2_target_session_mismatch" })
    expect(resolveYeonjangMqttV2Target({ snapshots: [...snapshots, { ...snapshots[0]!, extensionId: "instance-b", instanceId: "instance-b" }], requestedExtensionId: "yeonjang-main" }))
      .toEqual({ ok: false, reasonCode: "yeonjang_v2_target_ambiguous" })
  })

  it("assembles only exact YAC2 artifact chunks with verified chunk and full digests", () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
    const fullDigest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`
    const header = {
      schema_version: 1,
      transfer_id: "transfer-a",
      artifact_ref: `capture:${"90".repeat(32)}`,
      owner_requester_id: "requester-a",
      owner_request_id: "request-v2",
      index: 0,
      count: 1,
      offset: 0,
      chunk_size: bytes.length,
      total_size: bytes.length,
      payload_digest: fullDigest,
      full_digest: fullDigest,
      expires_at_ms: 2_000,
    }
    const headerBytes = Buffer.from(JSON.stringify(header))
    const length = Buffer.alloc(4)
    length.writeUInt32BE(headerBytes.length)
    const frame = Buffer.concat([Buffer.from("YAC2"), length, headerBytes, bytes])
    const assembler = createYeonjangMqttV2ArtifactAssembler({
      transferId: "transfer-a",
      artifactRef: header.artifact_ref,
      ownerRequesterId: "requester-a",
      ownerRequestId: "request-v2",
      fullDigest,
      totalSize: bytes.length,
      expiresAtMs: 2_000,
      nowMs: () => 1_000,
    })
    expect(assembler.accept(frame)).toEqual({ ok: true, state: "complete", bytes })
    expect(assembler.accept(Buffer.from("invalid"))).toEqual({ ok: false, reasonCode: "yeonjang_v2_artifact_already_terminal" })
  })

  it("signs artifact fetch, ack, and cancellation on their exact non-retained routes", () => {
    const common = {
      enrollment: { instanceId: "instance-a", sessionId: "session-a", requesterId: "requester-a" },
      targetFingerprint: `sha256:${"34".repeat(32)}`,
      ownerRequestId: "request-v2", ownerOperationId: "operation-v2",
      descriptor: { artifactRef: `capture:${"90".repeat(32)}`, fullDigest: `sha256:${"ab".repeat(32)}`, lifecycleRevision: 1 },
      transferId: "transfer-a", expectedRevision: 1,
      identity: { messageId: "artifact-message", requestId: "artifact-request", commandId: "artifact-command", operationId: "artifact-operation", correlationId: "artifact-correlation", causationId: "response-message", idempotencyKey: "artifact-idempotency", authorizationId: "artifact-authorization", nonce: "artifact-nonce" },
      issuedAt: 900, expiresAt: 2_000, sequence: 1, hmacKey: Buffer.from("22".repeat(32), "hex"),
    } as const
    const fetch = createYeonjangMqttV2ArtifactControl({ ...common, kind: "fetch" })
    const ack = createYeonjangMqttV2ArtifactControl({ ...common, kind: "ack" })
    const cancel = createYeonjangMqttV2ArtifactControl({ ...common, kind: "cancel" })
    expect(fetch.topic).toBe("yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/control")
    expect(ack.topic).toBe("yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/artifact/transfer-a/ack")
    // Rust serializes optional u32 values in the artifact signing bytes as a
    // canonical u64 field. This guards the Gateway/Yeonjang wire contract.
    expect(fetch.envelope.authorization.signature).toBe("62218933d029330cda38d78a8fd8d9171bf666bce96b2eb75f5c7d58273798e4")
    expect(fetch.envelope.authorization.signature).toMatch(/^[0-9a-f]{64}$/u)
    expect(ack.envelope.authorization.signature).toMatch(/^[0-9a-f]{64}$/u)
    expect(cancel.topic).toBe("yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/control")
    expect(cancel.envelope.payload).toEqual(expect.objectContaining({ artifact: "artifact.cancel" }))
    expect(cancel.envelope.authorization).toEqual(expect.objectContaining({
      scope: "artifact.cancel",
      full_digest: null,
      chunk_payload_bytes: null,
      signature: expect.stringMatching(/^[0-9a-f]{64}$/u),
    }))
  })

  it("signs an application response acknowledgement distinct from MQTT PUBACK", () => {
    const ack = createYeonjangMqttV2ResponseAck({
      enrollment: { instanceId: "instance-a", sessionId: "session-a", requesterId: "requester-a" },
      targetFingerprint: `sha256:${"34".repeat(32)}`,
      terminalIdentity: { requestId: "request-v2", commandId: "command-v2", operationId: "operation-v2", idempotencyKey: "idempotency-v2" },
      terminal: { receiptId: `receipt-${"12".repeat(28)}`, responseDigest: `sha256:${"ab".repeat(32)}`, terminalRevision: 1 },
      identity: { messageId: "ack-message", requestId: "ack-request", commandId: "ack-command", operationId: "ack-operation", correlationId: "ack-correlation", causationId: "response-message", idempotencyKey: "ack-idempotency", authorizationId: "ack-authorization", nonce: "ack-nonce" },
      issuedAt: 900, expiresAt: 2_000, sequence: 1, hmacKey: Buffer.from("22".repeat(32), "hex"),
    })
    expect(ack.topic).toBe("yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/control")
    expect((ack.envelope.authorization as Record<string, unknown>).signature).toMatch(/^[0-9a-f]{64}$/u)
    expect(ack.envelope.payload).toEqual(expect.objectContaining({ control: "response.ack" }))
  })

  it("rejects unknown fields and copied authorization identity in response acknowledgement results", () => {
    const hmacKey = Buffer.from("22".repeat(32), "hex")
    const terminal = { receiptId: `receipt-${"12".repeat(28)}`, responseDigest: `sha256:${"ab".repeat(32)}`, terminalRevision: 1 }
    const ack = createYeonjangMqttV2ResponseAck({
      enrollment: { instanceId: "instance-a", sessionId: "session-a", requesterId: "requester-a" },
      targetFingerprint: `sha256:${"34".repeat(32)}`,
      terminalIdentity: { requestId: "request-v2", commandId: "command-v2", operationId: "operation-v2", idempotencyKey: "idempotency-v2" },
      terminal,
      identity: { messageId: "ack-message", requestId: "ack-request", commandId: "ack-command", operationId: "ack-operation", correlationId: "ack-correlation", causationId: "response-message", idempotencyKey: "ack-idempotency", authorizationId: "ack-authorization", nonce: "ack-nonce" },
      issuedAt: 900, expiresAt: 2_000, sequence: 1, hmacKey,
    })
    const result = signedAckResultForControl(hmacKey, ack.envelope as Record<string, any>, 1_000)
    const expected = {
      enrollment: { instanceId: "instance-a", sessionId: "session-a", requesterId: "requester-a" },
      requestId: "ack-request", commandId: "ack-command", operationId: "ack-operation", idempotencyKey: "ack-idempotency",
      targetFingerprint: `sha256:${"34".repeat(32)}`,
      receiptId: terminal.receiptId, targetRequestId: "request-v2", targetCommandId: "command-v2",
      targetOperationId: "operation-v2", targetIdempotencyKey: "idempotency-v2",
      terminalRevision: 1, responseDigest: terminal.responseDigest,
    } as const
    expect(admitYeonjangMqttV2ResponseAckResult({ payload: Buffer.from(JSON.stringify(result)), nowMs: 1_001, hmacKey, expected }))
      .toEqual({ ok: true, outcome: "accepted", deliveryRevision: 2 })
    expect(admitYeonjangMqttV2ResponseAckResult({ payload: Buffer.from(JSON.stringify({ ...result, unexpected: true })), nowMs: 1_001, hmacKey, expected }))
      .toEqual({ ok: false, reasonCode: "yeonjang_v2_response_ack_result_invalid" })
    const copied = structuredClone(result) as Record<string, any>
    copied.authorization.requester_id = "requester-b"
    expect(admitYeonjangMqttV2ResponseAckResult({ payload: Buffer.from(JSON.stringify(copied)), nowMs: 1_001, hmacKey, expected }))
      .toEqual({ ok: false, reasonCode: "yeonjang_v2_response_ack_result_identity_mismatch" })
  })

  it("signs command cancellation against the exact active operation identity", () => {
    const cancellation = createYeonjangMqttV2Cancellation({
      enrollment: { instanceId: "instance-a", sessionId: "session-a", requesterId: "requester-a" },
      targetFingerprint: `sha256:${"34".repeat(32)}`,
      target: {
        requestId: "request-v2",
        commandId: "command-v2",
        operationId: "operation-v2",
        idempotencyKey: "idempotency-v2",
        cancellationId: "cancellation-v2",
        cancelToken: "cancel-token-v2",
      },
      identity: {
        messageId: "cancel-message",
        requestId: "cancel-request",
        commandId: "cancel-command",
        operationId: "cancel-operation",
        correlationId: "cancel-correlation",
        causationId: "command-message",
        idempotencyKey: "cancel-idempotency",
        authorizationId: "cancel-authorization",
        nonce: "cancel-nonce",
      },
      issuedAt: 900,
      expiresAt: 2_000,
      sequence: 1,
      hmacKey: Buffer.from("22".repeat(32), "hex"),
    })

    expect(cancellation.topic).toBe("yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/control")
    expect(cancellation.envelope.payload).toEqual({
      control: "command.cancel",
      params: {
        target_request_id: "request-v2",
        target_command_id: "command-v2",
        target_operation_id: "operation-v2",
        target_idempotency_key: "idempotency-v2",
        cancellation_id: "cancellation-v2",
        cancel_token: "cancel-token-v2",
        reason: "user_requested",
      },
    })
    expect(cancellation.envelope.authorization).toEqual(expect.objectContaining({
      scope: "effect.cancel",
      target_request_id: "request-v2",
      target_command_id: "command-v2",
      target_operation_id: "operation-v2",
      target_idempotency_key: "idempotency-v2",
      cancellation_id: "cancellation-v2",
      cancel_token: "cancel-token-v2",
      signature: expect.stringMatching(/^[0-9a-f]{64}$/u),
    }))
  })

  it("projects an offline Last Will and recovers only after a fresh signed session after broker restart", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-restart-"))
    const port = await reserveTcpPort()
    const password = "broker-secret-for-v2-restart"
    const config = { enabled: true, host: "127.0.0.1", port, username: "mqtt-user", password, allowAnonymous: false, yeonjangV2: { requesterId: "requester-a" } }
    const hmacKey = deriveYeonjangMqttV2HmacKey(Buffer.from(password))
    initializeTestDbRuntime(root)
    expect(upsertYeonjangRegistryObservation({
      instanceId: "instance-a", instanceAlias: "local-mac", displayName: "Camera Workstation",
      nodeId: "yeonjang-main", supportProfile: "desktop_interactive", platform: "macos", arch: "arm64",
      sessionId: "session-old", clientId: null, connectionState: "offline", message: "fixture enrollment",
      version: "0.1.0", protocolVersion: "1", capabilityHash: null, transport: ["mqtt-json"],
      methodCount: 0, observedAt: Date.now() - 10_000,
    })).toEqual(expect.objectContaining({ ok: true }))
    await startMqttBroker(config)
    let producer: ReturnType<typeof mqtt.connect> | null = mqtt.connect(`mqtt://127.0.0.1:${port}`, { clientId: "yeonjang-v2-restart-a", username: config.username, password })
    try {
      await mqttConnected(producer)
      await mqttSubscribe(producer, [
        "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/command",
      ])
      const onlineAt = Date.now()
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/status", signedStatusFixture(hmacKey, onlineAt, onlineAt + 60_000), true)
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/capabilities", signedCapabilitiesFixture(hmacKey, onlineAt, onlineAt + 60_000), true)
      await waitUntil(() => getMqttExtensionSnapshots().some((snapshot) => snapshot.sessionId === "session-a" && snapshot.methods.includes("camera.capture")))

      const staleAt = Date.now()
      await mqttPublishRaw(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/status", signedOfflineStatusFixture(hmacKey, { observedAt: staleAt, sequence: 1, messageId: "stale-offline-message" }), true)
      const fenceAt = Date.now()
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/capabilities", signedCapabilitiesFixture(hmacKey, fenceAt, fenceAt + 60_000, { sequence: 2, messageId: "capabilities-fence" }), true)
      await waitUntil(() => getMqttExtensionSnapshots().some((snapshot) => snapshot.lastCapabilityRefreshAt === fenceAt - 100))
      expect(getMqttExtensionSnapshots().find((snapshot) => snapshot.sessionId === "session-a")?.state).toBe("online")

      const offlineAt = Date.now()
      await mqttPublishRaw(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/status", signedOfflineStatusFixture(hmacKey, { observedAt: offlineAt, sequence: 2 }), true)
      await waitUntil(() => getMqttExtensionSnapshots().some((snapshot) => snapshot.sessionId === "session-a" && snapshot.state === "offline" && snapshot.methods.length === 0))

      await new Promise<void>((resolve) => producer?.end(false, {}, resolve))
      producer = null
      await stopMqttBroker()
      await startMqttBroker(config)
      producer = mqtt.connect(`mqtt://127.0.0.1:${port}`, { clientId: "yeonjang-v2-restart-b", username: config.username, password })
      await mqttConnected(producer)
      await mqttSubscribe(producer, [
        "yeonjang/v2/instances/instance-a/sessions/session-b/requesters/requester-a/command",
      ])
      const recoveredAt = Date.now()
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-b/status", signedStatusFixture(hmacKey, recoveredAt, recoveredAt + 60_000, { sessionId: "session-b", sequence: 1, messageId: "status-message-b" }), true)
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-b/capabilities", signedCapabilitiesFixture(hmacKey, recoveredAt, recoveredAt + 60_000, { sessionId: "session-b", sequence: 1, messageId: "capabilities-message-b" }), true)
      await waitUntil(
        () => getMqttExtensionSnapshots().some((snapshot) => snapshot.sessionId === "session-b" && snapshot.state === "online" && snapshot.methods.includes("camera.capture")),
        () => JSON.stringify(getMqttExtensionSnapshots()),
      )
    } finally {
      hmacKey.fill(0)
      if (producer) await new Promise<void>((resolve) => producer?.end(false, {}, resolve))
      await stopMqttBroker()
      closeDb()
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)

  it("accepts restarted status and capabilities sequences from a new authenticated connection generation", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-connection-epoch-"))
    const port = await reserveTcpPort()
    const password = "broker-secret-for-v2-connection-epoch"
    const config = {
      enabled: true,
      host: "127.0.0.1",
      port,
      username: "mqtt-user",
      password,
      allowAnonymous: false,
      yeonjangV2: { requesterId: "requester-a" },
    }
    const hmacKey = deriveYeonjangMqttV2HmacKey(Buffer.from(password))
    initializeTestDbRuntime(root)
    expect(upsertYeonjangRegistryObservation({
      instanceId: "instance-a",
      instanceAlias: "stable-runtime",
      displayName: "Stable Runtime Camera",
      nodeId: "yeonjang-main",
      supportProfile: "desktop_interactive",
      platform: "macos",
      arch: "arm64",
      sessionId: "session-stable",
      clientId: null,
      connectionState: "offline",
      message: "awaiting runtime connection",
      version: "0.1.0",
      protocolVersion: "2",
      capabilityHash: null,
      transport: ["mqtt_v2"],
      methodCount: 0,
      observedAt: Date.now() - 10_000,
    })).toEqual(expect.objectContaining({ ok: true }))
    await startMqttBroker(config)
    let producer: ReturnType<typeof mqtt.connect> | null = mqtt.connect(
      `mqtt://127.0.0.1:${port}`,
      {
        clientId: "yeonjang-v2-stable-client",
        username: config.username,
        password,
        reconnectPeriod: 0,
      },
    )
    const requesterTopic =
      "yeonjang/v2/instances/instance-a/sessions/session-stable/requesters/requester-a/command"
    const statusTopic = "yeonjang/v2/instances/instance-a/sessions/session-stable/status"
    const capabilitiesTopic =
      "yeonjang/v2/instances/instance-a/sessions/session-stable/capabilities"
    try {
      await mqttConnected(producer)
      await mqttSubscribe(producer, [requesterTopic])
      await waitUntil(() => getMqttBrokerSnapshot().clientCount === 1)
      await new Promise((resolve) => setTimeout(resolve, 150))
      const firstObservedAt = Date.now()
      await mqttPublish(
        producer,
        statusTopic,
        signedStatusFixture(hmacKey, firstObservedAt, firstObservedAt + 60_000, {
          sessionId: "session-stable",
          sequence: 50,
          messageId: "status-before-runtime-restart",
        }),
        true,
      )
      await mqttPublish(
        producer,
        capabilitiesTopic,
        signedCapabilitiesFixture(hmacKey, firstObservedAt, firstObservedAt + 60_000, {
          sessionId: "session-stable",
          sequence: 50,
          messageId: "capabilities-before-runtime-restart",
        }),
        true,
      )
      await waitUntil(() => getMqttExtensionSnapshots().some((snapshot) => (
        snapshot.sessionId === "session-stable"
        && snapshot.v2StatusSequence === 50
        && snapshot.v2CapabilitiesSequence === 50
        && snapshot.v2CapabilitiesExpiresAt === firstObservedAt + 60_000
      )))

      await new Promise<void>((resolve) => producer?.end(true, {}, resolve))
      await waitUntil(() => getMqttBrokerSnapshot().clientCount === 0)
      producer = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
        clientId: "yeonjang-v2-stable-client",
        username: config.username,
        password,
        reconnectPeriod: 0,
      })
      await mqttConnected(producer)
      await mqttSubscribe(producer, [requesterTopic])
      await waitUntil(() => getMqttBrokerSnapshot().clientCount === 1)
      const restartedObservedAt = Math.max(Date.now(), firstObservedAt + 1)
      await mqttPublish(
        producer,
        statusTopic,
        signedStatusFixture(hmacKey, restartedObservedAt, restartedObservedAt + 60_000, {
          sessionId: "session-stable",
          sequence: 1,
          messageId: "status-after-runtime-restart",
        }),
        true,
      )
      await mqttPublish(
        producer,
        capabilitiesTopic,
        signedCapabilitiesFixture(hmacKey, restartedObservedAt, restartedObservedAt + 60_000, {
          sessionId: "session-stable",
          sequence: 1,
          messageId: "capabilities-after-runtime-restart",
        }),
        true,
      )

      await waitUntil(
        () => getMqttExtensionSnapshots().some((snapshot) => (
          snapshot.sessionId === "session-stable"
          && snapshot.state === "online"
          && snapshot.v2StatusSequence === 1
          && snapshot.v2CapabilitiesSequence === 1
          && snapshot.v2CapabilitiesExpiresAt === restartedObservedAt + 60_000
          && snapshot.methods.includes("camera.capture")
        )),
        () => JSON.stringify(getMqttExtensionSnapshots()),
      )
    } finally {
      hmacKey.fill(0)
      if (producer) await new Promise<void>((resolve) => producer?.end(true, {}, resolve))
      await stopMqttBroker()
      closeDb()
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)

  it("disconnects an active MQTT client while stopping instead of waiting on the TCP socket", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-active-client-stop-"))
    const port = await reserveTcpPort()
    initializeTestDbRuntime(root)
    await startMqttBroker({
      enabled: true,
      host: "127.0.0.1",
      port,
      username: "mqtt-user",
      password: "broker-secret-for-active-client-stop",
      allowAnonymous: false,
      yeonjangV2: { requesterId: "requester-a" },
    })
    const producer = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
      clientId: "yeonjang-v2-active-during-stop",
      username: "mqtt-user",
      password: "broker-secret-for-active-client-stop",
      reconnectPeriod: 0,
    })
    let stopping: Promise<void> | null = null
    try {
      await mqttConnected(producer)
      stopping = stopMqttBroker()
      const outcome = await Promise.race([
        stopping.then(() => "stopped" as const),
        new Promise<"timed_out">((resolve) => setTimeout(() => resolve("timed_out"), 500)),
      ])
      expect(outcome).toBe("stopped")
      await stopping
      expect(getMqttBrokerSnapshot()).toMatchObject({ running: false, clientCount: 0 })
    } finally {
      producer.end(true)
      await stopping
      await stopMqttBroker()
      closeDb()
      rmSync(root, { recursive: true, force: true })
    }
  }, 5_000)

  it("marks persisted v2 liveness offline at broker startup until a fresh signed status arrives", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-startup-fence-"))
    const port = await reserveTcpPort()
    initializeTestDbRuntime(root)
    expect(upsertYeonjangRegistryObservation({
      instanceId: "instance-a", instanceAlias: "local-mac", displayName: "Camera Workstation",
      nodeId: "yeonjang-main", supportProfile: "desktop_interactive", platform: "macos", arch: "arm64",
      sessionId: "session-before-restart", clientId: "old-client", connectionState: "online",
      message: "persisted online before restart", version: "0.1.0", protocolVersion: "2",
      capabilityHash: null, transport: ["mqtt_v2"], methodCount: 2, observedAt: Date.now() - 1_000,
    })).toEqual(expect.objectContaining({ ok: true }))
    expect(upsertYeonjangRegistryObservation({
      instanceId: "legacy-instance", instanceAlias: "legacy-mac", displayName: "Legacy Workstation",
      nodeId: "legacy-node", supportProfile: "desktop_interactive", platform: "macos", arch: "arm64",
      sessionId: "legacy-session", clientId: "legacy-client", connectionState: "online",
      message: "legacy session remains owned by v1", version: "0.1.0", protocolVersion: "1",
      capabilityHash: "legacy-capabilities", transport: ["mqtt-json"], methodCount: 1,
      observedAt: Date.now(),
    })).toEqual(expect.objectContaining({ ok: true }))
    expect(upsertYeonjangRegistryObservation({
      instanceId: "ended-v2-instance", instanceAlias: "ended-v2", displayName: "Ended V2 Workstation",
      nodeId: "ended-v2-node", supportProfile: "desktop_interactive", platform: "macos", arch: "arm64",
      sessionId: "ended-v2-session", clientId: "stale-ended-client", connectionState: "offline",
      message: "ended before Gateway restart", version: "0.1.0", protocolVersion: "2",
      capabilityHash: null, transport: ["mqtt_v2"], methodCount: 0, observedAt: Date.now() - 500,
    })).toEqual(expect.objectContaining({ ok: true }))

    try {
      await startMqttBroker({
        enabled: true,
        host: "127.0.0.1",
        port,
        username: "mqtt-user",
        password: "broker-secret-for-v2-startup-fence",
        allowAnonymous: false,
        yeonjangV2: { requesterId: "requester-a" },
      })
      expect(listYeonjangRegistryInstances().find((instance) => instance.instanceId === "instance-a"))
        .toMatchObject({
          state: "offline",
          methodCount: 0,
          stateMessage: "MQTT v2 fresh status required after broker startup.",
          session: expect.objectContaining({ state: "offline", clientId: null }),
        })
      expect(listYeonjangRegistryInstances().find((instance) => instance.instanceId === "legacy-instance"))
        .toMatchObject({
          methodCount: 1,
          stateMessage: "legacy session remains owned by v1",
          session: expect.objectContaining({ state: "online", clientId: "legacy-client" }),
        })
      expect(listYeonjangRegistryInstances().find((instance) => instance.instanceId === "ended-v2-instance"))
        .toMatchObject({
          state: "offline",
          methodCount: 0,
          stateMessage: "MQTT v2 fresh status required after broker startup.",
          session: expect.objectContaining({ state: "offline", clientId: null }),
        })
    } finally {
      await stopMqttBroker()
      closeDb()
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)

  it("expires an online v2 projection when its signed liveness lease ends without a Last Will", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-expiry-"))
    const port = await reserveTcpPort()
    const password = "broker-secret-for-v2-expiry"
    const config = { enabled: true, host: "127.0.0.1", port, username: "mqtt-user", password, allowAnonymous: false, yeonjangV2: { requesterId: "requester-a" } }
    const hmacKey = deriveYeonjangMqttV2HmacKey(Buffer.from(password))
    initializeTestDbRuntime(root)
    expect(upsertYeonjangRegistryObservation({
      instanceId: "instance-a", instanceAlias: "local-mac", displayName: "Camera Workstation",
      nodeId: "yeonjang-main", supportProfile: "desktop_interactive", platform: "macos", arch: "arm64",
      sessionId: "session-old", clientId: null, connectionState: "offline", message: "fixture enrollment",
      version: "0.1.0", protocolVersion: "1", capabilityHash: null, transport: ["mqtt-json"],
      methodCount: 0, observedAt: Date.now() - 1_000,
    })).toEqual(expect.objectContaining({ ok: true }))
    await startMqttBroker(config)
    const producer = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
      clientId: "yeonjang-v2-expiry",
      username: config.username,
      password,
    })
    try {
      await mqttConnected(producer)
      await mqttSubscribe(producer, [
        "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/command",
      ])
      const observedAt = Date.now()
      const expiresAt = observedAt + 1_000
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/status", signedStatusFixture(hmacKey, observedAt, expiresAt), true)
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/capabilities", signedCapabilitiesFixture(hmacKey, observedAt, observedAt + 60_000), true)
      await waitUntil(() => getMqttExtensionSnapshots().some((snapshot) => snapshot.sessionId === "session-a" && snapshot.state === "online"))

      expect(expireMqttV2Observations(expiresAt)).toEqual({ expiredCount: 1 })
      expect(getMqttExtensionSnapshots().find((snapshot) => snapshot.sessionId === "session-a"))
        .toMatchObject({ state: "offline", methods: [], message: "MQTT v2 status expired." })
      expect(listYeonjangRegistryInstances().find((instance) => instance.session?.sessionId === "session-a"))
        .toMatchObject({ state: "offline", methodCount: 0 })
      expect(expireMqttV2Observations(expiresAt + 1)).toEqual({ expiredCount: 0 })
    } finally {
      hmacKey.fill(0)
      await new Promise<void>((resolve) => producer.end(true, {}, resolve))
      await stopMqttBroker()
      closeDb()
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)

  it("does not project signed v2 observations from a client whose broker authentication failed", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-unauthenticated-observation-"))
    const port = await reserveTcpPort()
    const password = "broker-secret-for-v2-unauthenticated-observation"
    const hmacKey = deriveYeonjangMqttV2HmacKey(Buffer.from(password))
    initializeTestDbRuntime(root)
    await startMqttBroker({
      enabled: true,
      host: "127.0.0.1",
      port,
      username: "expected-user",
      password,
      allowAnonymous: false,
      yeonjangV2: { requesterId: "requester-a" },
    })
    const socket = connect(port, "127.0.0.1")
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve)
        socket.once("error", reject)
      })
      const observedAt = Date.now()
      const statusTopic = "yeonjang/v2/instances/instance-a/sessions/session-unauthenticated/status"
      const statusPayload = Buffer.from(JSON.stringify(
        signedStatusFixture(hmacKey, observedAt, observedAt + 60_000, {
          sessionId: "session-unauthenticated",
        }),
      ))

      // A malicious or misconfigured producer may pipeline PUBLISH before
      // receiving the rejected CONNACK. Signed content is not broker admission.
      socket.write(Buffer.concat([
        mqttConnectPacket({
          clientId: "unauthenticated-v2-producer",
          username: "wrong-user",
          password,
        }),
        mqttPublishPacket(statusTopic, statusPayload, true),
      ]))
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(getMqttBrokerSnapshot().clientCount).toBe(0)
      expect(getMqttExtensionSnapshots().find((snapshot) => (
        snapshot.instanceId === "instance-a"
        && snapshot.sessionId === "session-unauthenticated"
      )))
        .toBeUndefined()
      expect(listYeonjangRegistryInstances().find((instance) => (
        instance.instanceId === "instance-a"
        && instance.session?.sessionId === "session-unauthenticated"
      )))
        .toBeUndefined()
    } finally {
      hmacKey.fill(0)
      socket.destroy()
      await stopMqttBroker()
      closeDb()
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)

  it("admits an exact requester subscription pipelined before broker clientReady", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-early-requester-subscribe-"))
    const port = await reserveTcpPort()
    const password = "broker-secret-for-v2-early-requester-subscribe"
    const hmacKey = deriveYeonjangMqttV2HmacKey(Buffer.from(password))
    initializeTestDbRuntime(root)
    expect(upsertYeonjangRegistryObservation({
      instanceId: "instance-a",
      instanceAlias: "early-requester-instance",
      displayName: "Early Requester Camera",
      nodeId: "yeonjang-main",
      supportProfile: "desktop_interactive",
      platform: "macos",
      arch: "arm64",
      sessionId: "session-old",
      clientId: null,
      connectionState: "offline",
      message: "awaiting early requester binding",
      version: "0.1.0",
      protocolVersion: "1",
      capabilityHash: null,
      transport: ["mqtt-json"],
      methodCount: 0,
      observedAt: Date.now() - 10_000,
    })).toEqual(expect.objectContaining({ ok: true }))
    await startMqttBroker({
      enabled: true,
      host: "127.0.0.1",
      port,
      username: "mqtt-user",
      password,
      allowAnonymous: false,
      yeonjangV2: { requesterId: "requester-a" },
    })
    const producer = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
      clientId: "early-requester-subscribe-client",
      username: "mqtt-user",
      password,
      reconnectPeriod: 0,
    })
    try {
      const requesterBinding = mqttSubscribe(producer, [
        "yeonjang/v2/instances/instance-a/sessions/session-early/requesters/requester-a/command",
      ])
      await mqttConnected(producer)
      await requesterBinding
      await waitUntil(() => getMqttBrokerSnapshot().clientCount === 1)

      const observedAt = Date.now()
      await mqttPublish(
        producer,
        "yeonjang/v2/instances/instance-a/sessions/session-early/status",
        signedStatusFixture(
          hmacKey,
          observedAt,
          observedAt + 60_000,
          { sessionId: "session-early" },
        ),
        true,
      )
      await waitUntil(() => getMqttExtensionSnapshots().some((snapshot) => (
        snapshot.instanceId === "instance-a"
        && snapshot.sessionId === "session-early"
        && snapshot.state === "online"
      )))
    } finally {
      hmacKey.fill(0)
      await new Promise<void>((resolve) => producer.end(true, {}, resolve))
      await stopMqttBroker()
      closeDb()
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)

  it("does not project v2 liveness before the authenticated client binds the configured requester route", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-unbound-requester-"))
    const port = await reserveTcpPort()
    const password = "broker-secret-for-v2-unbound-requester"
    const hmacKey = deriveYeonjangMqttV2HmacKey(Buffer.from(password))
    initializeTestDbRuntime(root)
    expect(upsertYeonjangRegistryObservation({
      instanceId: "instance-a",
      instanceAlias: "local-mac",
      displayName: "Camera Workstation",
      nodeId: "yeonjang-main",
      supportProfile: "desktop_interactive",
      platform: "macos",
      arch: "arm64",
      sessionId: "session-old",
      clientId: null,
      connectionState: "offline",
      message: "known enrollment awaiting authenticated requester binding",
      version: "0.1.0",
      protocolVersion: "1",
      capabilityHash: null,
      transport: ["mqtt-json"],
      methodCount: 0,
      observedAt: Date.now() - 10_000,
    })).toEqual(expect.objectContaining({ ok: true }))
    await startMqttBroker({
      enabled: true,
      host: "127.0.0.1",
      port,
      username: "mqtt-user",
      password,
      allowAnonymous: false,
      yeonjangV2: { requesterId: "requester-a" },
    })
    const baseline = listYeonjangRegistryInstances().find(
      (instance) => instance.instanceId === "instance-a",
    )
    expect(baseline).toBeDefined()
    const producer = mqtt.connect(`mqtt://127.0.0.1:${port}`, {
      clientId: "authenticated-but-unbound-v2-producer",
      username: "mqtt-user",
      password,
      reconnectPeriod: 0,
    })
    try {
      await mqttConnected(producer)
      const observedAt = Date.now()
      await mqttPublish(
        producer,
        "yeonjang/v2/instances/instance-a/sessions/session-unbound/status",
        signedStatusFixture(hmacKey, observedAt, observedAt + 60_000, { sessionId: "session-unbound" }),
        true,
      )
      await mqttPublish(
        producer,
        "yeonjang/v2/instances/instance-a/sessions/session-unbound/capabilities",
        signedCapabilitiesFixture(hmacKey, observedAt, observedAt + 60_000, { sessionId: "session-unbound" }),
        true,
      )
      await new Promise((resolve) => setTimeout(resolve, 500))

      expect(getMqttBrokerSnapshot().clientCount).toBe(1)
      expect(getMqttExtensionSnapshots().find((snapshot) => (
        snapshot.instanceId === "instance-a"
        && snapshot.sessionId === "session-unbound"
      )))
        .toBeUndefined()
      expect(listYeonjangRegistryInstances().find((instance) => instance.instanceId === "instance-a"))
        .toMatchObject({
          protocolVersion: "1",
          state: baseline?.state,
          methodCount: 0,
          session: expect.objectContaining({ clientId: null }),
        })

      await mqttSubscribe(producer, [
        "yeonjang/v2/instances/instance-a/sessions/session-unbound/requesters/requester-a/command",
      ])
      const admittedAt = Date.now()
      await mqttPublish(
        producer,
        "yeonjang/v2/instances/instance-a/sessions/session-unbound/status",
        signedStatusFixture(hmacKey, admittedAt, admittedAt + 60_000, {
          sessionId: "session-unbound",
          sequence: 2,
          messageId: "requester-bound-status",
        }),
        true,
      )
      await mqttPublish(
        producer,
        "yeonjang/v2/instances/instance-a/sessions/session-unbound/capabilities",
        signedCapabilitiesFixture(hmacKey, admittedAt, admittedAt + 60_000, {
          sessionId: "session-unbound",
          sequence: 2,
          messageId: "requester-bound-capabilities",
        }),
        true,
      )
      await waitUntil(() => getMqttExtensionSnapshots().some((snapshot) => (
        snapshot.instanceId === "instance-a"
        && snapshot.sessionId === "session-unbound"
        && snapshot.state === "online"
        && snapshot.methods.includes("camera.capture")
      )))
    } finally {
      hmacKey.fill(0)
      await new Promise<void>((resolve) => producer.end(true, {}, resolve))
      await stopMqttBroker()
      closeDb()
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)

  it("round-trips success and rejects a pre-effect camera terminal without artifact control", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-broker-"))
    const port = await reserveTcpPort()
    const password = "broker-secret-for-v2-integration"
    const config = { enabled: true, host: "127.0.0.1", port, username: "mqtt-user", password, allowAnonymous: false, yeonjangV2: { requesterId: "requester-a" } }
    const hmacKey = deriveYeonjangMqttV2HmacKey(Buffer.from(password))
    initializeTestDbRuntime(root)
    expect(upsertYeonjangRegistryObservation({
      instanceId: "instance-a", instanceAlias: "local-mac", displayName: "Camera Workstation",
      nodeId: "yeonjang-main", supportProfile: "desktop_interactive", platform: "macos", arch: "arm64",
      sessionId: "session-old", clientId: null, connectionState: "offline", message: "fixture enrollment",
      version: "0.1.0", protocolVersion: "1", capabilityHash: null, transport: ["mqtt-json"],
      methodCount: 0, observedAt: Date.now() - 1_000,
    })).toEqual(expect.objectContaining({ ok: true }))
    await startMqttBroker(config)
    expect(getMqttBrokerSnapshot()).toEqual(expect.objectContaining({
      running: true,
      reason: null,
    }))
    const producer = mqtt.connect(`mqtt://127.0.0.1:${port}`, { clientId: "yeonjang-v2-fixture", username: config.username, password })
    try {
      await mqttConnected(producer)
      await mqttSubscribe(producer, [
        "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/command",
        "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/control",
        "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/artifact/+/ack",
      ])
      const now = Date.now()
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/status", signedStatusFixture(hmacKey, now, now + 60_000), true)
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/capabilities", signedCapabilitiesFixture(hmacKey, now, now + 60_000), true)
      await waitUntil(
        () => getMqttExtensionSnapshots().some((snapshot) => snapshot.protocolVersion === "2" && snapshot.methods.includes("camera.capture")),
        () => JSON.stringify(getMqttExtensionSnapshots()),
      )
      expect(listYeonjangRegistryInstances().find((instance) => instance.instanceId === "instance-a"))
        .toEqual(expect.objectContaining({
          state: "online",
          protocolVersion: "2",
          methodCount: 2,
        }))

      const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
      let artifactAck = false
      let responseAck = false
      let artifactFetchCount = 0
      let artifactCancelCount = 0
      producer.on("message", (topic, payload) => {
        const parsed = topic.endsWith("/chunk") ? null : JSON.parse(payload.toString("utf8")) as Record<string, any>
        if (topic.endsWith("/command") && parsed) {
          const preEffectBlocked = parsed.payload?.params?.device_id === "fixture-pre-effect"
          void mqttPublish(producer, topic.replace(/\/command$/u, "/response"), signedTerminalForCommand(
            hmacKey,
            parsed,
            imageBytes,
            preEffectBlocked
              ? {
                  executionOutcome: "blocked",
                  deliveryOutcome: "not_started",
                  failure: {
                    stage: "os_preflight",
                    reason_code: "permission_not_determined",
                    effect_state: "not_started",
                    retry_safety: "local_action_required",
                    recovery_action: "complete_local_os_setup",
                  },
                }
              : undefined,
          ), false)
        } else if (topic.endsWith("/control") && parsed?.payload?.artifact === "artifact.fetch") {
          artifactFetchCount += 1
          const params = parsed.payload.params as Record<string, any>
          if (artifactFetchCount === 2) {
            void mqttPublish(
              producer,
              topic.replace(/\/control$/u, "/response"),
              signedArtifactFetchRejectionForControl(hmacKey, parsed, "revision_conflict"),
              false,
            )
          } else {
            void mqttPublishRaw(producer, topic.replace(/\/control$/u, `/artifact/${params.transfer_id}/chunk`), artifactFrameForFetch(params, imageBytes, Date.now() + 60_000))
          }
        } else if (topic.includes("/artifact/") && topic.endsWith("/ack")) {
          artifactAck = true
        } else if (topic.endsWith("/control") && parsed?.payload?.artifact === "artifact.cancel") {
          artifactCancelCount += 1
        } else if (topic.endsWith("/control") && parsed?.payload?.control === "response.ack") {
          responseAck = true
          void mqttPublish(producer, topic.replace(/\/control$/u, "/response"), signedAckResultForControl(hmacKey, parsed), false)
        }
      })

      const result = await invokeYeonjangMethod<Record<string, unknown>>("camera.capture", { capture_timeout_ms: 2_000, inline_base64: true }, {
        extensionId: "instance-a",
        timeoutMs: 5_000,
        mqttConfig: config,
        metadata: { operationId: "operation:canonical:camera", targetSessionId: "session-a", targetFingerprint: `sha256:${"34".repeat(32)}`, runId: "run-camera" },
      })
      expect(result).toEqual(expect.objectContaining({ mime_type: "image/jpeg", base64_data: imageBytes.toString("base64"), size_bytes: 4 }))
      await waitUntil(() => artifactAck && responseAck)
      expect(mqttFieldDebug).toHaveBeenCalledWith("mqtt_v2_artifact_dispatch", expect.objectContaining({
        stage: "artifact_waiter_ready",
        correlationIdHash: expect.stringMatching(/^sha256:[0-9a-f]{16}$/u),
      }))
      expect(mqttFieldDebug).toHaveBeenCalledWith("mqtt_v2_artifact_dispatch", expect.objectContaining({
        stage: "artifact_fetch_published",
        correlationIdHash: expect.stringMatching(/^sha256:[0-9a-f]{16}$/u),
      }))
      expect(mqttFieldDebug).toHaveBeenCalledWith("mqtt_v2_artifact_waiter", expect.objectContaining({
        stage: "artifact_waiter",
        outcome: "completed",
        matchingChunkCount: 1,
      }))
      const successfulArtifactTraceText = JSON.stringify(mqttFieldDebug.mock.calls)
      expect(successfulArtifactTraceText).not.toContain("yeonjang/v2/")
      expect(successfulArtifactTraceText).not.toContain(imageBytes.toString("base64"))

      const rejectedStartedAt = Date.now()
      mqttFieldDebug.mockClear()
      await expect(invokeYeonjangMethod<Record<string, unknown>>("camera.capture", {
        capture_timeout_ms: 2_000,
        device_id: "fixture-pre-effect",
      }, {
        extensionId: "instance-a",
        timeoutMs: 5_000,
        mqttConfig: config,
        metadata: { operationId: "operation:canonical:pre-effect", targetSessionId: "session-a", targetFingerprint: `sha256:${"34".repeat(32)}`, runId: "run-camera-pre-effect" },
      })).rejects.toMatchObject({
        code: "camera_permission_not_determined",
        attempt: expect.objectContaining({ terminalStage: "rejected", retrySafety: "change_strategy" }),
      })
      expect(Date.now() - rejectedStartedAt).toBeLessThan(1_000)
      expect(artifactFetchCount).toBe(1)
      expect(mqttFieldDebug).toHaveBeenCalledWith("mqtt_v2_terminal_dispatch", expect.objectContaining({
        stage: "response_waiter_ready",
        correlationIdHash: expect.stringMatching(/^sha256:[0-9a-f]{16}$/u),
      }))
      expect(mqttFieldDebug).toHaveBeenCalledWith("mqtt_v2_terminal_dispatch", expect.objectContaining({
        stage: "command_published",
        correlationIdHash: expect.stringMatching(/^sha256:[0-9a-f]{16}$/u),
      }))
      expect(mqttFieldDebug).toHaveBeenCalledWith("mqtt_v2_terminal_waiter", expect.objectContaining({
        stage: "terminal_waiter",
        correlationIdHash: expect.stringMatching(/^sha256:[0-9a-f]{16}$/u),
        outcome: "matched",
        matchedExpectedTopicCandidateCount: 1,
      }))
      expect(mqttFieldDebug).toHaveBeenCalledWith("mqtt_v2_terminal_admission", expect.objectContaining({
        stage: "terminal_admission",
        outcome: "admitted",
        executionOutcome: "blocked",
        terminalFailureReasonCode: "permission_not_determined",
        terminalFailureEffectState: "not_started",
        terminalFailureRetrySafety: "local_action_required",
      }))
      const traceText = JSON.stringify(mqttFieldDebug.mock.calls)
      expect(traceText).not.toContain("fixture-pre-effect")
      expect(traceText).not.toContain("yeonjang/v2/")

      const fetchRejectedStartedAt = Date.now()
      await expect(invokeYeonjangMethod<Record<string, unknown>>("camera.capture", {
        capture_timeout_ms: 2_000,
      }, {
        extensionId: "instance-a",
        timeoutMs: 2_000,
        mqttConfig: config,
        metadata: { operationId: "operation:canonical:fetch-rejected", targetSessionId: "session-a", targetFingerprint: `sha256:${"34".repeat(32)}`, runId: "run-camera-fetch-rejected" },
      })).rejects.toMatchObject({ code: "yeonjang_v2_artifact_fetch_revision_conflict" })
      expect(Date.now() - fetchRejectedStartedAt).toBeLessThan(1_000)
      expect(artifactFetchCount).toBe(2)
      expect(artifactCancelCount).toBe(0)
      expect(mqttFieldDebug).toHaveBeenCalledWith("mqtt_v2_artifact_waiter", expect.objectContaining({
        stage: "artifact_waiter",
        outcome: "rejected",
        reasonCode: "yeonjang_v2_artifact_fetch_revision_conflict",
        matchingChunkCount: 0,
      }))
    } finally {
      hmacKey.fill(0)
      await new Promise<void>((resolve) => producer.end(false, {}, resolve))
      await stopMqttBroker()
      closeDb()
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)

  it("publishes one exact signed command cancellation when the active request is aborted", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-cancel-"))
    const port = await reserveTcpPort()
    const password = "broker-secret-for-v2-cancellation"
    const config = { enabled: true, host: "127.0.0.1", port, username: "mqtt-user", password, allowAnonymous: false, yeonjangV2: { requesterId: "requester-a" } }
    const hmacKey = deriveYeonjangMqttV2HmacKey(Buffer.from(password))
    const controller = new AbortController()
    initializeTestDbRuntime(root)
    expect(upsertYeonjangRegistryObservation({
      instanceId: "instance-a", instanceAlias: "local-mac", displayName: "Camera Workstation",
      nodeId: "yeonjang-main", supportProfile: "desktop_interactive", platform: "macos", arch: "arm64",
      sessionId: "session-old", clientId: null, connectionState: "offline", message: "fixture enrollment",
      version: "0.1.0", protocolVersion: "1", capabilityHash: null, transport: ["mqtt-json"],
      methodCount: 0, observedAt: Date.now() - 1_000,
    })).toEqual(expect.objectContaining({ ok: true }))
    await startMqttBroker(config)
    const producer = mqtt.connect(`mqtt://127.0.0.1:${port}`, { clientId: "yeonjang-v2-cancel-fixture", username: config.username, password })
    try {
      await mqttConnected(producer)
      await mqttSubscribe(producer, [
        "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/command",
        "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/control",
      ])
      const now = Date.now()
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/status", signedStatusFixture(hmacKey, now, now + 60_000), true)
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/capabilities", signedCapabilitiesFixture(hmacKey, now, now + 60_000), true)
      await waitUntil(() => getMqttExtensionSnapshots().some((snapshot) => snapshot.protocolVersion === "2" && snapshot.methods.includes("camera.capture")))

      let activeCommand: Record<string, any> | null = null
      const cancellations: Array<Record<string, any>> = []
      producer.on("message", (topic, payload) => {
        const parsed = JSON.parse(payload.toString("utf8")) as Record<string, any>
        if (topic.endsWith("/command")) {
          activeCommand = parsed
          controller.abort()
        } else if (topic.endsWith("/control") && parsed.payload?.control === "command.cancel") {
          cancellations.push(parsed)
        }
      })

      await expect(invokeYeonjangMethod<Record<string, unknown>>("camera.capture", { capture_timeout_ms: 5_000 }, {
        extensionId: "instance-a",
        timeoutMs: 5_000,
        signal: controller.signal,
        mqttConfig: config,
        metadata: { operationId: "operation:canonical:cancel", targetSessionId: "session-a", targetFingerprint: `sha256:${"34".repeat(32)}`, runId: "run-cancel" },
      })).rejects.toMatchObject({ code: "cancelled" })
      await waitUntil(() => cancellations.length === 1, () => `cancellations=${cancellations.length}`)

      const command = activeCommand
      expect(command).not.toBeNull()
      const cancellation = cancellations[0]
      expect(cancellation?.payload?.params).toEqual(expect.objectContaining({
        target_request_id: command?.request_id,
        target_command_id: command?.command_id,
        target_operation_id: command?.operation_id,
        target_idempotency_key: command?.idempotency_key,
        cancellation_id: command?.cancellation_id,
        cancel_token: command?.cancel_token,
        reason: "user_requested",
      }))
      expect(cancellation?.authorization).toEqual(expect.objectContaining({
        scope: "effect.cancel",
        target_fingerprint: command?.target_fingerprint,
        signature: expect.stringMatching(/^[0-9a-f]{64}$/u),
      }))
    } finally {
      hmacKey.fill(0)
      await new Promise<void>((resolve) => producer.end(false, {}, resolve))
      await stopMqttBroker()
      closeDb()
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)

  it("publishes deadline cancellation when an acknowledged dispatch has no terminal response", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-deadline-"))
    const port = await reserveTcpPort()
    const password = "broker-secret-for-v2-deadline"
    const config = { enabled: true, host: "127.0.0.1", port, username: "mqtt-user", password, allowAnonymous: false, yeonjangV2: { requesterId: "requester-a" } }
    const hmacKey = deriveYeonjangMqttV2HmacKey(Buffer.from(password))
    initializeTestDbRuntime(root)
    expect(upsertYeonjangRegistryObservation({
      instanceId: "instance-a", instanceAlias: "local-mac", displayName: "Camera Workstation",
      nodeId: "yeonjang-main", supportProfile: "desktop_interactive", platform: "macos", arch: "arm64",
      sessionId: "session-old", clientId: null, connectionState: "offline", message: "fixture enrollment",
      version: "0.1.0", protocolVersion: "1", capabilityHash: null, transport: ["mqtt-json"],
      methodCount: 0, observedAt: Date.now() - 1_000,
    })).toEqual(expect.objectContaining({ ok: true }))
    await startMqttBroker(config)
    const producer = mqtt.connect(`mqtt://127.0.0.1:${port}`, { clientId: "yeonjang-v2-deadline-fixture", username: config.username, password })
    try {
      await mqttConnected(producer)
      await mqttSubscribe(producer, [
        "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/command",
        "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/control",
      ])
      const now = Date.now()
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/status", signedStatusFixture(hmacKey, now, now + 60_000), true)
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/capabilities", signedCapabilitiesFixture(hmacKey, now, now + 60_000), true)
      await waitUntil(() => getMqttExtensionSnapshots().some((snapshot) => snapshot.protocolVersion === "2" && snapshot.methods.includes("camera.capture")))

      const cancellations: Array<Record<string, any>> = []
      producer.on("message", (topic, payload) => {
        const parsed = JSON.parse(payload.toString("utf8")) as Record<string, any>
        if (topic.endsWith("/control") && parsed.payload?.control === "command.cancel") cancellations.push(parsed)
      })
      await expect(invokeYeonjangMethod<Record<string, unknown>>("camera.capture", { capture_timeout_ms: 1_000 }, {
        extensionId: "instance-a", timeoutMs: 1_000, mqttConfig: config,
        metadata: { operationId: "operation:canonical:deadline", targetSessionId: "session-a", targetFingerprint: `sha256:${"34".repeat(32)}`, runId: "run-deadline" },
      })).rejects.toMatchObject({ code: "yeonjang_response_timeout" })
      await waitUntil(() => cancellations.length === 1)
      expect(cancellations[0]?.payload?.params?.reason).toBe("deadline_exceeded")
      expect(cancellations[0]?.authorization).toEqual(expect.objectContaining({ scope: "effect.cancel", signature: expect.stringMatching(/^[0-9a-f]{64}$/u) }))
    } finally {
      hmacKey.fill(0)
      await new Promise<void>((resolve) => producer.end(false, {}, resolve))
      await stopMqttBroker()
      closeDb()
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)

  it("publishes artifact cancellation instead of re-cancelling a completed camera effect", async () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-mqtt-v2-artifact-cancel-"))
    const port = await reserveTcpPort()
    const password = "broker-secret-for-v2-artifact-cancel"
    const config = { enabled: true, host: "127.0.0.1", port, username: "mqtt-user", password, allowAnonymous: false, yeonjangV2: { requesterId: "requester-a" } }
    const hmacKey = deriveYeonjangMqttV2HmacKey(Buffer.from(password))
    const controller = new AbortController()
    initializeTestDbRuntime(root)
    expect(upsertYeonjangRegistryObservation({
      instanceId: "instance-a", instanceAlias: "local-mac", displayName: "Camera Workstation",
      nodeId: "yeonjang-main", supportProfile: "desktop_interactive", platform: "macos", arch: "arm64",
      sessionId: "session-old", clientId: null, connectionState: "offline", message: "fixture enrollment",
      version: "0.1.0", protocolVersion: "1", capabilityHash: null, transport: ["mqtt-json"],
      methodCount: 0, observedAt: Date.now() - 1_000,
    })).toEqual(expect.objectContaining({ ok: true }))
    await startMqttBroker(config)
    const producer = mqtt.connect(`mqtt://127.0.0.1:${port}`, { clientId: "yeonjang-v2-artifact-cancel-fixture", username: config.username, password })
    try {
      await mqttConnected(producer)
      await mqttSubscribe(producer, [
        "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/command",
        "yeonjang/v2/instances/instance-a/sessions/session-a/requesters/requester-a/control",
      ])
      const now = Date.now()
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/status", signedStatusFixture(hmacKey, now, now + 60_000), true)
      await mqttPublish(producer, "yeonjang/v2/instances/instance-a/sessions/session-a/capabilities", signedCapabilitiesFixture(hmacKey, now, now + 60_000), true)
      await waitUntil(() => getMqttExtensionSnapshots().some((snapshot) => snapshot.protocolVersion === "2" && snapshot.methods.includes("camera.capture")))

      const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
      let fetch: Record<string, any> | null = null
      const commandCancellations: Array<Record<string, any>> = []
      const artifactCancellations: Array<Record<string, any>> = []
      producer.on("message", (topic, payload) => {
        const parsed = JSON.parse(payload.toString("utf8")) as Record<string, any>
        if (topic.endsWith("/command")) {
          void mqttPublish(producer, topic.replace(/\/command$/u, "/response"), signedTerminalForCommand(hmacKey, parsed, imageBytes), false)
        } else if (topic.endsWith("/control") && parsed.payload?.artifact === "artifact.fetch") {
          fetch = parsed
          controller.abort()
        } else if (topic.endsWith("/control") && parsed.payload?.artifact === "artifact.cancel") {
          artifactCancellations.push(parsed)
        } else if (topic.endsWith("/control") && parsed.payload?.control === "command.cancel") {
          commandCancellations.push(parsed)
        }
      })

      await expect(invokeYeonjangMethod<Record<string, unknown>>("camera.capture", { capture_timeout_ms: 5_000 }, {
        extensionId: "instance-a",
        timeoutMs: 5_000,
        signal: controller.signal,
        mqttConfig: config,
        metadata: { operationId: "operation:canonical:artifact-cancel", targetSessionId: "session-a", targetFingerprint: `sha256:${"34".repeat(32)}`, runId: "run-artifact-cancel" },
      })).rejects.toMatchObject({ code: "cancelled" })
      await waitUntil(() => artifactCancellations.length === 1)

      expect(commandCancellations).toHaveLength(0)
      expect(fetch).not.toBeNull()
      expect(artifactCancellations[0]?.payload?.params).toEqual(expect.objectContaining({
        artifact_ref: fetch?.payload?.params?.artifact_ref,
        owner_request_id: fetch?.payload?.params?.owner_request_id,
        owner_operation_id: fetch?.payload?.params?.owner_operation_id,
        transfer_id: fetch?.payload?.params?.transfer_id,
        // The fetch began from registered revision 0, so its active transfer
        // state is revision 1 when cancellation is requested.
        expected_revision: 1,
      }))
      expect(artifactCancellations[0]?.authorization).toEqual(expect.objectContaining({
        scope: "artifact.cancel",
        signature: expect.stringMatching(/^[0-9a-f]{64}$/u),
      }))
    } finally {
      hmacKey.fill(0)
      await new Promise<void>((resolve) => producer.end(false, {}, resolve))
      await stopMqttBroker()
      closeDb()
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)
})

async function reserveTcpPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

function mqttConnectPacket(input: {
  readonly clientId: string
  readonly username: string
  readonly password: string
}): Buffer {
  const protocolName = mqttUtf8("MQTT")
  const variableHeader = Buffer.concat([
    protocolName,
    Buffer.from([4, 0xc2, 0, 30]),
  ])
  const payload = Buffer.concat([
    mqttUtf8(input.clientId),
    mqttUtf8(input.username),
    mqttUtf8(input.password),
  ])
  const body = Buffer.concat([variableHeader, payload])
  return Buffer.concat([Buffer.from([0x10]), mqttRemainingLength(body.length), body])
}

function mqttPublishPacket(topic: string, payload: Buffer, retained: boolean): Buffer {
  const body = Buffer.concat([mqttUtf8(topic), payload])
  return Buffer.concat([
    Buffer.from([retained ? 0x31 : 0x30]),
    mqttRemainingLength(body.length),
    body,
  ])
}

function mqttUtf8(value: string): Buffer {
  const bytes = Buffer.from(value)
  const length = Buffer.alloc(2)
  length.writeUInt16BE(bytes.length)
  return Buffer.concat([length, bytes])
}

function mqttRemainingLength(value: number): Buffer {
  const bytes: number[] = []
  let remaining = value
  do {
    let encoded = remaining % 128
    remaining = Math.floor(remaining / 128)
    if (remaining > 0) encoded |= 0x80
    bytes.push(encoded)
  } while (remaining > 0)
  return Buffer.from(bytes)
}

async function mqttConnected(client: ReturnType<typeof mqtt.connect>): Promise<void> {
  if (client.connected) return
  await new Promise<void>((resolve, reject) => { client.once("connect", resolve); client.once("error", reject) })
}
async function mqttSubscribe(client: ReturnType<typeof mqtt.connect>, topics: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => client.subscribe(topics, { qos: 1 }, (error) => error ? reject(error) : resolve()))
}
async function mqttPublish(client: ReturnType<typeof mqtt.connect>, topic: string, value: unknown, retain: boolean): Promise<void> {
  await mqttPublishRaw(client, topic, Buffer.from(JSON.stringify(value)), retain)
}
async function mqttPublishRaw(client: ReturnType<typeof mqtt.connect>, topic: string, payload: Buffer, retain = false): Promise<void> {
  await new Promise<void>((resolve, reject) => client.publish(topic, payload, { qos: 1, retain }, (error) => error ? reject(error) : resolve()))
}
async function waitUntil(predicate: () => boolean, evidence?: () => string): Promise<void> {
  const deadline = Date.now() + 3_000
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`controlled MQTT v2 condition timed out: ${evidence?.() ?? "no evidence"}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function signedTerminalForCommand(
  hmacKey: Buffer,
  command: Record<string, any>,
  imageBytes: Buffer,
  terminalResult?: {
    readonly executionOutcome: "blocked" | "failed" | "cancelled" | "effect_unknown"
    readonly deliveryOutcome: "not_started" | "queued" | "published" | "consumer_acknowledged" | "pending_retry" | "failed" | "expired"
    readonly failure: Readonly<Record<string, unknown>>
  },
): Record<string, unknown> {
  const now = Date.now()
  const fullDigest = `sha256:${createHash("sha256").update(imageBytes).digest("hex")}`
  const terminal = {
    schema_version: 1, request_id: command.request_id, command_id: command.command_id,
    operation_id: command.operation_id, requester_id: command.requester_id,
    target: { platform: "macos", instance_id: command.target_instance_id, session_id: command.target_session_id, fingerprint: command.target_fingerprint },
    method: "camera.capture", resource: "camera", idempotency_key: command.idempotency_key,
    binding_digest: `sha256:${"56".repeat(32)}`,
    execution_outcome: terminalResult?.executionOutcome ?? "succeeded",
    delivery_outcome: terminalResult?.deliveryOutcome ?? "queued",
    terminal_revision: 1,
    ...(terminalResult ? { failure: terminalResult.failure } : {}),
  }
  const content = {
    schema_version: 3, request_id: command.request_id, command_id: command.command_id,
    operation_id: command.operation_id, requester_id: command.requester_id,
    correlation_id: command.correlation_id, causation_id: command.causation_id,
    target_instance_id: command.target_instance_id, target_session_id: command.target_session_id,
    target_fingerprint: command.target_fingerprint, idempotency_key: command.idempotency_key,
    target_scope_digest: `sha256:${"78".repeat(32)}`, terminal,
    // Yeonjang registers a newly captured artifact at durable lifecycle revision 0.
    // The first Gateway fetch must use that exact revision as its CAS precondition.
    ...(terminalResult ? {} : {
      artifact: { schemaVersion: 1, artifactRef: `capture:${"90".repeat(32)}`, kind: "camera_jpeg", mediaType: "image/jpeg", sizeBytes: imageBytes.length, fullDigest, createdAtMs: now, expiresAtMs: now + 60_000, lifecycleRevision: 0 },
    }),
  }
  const payloadDigest = createHash("sha256").update(JSON.stringify(content)).digest()
  const envelope: Record<string, any> = {
    protocol_version: 2, schema_id: "yeonjang.response.v2", message_kind: "response",
    message_id: "response-message", receipt_id: `receipt-${payloadDigest.toString("hex").slice(0, 56)}`,
    response_digest: `sha256:${payloadDigest.toString("hex")}`, request_id: command.request_id,
    command_id: command.command_id, operation_id: command.operation_id,
    correlation_id: command.correlation_id, causation_id: command.causation_id,
    requester_id: command.requester_id, target_instance_id: command.target_instance_id,
    target_session_id: command.target_session_id, target_fingerprint: command.target_fingerprint,
    idempotency_key: command.idempotency_key, issued_at: now, expires_at: now + 30_000,
    sequence: 1, payload: content,
    authorization: { schema_version: 1, issuer: command.target_instance_id, key_id: "instance-hmac-v2", audience: command.requester_id, scope: "response.publish", requester_id: command.requester_id, request_id: command.request_id, command_id: command.command_id, operation_id: command.operation_id, target_instance_id: command.target_instance_id, target_session_id: command.target_session_id, target_fingerprint: command.target_fingerprint, idempotency_key: command.idempotency_key, expires_at: now + 30_000, nonce: "response-nonce", signature: "" },
  }
  const chunks: Buffer[] = []
  const auth = envelope.authorization
  for (const [name, value] of [
    ["domain", "yeonjang.response.authorization.v2"], ["protocol_version", 2], ["schema_id", envelope.schema_id], ["message_kind", envelope.message_kind], ["message_id", envelope.message_id], ["receipt_id", envelope.receipt_id], ["response_digest", envelope.response_digest], ["request_id", envelope.request_id], ["command_id", envelope.command_id], ["operation_id", envelope.operation_id], ["correlation_id", envelope.correlation_id], ["causation_id", envelope.causation_id], ["requester_id", envelope.requester_id], ["target_instance_id", envelope.target_instance_id], ["target_session_id", envelope.target_session_id], ["target_fingerprint", envelope.target_fingerprint], ["idempotency_key", envelope.idempotency_key], ["issued_at", envelope.issued_at], ["expires_at", envelope.expires_at], ["sequence", envelope.sequence], ["payload_sha256", payloadDigest], ["authorization_schema_version", 1], ["authorization_issuer", auth.issuer], ["authorization_key_id", auth.key_id], ["authorization_audience", auth.audience], ["authorization_scope", auth.scope], ["authorization_requester_id", auth.requester_id], ["authorization_request_id", auth.request_id], ["authorization_command_id", auth.command_id], ["authorization_operation_id", auth.operation_id], ["authorization_target_instance_id", auth.target_instance_id], ["authorization_target_session_id", auth.target_session_id], ["authorization_target_fingerprint", auth.target_fingerprint], ["authorization_idempotency_key", auth.idempotency_key], ["authorization_expires_at", auth.expires_at], ["authorization_nonce", auth.nonce],
  ] as const) appendFixture(chunks, name, Buffer.isBuffer(value) ? value : typeof value === "number" ? fixtureU64(value) : Buffer.from(String(value)))
  auth.signature = createHmac("sha256", hmacKey).update(Buffer.concat(chunks)).digest("hex")
  return envelope
}

function signedArtifactFetchRejectionFixture(hmacKey: Buffer): Record<string, unknown> {
  const fingerprint = `sha256:${"34".repeat(32)}`
  const payload = {
    artifact_ref: `capture:${"90".repeat(32)}`,
    owner_request_id: "request-v2",
    owner_operation_id: "operation-v2",
    transfer_id: "transfer-a",
    observed_revision: 1,
    outcome: "rejected",
    reason: "revision_conflict",
  }
  const authorization = {
    schema_version: 1,
    issuer: "instance-a",
    key_id: "instance-hmac-v2",
    audience: "requester-a",
    scope: "response.publish",
    requester_id: "requester-a",
    request_id: "fetch-request",
    command_id: "fetch-command",
    operation_id: "fetch-operation",
    target_instance_id: "instance-a",
    target_session_id: "session-a",
    target_fingerprint: fingerprint,
    idempotency_key: "fetch-idempotency",
    expires_at: 2_000,
    nonce: "fetch-response-nonce",
    signature: "",
  }
  const envelope: Record<string, any> = {
    protocol_version: 2,
    schema_id: "yeonjang.artifact-fetch-result.v2",
    message_kind: "response",
    message_id: "fetch-response-message",
    request_id: "fetch-request",
    command_id: "fetch-command",
    operation_id: "fetch-operation",
    correlation_id: "request-v2",
    causation_id: "fetch-message",
    requester_id: "requester-a",
    target_instance_id: "instance-a",
    target_session_id: "session-a",
    target_fingerprint: fingerprint,
    idempotency_key: "fetch-idempotency",
    issued_at: 900,
    expires_at: 2_000,
    sequence: 1,
    payload,
    authorization,
  }
  const payloadDigest = createHash("sha256").update(JSON.stringify(payload)).digest()
  const chunks: Buffer[] = []
  for (const [name, value] of [
    ["domain", "yeonjang.artifact-fetch-result.authorization.v2"],
    ["protocol_version", 2], ["schema_id", envelope.schema_id],
    ["message_kind", envelope.message_kind], ["message_id", envelope.message_id],
    ["request_id", envelope.request_id], ["command_id", envelope.command_id],
    ["operation_id", envelope.operation_id], ["correlation_id", envelope.correlation_id],
    ["causation_id", envelope.causation_id], ["requester_id", envelope.requester_id],
    ["target_instance_id", envelope.target_instance_id],
    ["target_session_id", envelope.target_session_id],
    ["target_fingerprint", envelope.target_fingerprint],
    ["idempotency_key", envelope.idempotency_key], ["issued_at", envelope.issued_at],
    ["expires_at", envelope.expires_at], ["sequence", envelope.sequence],
    ["payload_sha256", payloadDigest], ["authorization_schema_version", 1],
    ["authorization_issuer", authorization.issuer],
    ["authorization_key_id", authorization.key_id],
    ["authorization_audience", authorization.audience],
    ["authorization_scope", authorization.scope],
    ["authorization_requester_id", authorization.requester_id],
    ["authorization_request_id", authorization.request_id],
    ["authorization_command_id", authorization.command_id],
    ["authorization_operation_id", authorization.operation_id],
    ["authorization_target_instance_id", authorization.target_instance_id],
    ["authorization_target_session_id", authorization.target_session_id],
    ["authorization_target_fingerprint", authorization.target_fingerprint],
    ["authorization_idempotency_key", authorization.idempotency_key],
    ["authorization_nonce", authorization.nonce],
    ["authorization_expires_at", authorization.expires_at],
  ] as const) {
    appendFixture(
      chunks,
      name,
      Buffer.isBuffer(value)
        ? value
        : typeof value === "number"
          ? fixtureU64(value)
          : Buffer.from(value),
    )
  }
  authorization.signature = createHmac("sha256", hmacKey)
    .update(Buffer.concat(chunks))
    .digest("hex")
  return envelope
}

function signedArtifactFetchRejectionForControl(
  hmacKey: Buffer,
  fetch: Record<string, any>,
  reason: "revision_conflict" | "source_unavailable",
): Record<string, unknown> {
  const now = Date.now()
  const params = fetch.payload.params as Record<string, any>
  const payload = {
    artifact_ref: params.artifact_ref,
    owner_request_id: params.owner_request_id,
    owner_operation_id: params.owner_operation_id,
    transfer_id: params.transfer_id,
    observed_revision: params.expected_revision,
    outcome: "rejected",
    reason,
  }
  const authorization = {
    schema_version: 1,
    issuer: fetch.target_instance_id,
    key_id: "instance-hmac-v2",
    audience: fetch.requester_id,
    scope: "response.publish",
    requester_id: fetch.requester_id,
    request_id: fetch.request_id,
    command_id: fetch.command_id,
    operation_id: fetch.operation_id,
    target_instance_id: fetch.target_instance_id,
    target_session_id: fetch.target_session_id,
    target_fingerprint: fetch.target_fingerprint,
    idempotency_key: fetch.idempotency_key,
    expires_at: now + 30_000,
    nonce: "fetch-response-nonce",
    signature: "",
  }
  const envelope: Record<string, any> = {
    protocol_version: 2,
    schema_id: "yeonjang.artifact-fetch-result.v2",
    message_kind: "response",
    message_id: "fetch-response-message",
    request_id: fetch.request_id,
    command_id: fetch.command_id,
    operation_id: fetch.operation_id,
    correlation_id: fetch.correlation_id,
    causation_id: fetch.message_id,
    requester_id: fetch.requester_id,
    target_instance_id: fetch.target_instance_id,
    target_session_id: fetch.target_session_id,
    target_fingerprint: fetch.target_fingerprint,
    idempotency_key: fetch.idempotency_key,
    issued_at: now,
    expires_at: authorization.expires_at,
    sequence: 1,
    payload,
    authorization,
  }
  const payloadDigest = createHash("sha256").update(JSON.stringify(payload)).digest()
  const chunks: Buffer[] = []
  for (const [name, value] of [
    ["domain", "yeonjang.artifact-fetch-result.authorization.v2"],
    ["protocol_version", 2], ["schema_id", envelope.schema_id],
    ["message_kind", envelope.message_kind], ["message_id", envelope.message_id],
    ["request_id", envelope.request_id], ["command_id", envelope.command_id],
    ["operation_id", envelope.operation_id], ["correlation_id", envelope.correlation_id],
    ["causation_id", envelope.causation_id], ["requester_id", envelope.requester_id],
    ["target_instance_id", envelope.target_instance_id],
    ["target_session_id", envelope.target_session_id],
    ["target_fingerprint", envelope.target_fingerprint],
    ["idempotency_key", envelope.idempotency_key], ["issued_at", envelope.issued_at],
    ["expires_at", envelope.expires_at], ["sequence", envelope.sequence],
    ["payload_sha256", payloadDigest], ["authorization_schema_version", 1],
    ["authorization_issuer", authorization.issuer],
    ["authorization_key_id", authorization.key_id],
    ["authorization_audience", authorization.audience],
    ["authorization_scope", authorization.scope],
    ["authorization_requester_id", authorization.requester_id],
    ["authorization_request_id", authorization.request_id],
    ["authorization_command_id", authorization.command_id],
    ["authorization_operation_id", authorization.operation_id],
    ["authorization_target_instance_id", authorization.target_instance_id],
    ["authorization_target_session_id", authorization.target_session_id],
    ["authorization_target_fingerprint", authorization.target_fingerprint],
    ["authorization_idempotency_key", authorization.idempotency_key],
    ["authorization_nonce", authorization.nonce],
    ["authorization_expires_at", authorization.expires_at],
  ] as const) appendFixture(chunks, name, Buffer.isBuffer(value) ? value : typeof value === "number" ? fixtureU64(value) : Buffer.from(value))
  authorization.signature = createHmac("sha256", hmacKey).update(Buffer.concat(chunks)).digest("hex")
  return envelope
}

function artifactFrameForFetch(params: Record<string, any>, bytes: Buffer, expiresAt: number): Buffer {
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`
  const header = { schema_version: 1, transfer_id: params.transfer_id, artifact_ref: params.artifact_ref, owner_requester_id: "requester-a", owner_request_id: params.owner_request_id, index: 0, count: 1, offset: 0, chunk_size: bytes.length, total_size: bytes.length, payload_digest: digest, full_digest: digest, expires_at_ms: expiresAt }
  const headerBytes = Buffer.from(JSON.stringify(header)); const size = Buffer.alloc(4); size.writeUInt32BE(headerBytes.length)
  return Buffer.concat([Buffer.from("YAC2"), size, headerBytes, bytes])
}

function signedAckResultForControl(hmacKey: Buffer, ack: Record<string, any>, now = Date.now()): Record<string, unknown> {
  const target = ack.payload.params as Record<string, any>
  const payload = { schema_version: 1, receipt_id: target.receipt_id, target_request_id: target.target_request_id, target_command_id: target.target_command_id, target_operation_id: target.target_operation_id, target_idempotency_key: target.target_idempotency_key, terminal_revision: target.terminal_revision, response_digest: target.response_digest, outcome: "accepted", delivery_revision: 2 }
  const authorization = { schema_version: 1, issuer: ack.target_instance_id, key_id: "instance-hmac-v2", audience: ack.requester_id, scope: "response.ack.result", requester_id: ack.requester_id, request_id: ack.request_id, command_id: ack.command_id, operation_id: ack.operation_id, target_instance_id: ack.target_instance_id, target_session_id: ack.target_session_id, target_fingerprint: ack.target_fingerprint, idempotency_key: ack.idempotency_key, expires_at: now + 30_000, nonce: "ack-result-nonce", signature: "" }
  const envelope: Record<string, any> = { protocol_version: 2, schema_id: "yeonjang.response-ack-result.v2", message_kind: "response", message_id: "ack-result-message", request_id: ack.request_id, command_id: ack.command_id, operation_id: ack.operation_id, correlation_id: ack.correlation_id, causation_id: ack.message_id, requester_id: ack.requester_id, target_instance_id: ack.target_instance_id, target_session_id: ack.target_session_id, target_fingerprint: ack.target_fingerprint, idempotency_key: ack.idempotency_key, issued_at: now, expires_at: now + 30_000, sequence: 2, payload, authorization }
  const digest = createHash("sha256").update(JSON.stringify(payload)).digest()
  const chunks: Buffer[] = []
  for (const [name, value] of [["domain", "yeonjang.response-ack-result.authorization.v2"], ["payload_sha256", digest], ...["message_id", "request_id", "command_id", "operation_id", "correlation_id", "causation_id", "requester_id", "target_instance_id", "target_session_id", "target_fingerprint", "idempotency_key"].map((key) => [key, envelope[key]]), ["authorization_issuer", authorization.issuer], ["authorization_key_id", authorization.key_id], ["authorization_audience", authorization.audience], ["authorization_scope", authorization.scope], ["authorization_nonce", authorization.nonce], ["issued_at", envelope.issued_at], ["expires_at", envelope.expires_at], ["sequence", envelope.sequence]] as Array<[string, unknown]>) appendFixture(chunks, name, Buffer.isBuffer(value) ? value : typeof value === "number" ? fixtureU64(value) : Buffer.from(String(value)))
  authorization.signature = createHmac("sha256", hmacKey).update(Buffer.concat(chunks)).digest("hex")
  return envelope
}

function signedTerminalFixture(hmacKey: Buffer, captureKind: "camera" | "screen" = "camera"): Record<string, unknown> {
  const fingerprint = `sha256:${"34".repeat(32)}`
  const bindingDigest = `sha256:${"56".repeat(32)}`
  const payload = {
    schema_version: 3,
    request_id: "request-v2",
    command_id: "command-v2",
    operation_id: "operation-v2",
    requester_id: "requester-a",
    correlation_id: "correlation-v2",
    causation_id: "causation-v2",
    target_instance_id: "instance-a",
    target_session_id: "session-a",
    target_fingerprint: fingerprint,
    idempotency_key: "idempotency-v2",
    target_scope_digest: `sha256:${"78".repeat(32)}`,
    terminal: {
      schema_version: 1,
      request_id: "request-v2",
      command_id: "command-v2",
      operation_id: "operation-v2",
      requester_id: "requester-a",
      target: { platform: "macos", instance_id: "instance-a", session_id: "session-a", fingerprint },
      method: captureKind === "camera" ? "camera.capture" : "screen.capture",
      resource: captureKind === "camera" ? "camera" : "screen",
      idempotency_key: "idempotency-v2",
      binding_digest: bindingDigest,
      execution_outcome: "succeeded",
      delivery_outcome: "queued",
      terminal_revision: 1,
    },
    artifact: {
      // Yeonjang's Rust DTO uses `rename_all = "camelCase"` for this nested descriptor.
      schemaVersion: 1,
      artifactRef: `capture:${"90".repeat(32)}`,
      kind: captureKind === "camera" ? "camera_jpeg" : "screen_png",
      mediaType: captureKind === "camera" ? "image/jpeg" : "image/png",
      sizeBytes: 4,
      fullDigest: `sha256:${"ab".repeat(32)}`,
      createdAtMs: 900,
      expiresAtMs: 60_900,
      // A freshly registered Yeonjang artifact starts at revision 0, before fetch.
      lifecycleRevision: 0,
    },
  }
  const payloadDigest = createHash("sha256").update(JSON.stringify(payload)).digest()
  const responseDigest = `sha256:${payloadDigest.toString("hex")}`
  const envelope = {
    protocol_version: 2,
    schema_id: "yeonjang.response.v2",
    message_kind: "response",
    message_id: "response-message",
    receipt_id: `receipt-${payloadDigest.toString("hex").slice(0, 56)}`,
    response_digest: responseDigest,
    request_id: "request-v2",
    command_id: "command-v2",
    operation_id: "operation-v2",
    correlation_id: "correlation-v2",
    causation_id: "causation-v2",
    requester_id: "requester-a",
    target_instance_id: "instance-a",
    target_session_id: "session-a",
    target_fingerprint: fingerprint,
    idempotency_key: "idempotency-v2",
    issued_at: 900,
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
      request_id: "request-v2",
      command_id: "command-v2",
      operation_id: "operation-v2",
      target_instance_id: "instance-a",
      target_session_id: "session-a",
      target_fingerprint: fingerprint,
      idempotency_key: "idempotency-v2",
      expires_at: 2_000,
      nonce: "response-nonce",
      signature: "",
    },
  }
  const chunks: Buffer[] = []
  for (const [name, value] of [
    ["domain", "yeonjang.response.authorization.v2"],
    ["protocol_version", 2],
    ["schema_id", envelope.schema_id], ["message_kind", envelope.message_kind],
    ["message_id", envelope.message_id], ["receipt_id", envelope.receipt_id],
    ["response_digest", responseDigest], ["request_id", envelope.request_id],
    ["command_id", envelope.command_id], ["operation_id", envelope.operation_id],
    ["correlation_id", envelope.correlation_id], ["causation_id", envelope.causation_id],
    ["requester_id", envelope.requester_id], ["target_instance_id", envelope.target_instance_id],
    ["target_session_id", envelope.target_session_id], ["target_fingerprint", fingerprint],
    ["idempotency_key", envelope.idempotency_key], ["issued_at", 900], ["expires_at", 2_000],
    ["sequence", 1], ["payload_sha256", payloadDigest], ["authorization_schema_version", 1],
    ["authorization_issuer", "instance-a"], ["authorization_key_id", "instance-hmac-v2"],
    ["authorization_audience", "requester-a"], ["authorization_scope", "response.publish"],
    ["authorization_requester_id", "requester-a"], ["authorization_request_id", "request-v2"],
    ["authorization_command_id", "command-v2"], ["authorization_operation_id", "operation-v2"],
    ["authorization_target_instance_id", "instance-a"], ["authorization_target_session_id", "session-a"],
    ["authorization_target_fingerprint", fingerprint], ["authorization_idempotency_key", "idempotency-v2"],
    ["authorization_expires_at", 2_000], ["authorization_nonce", "response-nonce"],
  ] as const) appendFixture(chunks, name, Buffer.isBuffer(value) ? value : typeof value === "number" ? fixtureU64(value) : Buffer.from(value))
  return { ...envelope, authorization: { ...envelope.authorization, signature: createHmac("sha256", hmacKey).update(Buffer.concat(chunks)).digest("hex") } }
}

function signedStatusFixture(
  hmacKey: Buffer,
  nowMs = 1_000,
  expiresAt = 2_000,
  options: { readonly sessionId?: string; readonly sequence?: number; readonly messageId?: string } = {},
): Record<string, unknown> {
  const sessionId = options.sessionId ?? "session-a"
  const payload = { state: "online" }
  const envelope = {
    protocol_version: 2,
    schema_id: "yeonjang.status.v2",
    message_kind: "status",
    message_id: options.messageId ?? "status-message",
    target_instance_id: "instance-a",
    target_session_id: sessionId,
    target_fingerprint: `sha256:${"34".repeat(32)}`,
    observed_at: nowMs - 100,
    expires_at: expiresAt,
    sequence: options.sequence ?? 1,
    payload,
    authorization: {
      schema_version: 1,
      issuer: "instance-a",
      key_id: "instance-hmac-v2",
      audience: sessionId,
      scope: "status.publish",
      nonce: "status-nonce",
      signature: "",
    },
  }
  const chunks: Buffer[] = []
  appendFixture(chunks, "domain", Buffer.from("yeonjang.status.authorization.v2"))
  appendFixture(chunks, "payload_sha256", createHash("sha256").update(JSON.stringify(payload)).digest())
  for (const [name, value] of [
    ["schema_id", envelope.schema_id],
    ["message_kind", envelope.message_kind],
    ["message_id", envelope.message_id],
    ["target_instance_id", envelope.target_instance_id],
    ["target_session_id", envelope.target_session_id],
    ["target_fingerprint", envelope.target_fingerprint],
    ["authorization_issuer", envelope.authorization.issuer],
    ["authorization_key_id", envelope.authorization.key_id],
    ["authorization_audience", envelope.authorization.audience],
    ["authorization_scope", envelope.authorization.scope],
    ["authorization_nonce", envelope.authorization.nonce],
  ] as const) appendFixture(chunks, name, Buffer.from(value))
  appendFixture(chunks, "protocol_version", fixtureU16(envelope.protocol_version))
  for (const [name, value] of [
    ["observed_at", envelope.observed_at],
    ["expires_at", envelope.expires_at],
    ["sequence", envelope.sequence],
  ] as const) appendFixture(chunks, name, fixtureU64(value))
  return {
    ...envelope,
    authorization: {
      ...envelope.authorization,
      signature: createHmac("sha256", hmacKey).update(Buffer.concat(chunks)).digest("hex"),
    },
  }
}

function signedOfflineStatusFixture(
  hmacKey: Buffer,
  options: { readonly observedAt?: number; readonly sessionId?: string; readonly sequence?: number; readonly messageId?: string } = {},
): Buffer {
  const observedAt = options.observedAt ?? 900
  const sessionId = options.sessionId ?? "session-a"
  const payload = { state: "offline", reason: "unexpected_disconnect" }
  const envelope = {
    protocol_version: 2, schema_id: "yeonjang.status.v2", message_kind: "status",
    message_id: options.messageId ?? "offline-message", target_instance_id: "instance-a", target_session_id: sessionId,
    target_fingerprint: `sha256:${"34".repeat(32)}`, observed_at: observedAt,
    expires_at: "__MAX_I64__", sequence: options.sequence ?? 2, payload,
    authorization: { schema_version: 1, issuer: "instance-a", key_id: "instance-hmac-v2", audience: sessionId, scope: "status.publish", nonce: "offline-nonce", signature: "" },
  }
  const chunks: Buffer[] = []
  appendFixture(chunks, "domain", Buffer.from("yeonjang.status.authorization.v2"))
  appendFixture(chunks, "payload_sha256", createHash("sha256").update(JSON.stringify(payload)).digest())
  for (const [name, value] of [["schema_id", envelope.schema_id], ["message_kind", envelope.message_kind], ["message_id", envelope.message_id], ["target_instance_id", envelope.target_instance_id], ["target_session_id", envelope.target_session_id], ["target_fingerprint", envelope.target_fingerprint], ["authorization_issuer", envelope.authorization.issuer], ["authorization_key_id", envelope.authorization.key_id], ["authorization_audience", envelope.authorization.audience], ["authorization_scope", envelope.authorization.scope], ["authorization_nonce", envelope.authorization.nonce]] as const) appendFixture(chunks, name, Buffer.from(value))
  appendFixture(chunks, "protocol_version", fixtureU16(2)); appendFixture(chunks, "observed_at", fixtureU64(observedAt))
  const max = Buffer.alloc(8); max.writeBigInt64BE(9_223_372_036_854_775_807n); appendFixture(chunks, "expires_at", max); appendFixture(chunks, "sequence", fixtureU64(options.sequence ?? 2))
  envelope.authorization.signature = createHmac("sha256", hmacKey).update(Buffer.concat(chunks)).digest("hex")
  return Buffer.from(JSON.stringify(envelope).replace('"__MAX_I64__"', "9223372036854775807"))
}

function signedCapabilitiesFixture(
  hmacKey: Buffer,
  nowMs = 1_000,
  expiresAt = 2_000,
  options: { readonly sessionId?: string; readonly sequence?: number; readonly messageId?: string } = {},
): Record<string, unknown> {
  const sessionId = options.sessionId ?? "session-a"
  const row = (method: string, resource: string) => ({
    method,
    resource,
    implementationStatus: "executable",
    platformAvailable: true,
    localPolicy: "allowed",
    policyResource: { kind: "any" },
    authorizationScope: "effect.execute",
    cancellable: true,
    postCheckRequired: true,
    artifactDelivery: "mqtt.fetch_ack",
  })
  const payload = {
    targetPlatform: "macos",
    policyRevision: 1,
    advertisedMethods: ["camera.capture", "screen.capture"],
    capabilities: [
      row("camera.capture", "camera"),
      row("screen.capture", "screen"),
    ],
  }
  const envelope = {
    protocol_version: 2,
    schema_id: "yeonjang.capabilities.v2",
    message_kind: "capabilities",
    message_id: options.messageId ?? "capabilities-message",
    target_instance_id: "instance-a",
    target_session_id: sessionId,
    target_fingerprint: `sha256:${"34".repeat(32)}`,
    observed_at: nowMs - 100,
    expires_at: expiresAt,
    sequence: options.sequence ?? 1,
    payload,
    authorization: {
      schema_version: 1,
      issuer: "instance-a",
      key_id: "instance-hmac-v2",
      audience: sessionId,
      scope: "capabilities.publish",
      nonce: "capabilities-nonce",
      signature: "",
    },
  }
  const chunks: Buffer[] = []
  appendFixture(chunks, "domain", Buffer.from("yeonjang.capabilities.authorization.v2"))
  appendFixture(chunks, "payload_sha256", createHash("sha256").update(JSON.stringify(payload)).digest())
  for (const [name, value] of [
    ["schema_id", envelope.schema_id],
    ["message_kind", envelope.message_kind],
    ["message_id", envelope.message_id],
    ["target_instance_id", envelope.target_instance_id],
    ["target_session_id", envelope.target_session_id],
    ["target_fingerprint", envelope.target_fingerprint],
    ["authorization_issuer", envelope.authorization.issuer],
    ["authorization_key_id", envelope.authorization.key_id],
    ["authorization_audience", envelope.authorization.audience],
    ["authorization_scope", envelope.authorization.scope],
    ["authorization_nonce", envelope.authorization.nonce],
  ] as const) appendFixture(chunks, name, Buffer.from(value))
  appendFixture(chunks, "protocol_version", fixtureU16(envelope.protocol_version))
  for (const [name, value] of [
    ["observed_at", envelope.observed_at],
    ["expires_at", envelope.expires_at],
    ["sequence", envelope.sequence],
  ] as const) appendFixture(chunks, name, fixtureU64(value))
  return {
    ...envelope,
    authorization: {
      ...envelope.authorization,
      signature: createHmac("sha256", hmacKey).update(Buffer.concat(chunks)).digest("hex"),
    },
  }
}

function fixtureU16(value: number): Buffer {
  const bytes = Buffer.alloc(2)
  bytes.writeUInt16BE(value)
  return bytes
}

function appendFixture(output: Buffer[], name: string, value: Buffer): void {
  const nameBytes = Buffer.from(name)
  output.push(fixtureU64(nameBytes.length), nameBytes, fixtureU64(value.length), value)
}

function fixtureU64(value: number): Buffer {
  const bytes = Buffer.alloc(8)
  bytes.writeBigUInt64BE(BigInt(value))
  return bytes
}
