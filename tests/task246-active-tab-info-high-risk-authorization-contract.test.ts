import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoHighRiskAuthorization,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-high-risk-authorization.ts"

const VALID_INPUT = {
  operatorIdentityProof: "operator-proof:release-owner",
  authorizationScope: "runtime_activation_executor",
  targetSurfaces: ["rust_live_handler", "skill_mapping"],
  rollbackAcknowledged: true,
  postCheckAcknowledged: true,
  auditReference: "audit:browser-active-tab-info-live-enable",
  authorizedAt: "2026-07-22T01:00:00.000Z",
  expiresAt: "2026-07-22T02:00:00.000Z",
} as const

describe("task246 active tab info high-risk authorization contract", () => {
  it("accepts high-risk authorization as a code-only gate without opening runtime bindings", () => {
    const authorization = buildYeonjangBrowserActiveTabInfoHighRiskAuthorization(VALID_INPUT, {
      now: new Date("2026-07-22T01:30:00.000Z"),
    })

    expect(authorization).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-high-risk-authorization.v1",
      method: "browser.active_tab_info",
      status: "accepted",
      reasonCode: "active_tab_info_high_risk_authorization_accepted",
      authorization: {
        authorizationScope: "runtime_activation_executor",
        targetSurfaces: ["rust_live_handler", "skill_mapping"],
        rollbackAcknowledged: true,
        postCheckAcknowledged: true,
        auditReference: "audit:browser-active-tab-info-live-enable",
        authorizedAt: "2026-07-22T01:00:00.000Z",
        expiresAt: "2026-07-22T02:00:00.000Z",
      },
      executeNow: false,
      addRustDispatchNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("rejects missing acknowledgements, missing target surfaces, and expired authorization", () => {
    const authorization = buildYeonjangBrowserActiveTabInfoHighRiskAuthorization({
      ...VALID_INPUT,
      targetSurfaces: [],
      rollbackAcknowledged: false,
      postCheckAcknowledged: false,
      expiresAt: "2026-07-22T01:00:00.000Z",
    }, {
      now: new Date("2026-07-22T01:30:00.000Z"),
    })

    expect(authorization.status).toBe("rejected")
    expect(authorization.reasonCode).toBe("active_tab_info_high_risk_authorization_invalid")
    expect(authorization.blockingReasonCodes).toEqual([
      "high_risk_authorization_target_surfaces_required",
      "high_risk_authorization_rollback_acknowledgement_required",
      "high_risk_authorization_post_check_acknowledgement_required",
      "high_risk_authorization_expired",
    ])
    expect(authorization.authorization).toBeUndefined()
    expect(authorization.executeNow).toBe(false)
    expect(authorization.addRustDispatchNow).toBe(false)
    expect(authorization.enableSkillMappingNow).toBe(false)
    expect(authorization.addProductionBindingNow).toBe(false)
    expect(authorization.enableDefaultLiveSmokeNow).toBe(false)
  })

  it("redacts operator proof and rejects unsafe secret, url, token, and local path content", () => {
    const authorization = buildYeonjangBrowserActiveTabInfoHighRiskAuthorization({
      ...VALID_INPUT,
      operatorIdentityProof: "operator-secret:/Users/example/token=secret",
      auditReference: "https://example.test/audit?token=secret",
    }, {
      now: new Date("2026-07-22T01:30:00.000Z"),
    })
    const serialized = JSON.stringify(authorization)

    expect(authorization.status).toBe("rejected")
    expect(authorization.blockingReasonCodes).toEqual([
      "high_risk_authorization_operator_identity_proof_unsafe",
      "high_risk_authorization_audit_reference_unsafe",
    ])
    expect(serialized).not.toMatch(/operator-secret|\/Users\/|token=|https?:\/\//iu)
  })
})
