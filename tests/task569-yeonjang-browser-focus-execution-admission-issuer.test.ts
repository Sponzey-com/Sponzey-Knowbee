import { describe, expect, it } from "vitest"

import {
  canonicalizeYeonjangBrowserFocusExecutionAdmission,
  createYeonjangBrowserFocusExecutionAdmissionIssuer,
  hashYeonjangBrowserFocusExecutionTarget,
  issueYeonjangBrowserFocusExecutionAdmission,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-execution-admission-issuer.ts"
import type { YeonjangExecutionAdmissionKeyPort } from "../packages/core/src/yeonjang/execution-admission-key-port.ts"

const NOW = new Date("2026-07-23T09:00:00.000Z")
const keyPort: YeonjangExecutionAdmissionKeyPort = {
  resolve: ({ extensionId, sessionId }) => extensionId === "studio-mac" && sessionId === "session-001"
    ? {
        keyId: "key-001",
        extensionId,
        sessionId,
        sign: ({ canonicalPayload }) => `hmac-sha256:signed:${canonicalPayload.length}`,
      }
    : undefined,
}

function issue(overrides: Partial<Parameters<typeof issueYeonjangBrowserFocusExecutionAdmission>[0]> = {}) {
  return issueYeonjangBrowserFocusExecutionAdmission({
    extensionId: "studio-mac",
    sessionId: "session-001",
    targetHash: "sha256:focus-target",
    approvalScopeId: "scope:approved",
    expiresAt: "2026-07-23T09:01:00.000Z",
    nonce: "nonce-private",
    now: NOW,
    keyPort,
    ...overrides,
  })
}

describe("task569 browser.focus execution admission issuer", () => {
  it("issues a deterministic instance/session-bound signed admission without exposing its key", () => {
    const result = issue()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.admission).toMatchObject({
      schemaVersion: "knowbee.yeonjang-browser-focus-execution-admission.v1",
      method: "browser.focus",
      extensionId: "studio-mac",
      sessionId: "session-001",
      signature: "hmac-sha256:signed:164",
    })
    expect(canonicalizeYeonjangBrowserFocusExecutionAdmission(result.admission)).toBe(
      "knowbee.yeonjang-browser-focus-execution-admission.v1\u0000browser.focus\u0000studio-mac\u0000session-001\u0000sha256:focus-target\u0000scope:approved\u00002026-07-23T09:01:00.000Z\u0000nonce-private",
    )
    expect(JSON.stringify(result)).not.toMatch(/key-001|private-pairing-secret/iu)
  })

  it("fails closed for unavailable keys, malformed input, and expired admissions", () => {
    expect(issue({ extensionId: "other-host" })).toEqual({
      ok: false, reasonCode: "browser_focus_execution_admission_key_unavailable",
    })
    expect(issue({ targetHash: " " })).toEqual({
      ok: false, reasonCode: "browser_focus_execution_admission_input_invalid",
    })
    expect(issue({ expiresAt: "2026-07-23T08:59:59.000Z" })).toEqual({
      ok: false, reasonCode: "browser_focus_execution_admission_expired",
    })
  })

  it("hashes only the stable public target projection fields in a cross-runtime order", () => {
    expect(hashYeonjangBrowserFocusExecutionTarget({
      schemaVersion: "yeonjang-browser-focus-target-v1",
      targetKind: "browser_window_or_tab",
      displayName: "Work browser",
      processName: "Google Chrome",
      titleHash: "sha256:title",
      titleLength: 10,
      urlScheme: "https",
      urlHash: "sha256:url",
      urlLength: 20,
      publicEvidenceFields: ["displayName"],
      auditOnlyFields: ["rawTitle"],
    })).toBe("sha256:5bab8552911874907e73c6f05326ab48bfb60572dd67260e7e41b645edbd26e9")
  })

  it("builds a runtime issuer from explicit bootstrap dependencies without reading environment state", () => {
    const issuer = createYeonjangBrowserFocusExecutionAdmissionIssuer({
      keyPort,
      now: () => NOW,
      createNonce: () => "nonce-from-runtime",
      ttlMs: 60_000,
    })

    expect(issuer.issue({
      extensionId: "studio-mac",
      sessionId: "session-001",
      targetHash: "sha256:focus-target",
      approvalScopeId: "scope:approved",
    })).toMatchObject({
      ok: true,
      admission: {
        expiresAt: "2026-07-23T09:01:00.000Z",
        nonce: "nonce-from-runtime",
      },
    })
    expect(createYeonjangBrowserFocusExecutionAdmissionIssuer({
      keyPort,
      now: () => NOW,
      createNonce: () => "nonce",
      ttlMs: 0,
    }).issue({
      extensionId: "studio-mac",
      sessionId: "session-001",
      targetHash: "sha256:focus-target",
      approvalScopeId: "scope:approved",
    })).toEqual({ ok: false, reasonCode: "browser_focus_execution_admission_input_invalid" })
  })
})
