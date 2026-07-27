import { describe, expect, it } from "vitest"

import {
  evaluateYeonjangBrowserFocusExecutionAdmission,
  type YeonjangBrowserFocusExecutionAdmission,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-execution-admission.ts"

const NOW = new Date("2026-07-23T09:00:00.000Z")
const ADMISSION: YeonjangBrowserFocusExecutionAdmission = {
  schemaVersion: "knowbee.yeonjang-browser-focus-execution-admission.v1",
  method: "browser.focus",
  extensionId: "studio-mac",
  sessionId: "session-001",
  targetHash: "sha256:expected-target",
  approvalScopeId: "scope:browser-focus:approved",
  expiresAt: "2026-07-23T09:01:00.000Z",
  nonce: "nonce-private-value",
  signature: "signature-private-value",
}

function evaluate(overrides: Partial<Parameters<typeof evaluateYeonjangBrowserFocusExecutionAdmission>[0]> = {}) {
  return evaluateYeonjangBrowserFocusExecutionAdmission({
    admission: ADMISSION,
    expectedTargetHash: "sha256:expected-target",
    expectedExtensionId: "studio-mac",
    expectedSessionId: "session-001",
    now: NOW,
    signatureVerifier: { verify: () => true },
    nonceStore: { consume: () => true },
    ...overrides,
  })
}

describe("task566 browser.focus execution admission", () => {
  it("accepts only a signed, unexpired, exact target and instance admission", () => {
    const decision = evaluate()

    expect(decision).toMatchObject({
      schemaVersion: "knowbee.yeonjang-browser-focus-execution-admission-decision.v1",
      method: "browser.focus",
      status: "accepted",
      reasonCode: "browser_focus_execution_admission_accepted",
      invokeOsFocusNow: false,
      userGoalSucceededNow: false,
    })
    expect(decision.executionAdmissionRef).toMatch(
      /^yeonjang-browser-focus-execution-admission:sha256:[a-f0-9]{64}$/u,
    )
  })

  it("fails closed before nonce consumption for malformed, mismatched, expired, or unsigned admissions", () => {
    const nonceStore = { consume: () => { throw new Error("must not consume") } }
    expect(evaluate({ admission: undefined, nonceStore })).toMatchObject({
      status: "blocked", reasonCode: "browser_focus_execution_admission_missing",
    })
    expect(evaluate({ admission: { ...ADMISSION, method: "browser.open_url" as never }, nonceStore })).toMatchObject({
      status: "blocked", reasonCode: "browser_focus_execution_admission_method_invalid",
    })
    expect(evaluate({ expectedTargetHash: "sha256:other", nonceStore })).toMatchObject({
      status: "blocked", reasonCode: "browser_focus_execution_admission_target_mismatch",
    })
    expect(evaluate({ expectedExtensionId: "other-mac", nonceStore })).toMatchObject({
      status: "blocked", reasonCode: "browser_focus_execution_admission_target_instance_mismatch",
    })
    expect(evaluate({ admission: { ...ADMISSION, expiresAt: "2026-07-23T08:59:59.000Z" }, nonceStore })).toMatchObject({
      status: "blocked", reasonCode: "browser_focus_execution_admission_expired",
    })
    expect(evaluate({ signatureVerifier: { verify: () => false }, nonceStore })).toMatchObject({
      status: "blocked", reasonCode: "browser_focus_execution_admission_signature_invalid",
    })
  })

  it("consumes a nonce only after every other check and blocks a replay", () => {
    const calls: string[] = []
    expect(evaluate({ nonceStore: { consume: ({ nonce }) => { calls.push(nonce); return false } } })).toMatchObject({
      status: "blocked", reasonCode: "browser_focus_execution_admission_nonce_replayed",
    })
    expect(calls).toEqual(["nonce-private-value"])
  })

  it("never exposes raw target, scope, nonce, signature, token-like values, or an OS execution success", () => {
    const serialized = JSON.stringify(evaluate())
    expect(serialized).not.toMatch(
      /studio-mac|session-001|expected-target|scope:browser-focus|nonce-private|signature-private|token=|invokeOsFocusNow":true|userGoalSucceededNow":true/iu,
    )
  })
})
