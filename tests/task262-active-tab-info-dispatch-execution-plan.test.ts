import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoDispatchExecutionPlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-execution-plan.ts"
import type {
  YeonjangBrowserActiveTabInfoLiveExecutionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-execution-receipt.ts"

const READY_RECEIPT: YeonjangBrowserActiveTabInfoLiveExecutionReceipt = {
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
}

describe("task262 active tab info dispatch execution plan", () => {
  it("builds a code-only dispatch plan without executing dispatch or activation", () => {
    const plan = buildYeonjangBrowserActiveTabInfoDispatchExecutionPlan({
      liveExecutionReceipt: READY_RECEIPT,
      dispatchTransportReady: true,
      targetSurfaceLockAcquired: true,
      rollbackExecutorAvailable: true,
      postCheckExecutorAvailable: true,
      cancelRequested: false,
    })

    expect(plan).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-execution-plan.v1",
      method: "browser.active_tab_info",
      state: "planned",
      reasonCode: "active_tab_info_dispatch_execution_plan_ready",
      liveExecutionReceiptId: "live-execution-receipt:browser.active_tab_info:b42",
      targetSurfaces: ["rust_live_handler", "skill_mapping"],
      orderedDispatchSteps: [
        "reconfirm_live_execution_receipt",
        "reconfirm_target_surface_lock",
        "prepare_rust_dispatch_input",
        "collect_dispatch_result_reference",
        "stop_before_skill_mapping_activation",
      ],
      rollbackSteps: [
        "use_receipt_rollback_command_ref",
        "restore_previous_runtime_binding",
        "record_rollback_reference_only",
      ],
      postCheckSteps: [
        "use_receipt_post_execution_verification_plan_ref",
        "verify_redacted_runtime_result",
        "verify_final_and_product_log_boundaries",
      ],
      dispatchNow: false,
      addRustDispatchNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
      markUserGoalSucceededNow: false,
    })
  })

  it("blocks missing receipt readiness and unavailable dispatch prerequisites", () => {
    const plan = buildYeonjangBrowserActiveTabInfoDispatchExecutionPlan({
      liveExecutionReceipt: {
        ...READY_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      dispatchTransportReady: false,
      targetSurfaceLockAcquired: false,
      rollbackExecutorAvailable: false,
      postCheckExecutorAvailable: false,
      cancelRequested: false,
    })

    expect(plan.state).toBe("blocked")
    expect(plan.reasonCode).toBe("active_tab_info_dispatch_execution_plan_blocked")
    expect(plan.blockingReasonCodes).toEqual([
      "dispatch_execution_plan_receipt_not_ready",
      "dispatch_execution_plan_transport_not_ready",
      "dispatch_execution_plan_surface_lock_missing",
      "dispatch_execution_plan_rollback_executor_unavailable",
      "dispatch_execution_plan_post_check_executor_unavailable",
    ])
    expect(plan.liveExecutionReceiptId).toBe("live-execution-receipt:browser.active_tab_info:blocked")
    expect(plan.targetSurfaces).toEqual([])
    expect(plan.dispatchNow).toBe(false)
  })

  it("cancels before planning when requested", () => {
    const plan = buildYeonjangBrowserActiveTabInfoDispatchExecutionPlan({
      liveExecutionReceipt: READY_RECEIPT,
      dispatchTransportReady: true,
      targetSurfaceLockAcquired: true,
      rollbackExecutorAvailable: true,
      postCheckExecutorAvailable: true,
      cancelRequested: true,
    })

    expect(plan.state).toBe("cancelled")
    expect(plan.reasonCode).toBe("active_tab_info_dispatch_execution_plan_cancelled")
    expect(plan.blockingReasonCodes).toBeUndefined()
    expect(plan.dispatchNow).toBe(false)
  })

  it("does not expose raw target ids, operator proof, browser data, execution ids, or success claims", () => {
    const plan = buildYeonjangBrowserActiveTabInfoDispatchExecutionPlan({
      liveExecutionReceipt: READY_RECEIPT,
      dispatchTransportReady: true,
      targetSurfaceLockAcquired: true,
      rollbackExecutorAvailable: true,
      postCheckExecutorAvailable: true,
      cancelRequested: false,
    })

    expect(JSON.stringify(plan)).not.toMatch(
      /knowbee-instance:studio-mac|operator-live-proof|https?:\/\/|\/Users\/|token=|raw browser|raw tab|rust-dispatch-execution|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|user goal succeeded/iu,
    )
  })
})
