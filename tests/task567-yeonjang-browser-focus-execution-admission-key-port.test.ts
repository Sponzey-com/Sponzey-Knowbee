import { createHash, createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"

import {
  bindYeonjangExecutionAdmissionKey,
  createBootstrapYeonjangExecutionAdmissionKeyPort,
  createYeonjangExecutionAdmissionPasswordHandle,
  type YeonjangExecutionAdmissionKeyPort,
} from "../packages/core/src/yeonjang/execution-admission-key-port.ts"

const keyPort: YeonjangExecutionAdmissionKeyPort = {
  resolve: () => ({
    keyId: "key-001",
    extensionId: "studio-mac",
    sessionId: "session-001",
    sign: () => "hmac-sha256:private-signature",
  }),
}

describe("task567 browser.focus execution admission key port", () => {
  it("signs with the startup connection password without exposing it", () => {
    const handle = createYeonjangExecutionAdmissionPasswordHandle({
      extensionId: "studio-mac",
      keyId: "mqtt-connection-password-v1",
      connectionPassword: "mqtt-private-password",
    })
    const canonicalPayload = "canonical-admission"
    expect(handle?.sign({ canonicalPayload })).toBe(
      `hmac-sha256:${createHmac("sha256", "mqtt-private-password")
        .update(canonicalPayload, "utf8")
        .digest("hex")}`,
    )
    expect(JSON.stringify(handle)).not.toContain("mqtt-private-password")
    expect(createYeonjangExecutionAdmissionPasswordHandle({
      extensionId: "studio-mac",
      keyId: "mqtt-connection-password-v1",
      connectionPassword: " ",
    })).toBeUndefined()
  })

  it("derives the execution key for an existing short broker credential", () => {
    const connectionPassword = "samjoko1"
    const handle = createYeonjangExecutionAdmissionPasswordHandle({
      extensionId: "studio-mac",
      keyId: "mqtt-connection-password-v1",
      connectionPassword,
    })
    const derived = createHash("sha256")
      .update("knowbee.yeonjang.execution-admission.v1\u0000", "utf8")
      .update(connectionPassword, "utf8")
      .digest()

    expect(handle?.sign({ canonicalPayload: "canonical-short" })).toBe(
      `hmac-sha256:${createHmac("sha256", derived)
        .update("canonical-short", "utf8")
        .digest("hex")}`,
    )
  })

  it("creates an immutable bootstrap snapshot and rejects invalid or duplicate instance/session bindings", () => {
    const bootstrap = createBootstrapYeonjangExecutionAdmissionKeyPort({
      handles: [{
        keyId: "key-001",
        extensionId: "studio-mac",
        sessionId: "session-001",
        sign: () => "hmac-sha256:private-signature",
      }],
    })
    expect(bootstrap.ok).toBe(true)
    if (bootstrap.ok) {
      expect(bindYeonjangExecutionAdmissionKey({
        extensionId: "studio-mac",
        sessionId: "session-001",
        keyPort: bootstrap.keyPort,
      }).status).toBe("ready")
    }
    expect(createBootstrapYeonjangExecutionAdmissionKeyPort({
      handles: [{ keyId: "", extensionId: "studio-mac", sign: () => "signature" }],
    })).toEqual({ ok: false, reasonCode: "execution_admission_key_bootstrap_invalid" })
    expect(createBootstrapYeonjangExecutionAdmissionKeyPort({
      handles: [
        { keyId: "key-001", extensionId: "studio-mac", sessionId: "session-001", sign: () => "a" },
        { keyId: "key-002", extensionId: "studio-mac", sessionId: "session-001", sign: () => "b" },
      ],
    })).toEqual({ ok: false, reasonCode: "execution_admission_key_binding_duplicate" })
  })

  it("binds an immutable signer handle only to its exact extension and session", () => {
    expect(bindYeonjangExecutionAdmissionKey({
      extensionId: "studio-mac",
      sessionId: "session-001",
      keyPort,
    })).toEqual({
      schemaVersion: "knowbee.yeonjang-execution-admission-key-binding.v1",
      status: "ready",
      reasonCode: "execution_admission_key_ready",
      keyRef: "yeonjang-execution-admission-key:key-001",
    })
  })

  it("fails closed for unavailable and mismatched bootstrap handles", () => {
    expect(bindYeonjangExecutionAdmissionKey({
      extensionId: "studio-mac",
      sessionId: "session-001",
      keyPort: { resolve: () => undefined },
    })).toMatchObject({
      status: "blocked",
      reasonCode: "execution_admission_key_unavailable",
    })
    expect(bindYeonjangExecutionAdmissionKey({
      extensionId: "studio-mac",
      sessionId: "session-001",
      keyPort: {
        resolve: () => ({
          keyId: "key-001",
          extensionId: "other-mac",
          sessionId: "session-001",
          sign: () => "hmac-sha256:private-signature",
        }),
      },
    })).toMatchObject({
      status: "blocked",
      reasonCode: "execution_admission_key_binding_mismatch",
    })
  })

  it("does not project raw signing material or the signer itself", () => {
    const binding = bindYeonjangExecutionAdmissionKey({
      extensionId: "studio-mac",
      sessionId: "session-001",
      keyPort,
    })
    expect(JSON.stringify(binding)).not.toMatch(/private-signature|studio-mac|session-001|sign/iu)
  })
})
