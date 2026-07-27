import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoDispatchDryRunReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-dry-run-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoDispatchExecutionPlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-dispatch-execution-plan.ts"

const PLANNED_DISPATCH_PLAN: YeonjangBrowserActiveTabInfoDispatchExecutionPlan = {
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
}

describe("task264 active tab info dispatch dry-run receipt", () => {
  it("builds a code-only dispatch dry-run receipt without executing dispatch", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoDispatchDryRunReceipt({
      dispatchExecutionPlan: PLANNED_DISPATCH_PLAN,
      dispatchAdapterDryRunId: "dry-run:active-tab-info-dispatch-adapter:001",
      expectedSurfaceCount: 2,
      rollbackDryRunId: "dry-run:active-tab-info-dispatch-rollback:001",
      postCheckDryRunId: "dry-run:active-tab-info-dispatch-post-check:001",
    })

    expect(receipt).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-dry-run-receipt.v1",
      method: "browser.active_tab_info",
      status: "dispatch_dry_run_receipt_ready",
      reasonCode: "active_tab_info_dispatch_dry_run_receipt_ready",
      dispatchDryRunReceiptId: "dispatch-dry-run-receipt:browser.active_tab_info:d92",
      liveExecutionReceiptId: "live-execution-receipt:browser.active_tab_info:b42",
      targetSurfaceCount: 2,
      dispatchAdapterDryRunStatus: "passed",
      rollbackDryRunStatus: "passed",
      postCheckDryRunStatus: "passed",
      dispatchNow: false,
      addRustDispatchNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
      markUserGoalSucceededNow: false,
    })
  })

  it("blocks non-planned dispatch plans, unsafe dry-run ids, and surface mismatches", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoDispatchDryRunReceipt({
      dispatchExecutionPlan: {
        ...PLANNED_DISPATCH_PLAN,
        state: "blocked",
      },
      dispatchAdapterDryRunId: "https://dry-run.example",
      expectedSurfaceCount: 3,
      rollbackDryRunId: "/Users/private/rollback",
      postCheckDryRunId: "post-check:raw",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe("active_tab_info_dispatch_dry_run_receipt_blocked")
    expect(receipt.blockingReasonCodes).toEqual([
      "dispatch_dry_run_receipt_plan_not_planned",
      "dispatch_dry_run_receipt_adapter_dry_run_id_invalid",
      "dispatch_dry_run_receipt_surface_count_mismatch",
      "dispatch_dry_run_receipt_rollback_dry_run_id_invalid",
      "dispatch_dry_run_receipt_post_check_dry_run_id_invalid",
    ])
    expect(receipt.dispatchDryRunReceiptId).toBe(
      "dispatch-dry-run-receipt:browser.active_tab_info:blocked",
    )
    expect(receipt.dispatchNow).toBe(false)
  })

  it("does not expose raw dry-run ids, target ids, browser data, execution ids, or success claims", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoDispatchDryRunReceipt({
      dispatchExecutionPlan: PLANNED_DISPATCH_PLAN,
      dispatchAdapterDryRunId: "dry-run:active-tab-info-dispatch-adapter:001",
      expectedSurfaceCount: 2,
      rollbackDryRunId: "dry-run:active-tab-info-dispatch-rollback:001",
      postCheckDryRunId: "dry-run:active-tab-info-dispatch-post-check:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /active-tab-info-dispatch-adapter:001|active-tab-info-dispatch-rollback:001|active-tab-info-dispatch-post-check:001|knowbee-instance|operator-live-proof|https?:\/\/|\/Users\/|token=|raw browser|raw tab|rust-dispatch-execution|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|user goal succeeded/iu,
    )
  })
})
