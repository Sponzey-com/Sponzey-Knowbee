import { describe, expect, it } from "vitest"

import { createBrowserFocusRuntimeBootstrap } from "../packages/core/src/yeonjang/browser-focus-runtime-bootstrap.ts"
import { createApiServerRuntimeContext } from "../packages/core/src/api/server-runtime-context.ts"
import { createStartupProcessContext } from "../packages/core/src/runtime/startup-process-context.ts"

describe("task574 browser.focus runtime bootstrap", () => {
  it("uses the startup MQTT password for trusted and newly paired extensions", () => {
    const runtime = createBrowserFocusRuntimeBootstrap({
      trustedExtensionIds: ["existing-mac"],
      connectionPassword: "mqtt-connection-password",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createNonce: () => "nonce-001",
    })
    expect(runtime.issuer?.issue({
      extensionId: "existing-mac",
      sessionId: "session-001",
      targetHash: "sha256:target",
      approvalScopeId: "scope-001",
    }).ok).toBe(true)

    expect(runtime.pairingExecutionAdmissionKeyProvisioner?.provision({
      extensionId: "new-mac",
    })).toEqual({ ok: true })
    const issued = runtime.issuer?.issue({
      extensionId: "new-mac",
      sessionId: "session-002",
      targetHash: "sha256:target",
      approvalScopeId: "scope-002",
    })
    expect(issued).toMatchObject({ ok: true })
    expect(JSON.stringify(issued)).not.toContain("mqtt-connection-password")
  })

  it("fails closed without a connection password and removes in-memory bindings", () => {
    expect(createBrowserFocusRuntimeBootstrap({
      trustedExtensionIds: ["linux-node"],
      connectionPassword: "",
    })).toEqual({})

    const runtime = createBrowserFocusRuntimeBootstrap({
      trustedExtensionIds: [],
      connectionPassword: "mqtt-connection-password",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createNonce: () => "nonce-001",
    })
    expect(runtime.pairingExecutionAdmissionKeyProvisioner?.provision({
      extensionId: "new-mac",
    })).toEqual({ ok: true })
    runtime.pairingExecutionAdmissionKeyProvisioner?.remove({ extensionId: "new-mac" })
    expect(runtime.issuer?.issue({
      extensionId: "new-mac",
      sessionId: "session-001",
      targetHash: "sha256:target",
      approvalScopeId: "scope-001",
    })).toEqual({
      ok: false,
      reasonCode: "browser_focus_execution_admission_key_unavailable",
    })
  })

  it("passes the approved pairing provisioner through the immutable API runtime context", () => {
    const provisioner = {
      provision: () => ({ ok: true as const }),
      remove: () => ({ ok: true as const }),
    }
    const runtime = createApiServerRuntimeContext(
      createStartupProcessContext({ env: {}, argv: ["node"], cwd: "/startup", platform: "darwin" }),
      { pairingExecutionAdmissionKeyProvisioner: provisioner },
    )
    expect(runtime.pairingExecutionAdmissionKeyProvisioner).toBe(provisioner)
  })
})
