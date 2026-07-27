import { describe, expect, it } from "vitest"

import {
  createBootstrapYeonjangExecutionAdmissionKeyPort,
  createYeonjangExecutionAdmissionKeyRegistry,
} from "../packages/core/src/yeonjang/execution-admission-key-port.ts"

describe("task574 browser.focus runtime key registry", () => {
  it("resolves an approved extension-wide pairing key for a signed session without rereading configuration", () => {
    const registry = createYeonjangExecutionAdmissionKeyRegistry()
    expect(registry.register({
      keyId: "key-001",
      extensionId: "studio-mac",
      sign: () => "hmac-sha256:signature",
    })).toEqual({ ok: true })

    expect(registry.keyPort.resolve({ extensionId: "studio-mac", sessionId: "session-001" }))
      .toMatchObject({ keyId: "key-001", extensionId: "studio-mac" })
    registry.remove({ extensionId: "studio-mac" })
    expect(registry.keyPort.resolve({ extensionId: "studio-mac", sessionId: "session-001" })).toBeUndefined()
  })

  it("preserves immutable startup key ports as fallbacks and rejects an invalid dynamic handle", () => {
    const boot = createBootstrapYeonjangExecutionAdmissionKeyPort({
      handles: [{
        keyId: "key-startup",
        extensionId: "existing-mac",
        sign: () => "hmac-sha256:startup",
      }],
    })
    expect(boot.ok).toBe(true)
    if (!boot.ok) return
    const registry = createYeonjangExecutionAdmissionKeyRegistry({ fallbackPorts: [boot.keyPort] })
    expect(registry.keyPort.resolve({ extensionId: "existing-mac", sessionId: "new-session" }))
      .toMatchObject({ keyId: "key-startup" })
    expect(registry.register({ keyId: "", extensionId: "invalid", sign: () => "x" }))
      .toEqual({ ok: false, reasonCode: "execution_admission_key_bootstrap_invalid" })
  })
})
