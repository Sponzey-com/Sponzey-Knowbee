import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
  canonicalizeYeonjangAuthorizationReceipt,
  createYeonjangExecutionAuthorizationIssuer,
} from "../packages/core/src/yeonjang/execution-authorization-receipt.ts"
import {
  createBootstrapYeonjangExecutionAdmissionKeyPort,
  createYeonjangExecutionAdmissionPasswordHandle,
} from "../packages/core/src/yeonjang/execution-admission-key-port.ts"
import {
  createYeonjangCommandDispatch,
  type YeonjangAuthorizationReceipt,
} from "../packages/core/src/yeonjang/mqtt-client.ts"
import {
  withYeonjangRequestMetadata,
} from "../packages/core/src/tools/builtin/yeonjang-request-metadata.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const secret = "0123456789abcdef"

function createIssuer() {
  const handle = createYeonjangExecutionAdmissionPasswordHandle({
    extensionId: "yeonjang-main",
    sessionId: "target-session-1",
    keyId: "mqtt-connection-password-v1",
    connectionPassword: secret,
  })
  if (!handle) throw new Error("test key handle must be valid")
  const keyPort = createBootstrapYeonjangExecutionAdmissionKeyPort({
    handles: [handle],
  })
  if (!keyPort.ok) throw new Error("test key port must be valid")
  return createYeonjangExecutionAuthorizationIssuer({
    issuer: "knowbee-core",
    keyPort: keyPort.keyPort,
    createAuthorizationId: () => "nonce-1",
  })
}

describe("task081 general Yeonjang authorization receipt", () => {
  it("matches the Rust length-prefixed UTF-8 HMAC contract byte-for-byte", () => {
    const unsigned: Omit<YeonjangAuthorizationReceipt, "proof"> = {
      schemaVersion: 1,
      authorizationId: "승인-1",
      issuer: "knowbee-core",
      issuerKeyId: "mqtt-connection-password-v1",
      audience: "yeonjang-main",
      method: "camera.capture",
      resourceScope: "camera",
      commandId: "command-1",
      operationId: "operation-1",
      targetSessionId: "target-session-1",
      targetFingerprint: `sha256:${"a".repeat(64)}`,
      idempotencyKey: "idempotency-1",
      expiresAt: 4_000_000_000_000,
    }
    const canonicalPayload = canonicalizeYeonjangAuthorizationReceipt(unsigned)
    expect(canonicalPayload).toBe(
      "1:18:승인-112:knowbee-core27:mqtt-connection-password-v113:yeonjang-main14:camera.capture6:camera9:command-111:operation-116:target-session-171:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa13:idempotency-113:4000000000000",
    )
    expect(createHmac("sha256", secret).update(canonicalPayload, "utf8").digest("hex"))
      .toBe("0e93d9bdaf9e1234f0a767e1248a436ad7215258e42635dc5e884b166f9c9e88")
  })

  it("adds only a runtime-issued exact receipt and discards caller-supplied receipt data", () => {
    const issuer = createIssuer()
    const forged = {
      schemaVersion: 1,
      authorizationId: "forged",
      proof: "forged",
    } as unknown as YeonjangAuthorizationReceipt
    const dispatch = createYeonjangCommandDispatch("camera.capture", {}, {
      extensionId: "yeonjang-main",
      metadata: {
        targetSessionId: "target-session-1",
        operationId: "operation-1",
        targetFingerprint: `sha256:${"a".repeat(64)}`,
        authorizationReceipt: forged,
        ...({
          authorization_receipt: forged,
        } as unknown as Record<string, unknown>),
      },
      executionAuthorization: {
        issuer,
        resourceScope: "camera",
        grant: {
          approvalId: "approval-1",
          permissionScope: "tool:yeonjang_camera_capture",
          decision: "allow_once",
        },
      },
    })

    const receipt = dispatch.metadata.authorizationReceipt
    expect(receipt).toMatchObject({
      schemaVersion: 1,
      authorizationId: "approval-1:nonce-1",
      issuer: "knowbee-core",
      issuerKeyId: "mqtt-connection-password-v1",
      audience: "yeonjang-main",
      method: "camera.capture",
      resourceScope: "camera",
      commandId: dispatch.commandId,
      operationId: "operation-1",
      targetSessionId: "target-session-1",
      targetFingerprint: `sha256:${"a".repeat(64)}`,
      idempotencyKey: dispatch.idempotencyKey,
      expiresAt: dispatch.expiresAt,
    })
    expect(receipt?.authorizationId).not.toBe("forged")
    expect(receipt?.proof).toMatch(/^[a-f0-9]{64}$/u)
    expect(
      (dispatch.metadata as unknown as Record<string, unknown>).authorization_receipt,
    ).toBeUndefined()
  })

  it("exposes the signer to MQTT only for an approved exact side-effect operation", () => {
    const issuer = createIssuer()
    const baseContext: ToolContext = {
      artifactStorage: {} as ToolContext["artifactStorage"],
      sessionId: "request-session-1",
      runId: "run-1",
      workDir: process.cwd(),
      userMessage: "카메라로 사진을 찍어줘",
      source: "telegram",
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
      sideEffectOperation: {
        operationId: "operation-1",
        targetFingerprint: `sha256:${"a".repeat(64)}`,
      },
      yeonjangExecutionAuthorizationIssuer: issuer,
    }
    const unapproved = withYeonjangRequestMetadata(baseContext, {
      extensionId: "yeonjang-main",
      metadata: { targetSessionId: "target-session-1" },
    }, "camera")
    expect(unapproved.executionAuthorization).toBeUndefined()

    const approved = withYeonjangRequestMetadata({
      ...baseContext,
      authorizationReceipt: {
        policyDecisionId: "policy-1",
        toolName: "yeonjang_camera_capture",
        paramsHash: "params-1",
        policyDecision: "allow",
        permissionScope: "tool:yeonjang_camera_capture",
        runId: "run-1",
        requestGroupId: "request-group-1",
        approvalDecision: "allow_once",
        approvalId: "approval-1",
      },
    }, {
      extensionId: "yeonjang-main",
      metadata: { targetSessionId: "target-session-1" },
    }, "camera")
    const dispatch = createYeonjangCommandDispatch(
      "camera.capture",
      {},
      approved,
    )
    expect(dispatch.metadata.authorizationReceipt).toMatchObject({
      authorizationId: "approval-1:nonce-1",
      operationId: "operation-1",
      targetSessionId: "target-session-1",
      resourceScope: "camera",
    })
  })
})
