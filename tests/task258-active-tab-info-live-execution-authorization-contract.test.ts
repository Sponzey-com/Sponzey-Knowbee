import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoLiveExecutionAuthorization,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-execution-authorization.ts"
import type {
  YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.ts"

const READY_DRY_RUN_RECEIPT: YeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.v1",
  method: "browser.active_tab_info",
  status: "dry_run_receipt_ready",
  reasonCode: "active_tab_info_runtime_mutation_dry_run_receipt_ready",
  dryRunReceiptId: "dry-run-receipt:browser.active_tab_info:be8",
  mutationSurfaceCount: 2,
  rollbackDryRunStatus: "passed",
  postCheckDryRunStatus: "passed",
  executeNow: false,
  addRustDispatchNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
  createLiveExecutionReceiptNow: false,
}

describe("task258 active tab info live execution authorization contract", () => {
  it("builds a code-only live execution authorization without creating live ids", () => {
    const authorization = buildYeonjangBrowserActiveTabInfoLiveExecutionAuthorization({
      dryRunReceipt: READY_DRY_RUN_RECEIPT,
      operatorFinalLiveAuthorizationProof: "operator-live-proof:release-owner",
      targetSurfaces: ["rust_live_handler", "skill_mapping"],
      rollbackEmergencyCommandAcknowledged: true,
      postExecutionVerificationAcknowledged: true,
      authorizedAt: "2026-07-22T02:00:00.000Z",
      expiresAt: "2026-07-22T02:10:00.000Z",
    }, {
      now: new Date("2026-07-22T02:05:00.000Z"),
    })

    expect(authorization).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-execution-authorization.v1",
      method: "browser.active_tab_info",
      status: "live_execution_authorization_ready",
      reasonCode: "active_tab_info_live_execution_authorization_ready",
      authorization: {
        authorizationRef: "live-execution-authorization:browser.active_tab_info:bc5",
        dryRunReceiptId: "dry-run-receipt:browser.active_tab_info:be8",
        targetSurfaces: ["rust_live_handler", "skill_mapping"],
        rollbackEmergencyCommandAcknowledged: true,
        postExecutionVerificationAcknowledged: true,
        authorizedAt: "2026-07-22T02:00:00.000Z",
        expiresAt: "2026-07-22T02:10:00.000Z",
      },
      executeNow: false,
      addRustDispatchNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
      createLiveExecutionReceiptNow: false,
    })
  })

  it("blocks missing receipt readiness, acknowledgements, target surfaces, and expired authorization", () => {
    const authorization = buildYeonjangBrowserActiveTabInfoLiveExecutionAuthorization({
      dryRunReceipt: {
        ...READY_DRY_RUN_RECEIPT,
        status: "blocked",
      },
      operatorFinalLiveAuthorizationProof: "",
      targetSurfaces: [],
      rollbackEmergencyCommandAcknowledged: false,
      postExecutionVerificationAcknowledged: false,
      authorizedAt: "invalid",
      expiresAt: "2026-07-22T02:00:00.000Z",
    }, {
      now: new Date("2026-07-22T02:05:00.000Z"),
    })

    expect(authorization.status).toBe("blocked")
    expect(authorization.reasonCode).toBe("active_tab_info_live_execution_authorization_blocked")
    expect(authorization.blockingReasonCodes).toEqual([
      "live_execution_authorization_dry_run_receipt_not_ready",
      "live_execution_authorization_operator_proof_required",
      "live_execution_authorization_target_surfaces_required",
      "live_execution_authorization_rollback_emergency_acknowledgement_required",
      "live_execution_authorization_post_execution_verification_acknowledgement_required",
      "live_execution_authorization_authorized_at_invalid",
      "live_execution_authorization_expired",
    ])
    expect(authorization.authorization).toBeUndefined()
    expect(authorization.executeNow).toBe(false)
    expect(authorization.createLiveExecutionReceiptNow).toBe(false)
  })

  it("rejects unsafe proof and avoids raw data or live execution identifiers", () => {
    const authorization = buildYeonjangBrowserActiveTabInfoLiveExecutionAuthorization({
      dryRunReceipt: READY_DRY_RUN_RECEIPT,
      operatorFinalLiveAuthorizationProof: "operator-secret:/Users/example?token=secret",
      targetSurfaces: ["rust_live_handler", "skill_mapping"],
      rollbackEmergencyCommandAcknowledged: true,
      postExecutionVerificationAcknowledged: true,
      authorizedAt: "2026-07-22T02:00:00.000Z",
      expiresAt: "2026-07-22T02:10:00.000Z",
    }, {
      now: new Date("2026-07-22T02:05:00.000Z"),
    })

    expect(authorization.status).toBe("blocked")
    expect(authorization.blockingReasonCodes).toEqual([
      "live_execution_authorization_operator_proof_unsafe",
    ])
    expect(JSON.stringify(authorization)).not.toMatch(
      /operator-secret|\/Users\/|token=|https?:\/\/|raw title|raw url|rust-dispatch|skill-mapping|production-binding|default-live-smoke-run/iu,
    )
  })
})
