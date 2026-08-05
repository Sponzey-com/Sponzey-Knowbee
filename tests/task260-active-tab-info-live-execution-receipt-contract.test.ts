import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoLiveExecutionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-execution-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoLiveExecutionAuthorization,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-execution-authorization.ts"

const READY_AUTHORIZATION: YeonjangBrowserActiveTabInfoLiveExecutionAuthorization = {
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
}

describe("task260 active tab info live execution receipt contract", () => {
  it("builds a code-only receipt without dispatching runtime changes", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoLiveExecutionReceipt({
      liveExecutionAuthorization: READY_AUTHORIZATION,
      targetInstanceId: "knowbee-instance:studio-mac",
      runtimeConfigSnapshotId: "runtime-config-snapshot:active-tab-info:001",
      operatorExecutionWindow: {
        startsAt: "2026-07-22T02:06:00.000Z",
        expiresAt: "2026-07-22T02:09:00.000Z",
      },
      rollbackCommandRef: "rollback-command:active-tab-info:disable-live-paths",
      postExecutionVerificationPlanRef: "post-check-plan:active-tab-info:redacted-result",
    }, {
      now: new Date("2026-07-22T02:07:00.000Z"),
    })

    expect(receipt).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-execution-receipt.v1",
      method: "browser.active_tab_info",
      status: "live_execution_receipt_ready",
      reasonCode: "active_tab_info_live_execution_receipt_ready",
      receipt: {
        liveExecutionReceiptId: "live-execution-receipt:browser.active_tab_info:b42",
        authorizationRef: "live-execution-authorization:browser.active_tab_info:bc5",
        dryRunReceiptId: "dry-run-receipt:browser.active_tab_info:be8",
        targetInstanceRef: "target-instance:browser.active_tab_info:22d",
        targetSurfaces: ["rust_live_handler", "skill_mapping"],
        runtimeConfigSnapshotId: "runtime-config-snapshot:active-tab-info:001",
        executionWindow: {
          startsAt: "2026-07-22T02:06:00.000Z",
          expiresAt: "2026-07-22T02:09:00.000Z",
        },
        rollbackCommandRef: "rollback-command:active-tab-info:disable-live-paths",
        postExecutionVerificationPlanRef: "post-check-plan:active-tab-info:redacted-result",
      },
      dispatchNow: false,
      addRustDispatchNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
      markUserGoalSucceededNow: false,
    })
  })

  it("blocks unsafe authorization, refs, and invalid windows", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoLiveExecutionReceipt({
      liveExecutionAuthorization: {
        ...READY_AUTHORIZATION,
        status: "blocked",
        authorization: undefined,
      },
      targetInstanceId: "/Users/private-instance",
      runtimeConfigSnapshotId: "snapshot:raw",
      operatorExecutionWindow: {
        startsAt: "invalid",
        expiresAt: "2026-07-22T02:06:00.000Z",
      },
      rollbackCommandRef: "https://rollback.example",
      postExecutionVerificationPlanRef: "post-check:raw",
    }, {
      now: new Date("2026-07-22T02:07:00.000Z"),
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe("active_tab_info_live_execution_receipt_blocked")
    expect(receipt.blockingReasonCodes).toEqual([
      "live_execution_receipt_authorization_not_ready",
      "live_execution_receipt_target_instance_id_invalid",
      "live_execution_receipt_runtime_config_snapshot_id_invalid",
      "live_execution_receipt_window_starts_at_invalid",
      "live_execution_receipt_rollback_command_ref_invalid",
      "live_execution_receipt_post_execution_verification_plan_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
    expect(receipt.dispatchNow).toBe(false)
  })

  it("blocks inactive windows and authorization expiry mismatch", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoLiveExecutionReceipt({
      liveExecutionAuthorization: {
        ...READY_AUTHORIZATION,
        authorization: {
          ...READY_AUTHORIZATION.authorization!,
          expiresAt: "2026-07-22T02:08:00.000Z",
        },
      },
      targetInstanceId: "knowbee-instance:studio-mac",
      runtimeConfigSnapshotId: "runtime-config-snapshot:active-tab-info:001",
      operatorExecutionWindow: {
        startsAt: "2026-07-22T02:06:00.000Z",
        expiresAt: "2026-07-22T02:09:00.000Z",
      },
      rollbackCommandRef: "rollback-command:active-tab-info:disable-live-paths",
      postExecutionVerificationPlanRef: "post-check-plan:active-tab-info:redacted-result",
    }, {
      now: new Date("2026-07-22T02:05:00.000Z"),
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.blockingReasonCodes).toEqual([
      "live_execution_receipt_window_not_active",
      "live_execution_receipt_authorization_expires_before_window",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw instance ids, operator proof, live dispatch ids, or user success claims", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoLiveExecutionReceipt({
      liveExecutionAuthorization: READY_AUTHORIZATION,
      targetInstanceId: "knowbee-instance:studio-mac",
      runtimeConfigSnapshotId: "runtime-config-snapshot:active-tab-info:001",
      operatorExecutionWindow: {
        startsAt: "2026-07-22T02:06:00.000Z",
        expiresAt: "2026-07-22T02:09:00.000Z",
      },
      rollbackCommandRef: "rollback-command:active-tab-info:disable-live-paths",
      postExecutionVerificationPlanRef: "post-check-plan:active-tab-info:redacted-result",
    }, {
      now: new Date("2026-07-22T02:07:00.000Z"),
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /knowbee-instance:studio-mac|operator-live-proof|https?:\/\/|\/Users\/|token=|rust-dispatch-execution|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|user goal succeeded/iu,
    )
  })
})
