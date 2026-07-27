import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-mutation-dry-run-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.ts"

const PLANNED_EXECUTOR_PLAN: YeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.v1",
  method: "browser.active_tab_info",
  state: "planned",
  reasonCode: "active_tab_info_runtime_mutation_executor_plan_ready",
  mutationSurfaces: ["rust_live_handler", "skill_mapping"],
  orderedExecutionSteps: [
    "reconfirm_mutation_surface_lock",
    "apply_runtime_binding_change",
    "collect_post_check_evidence",
    "stop_before_default_live_smoke",
  ],
  rollbackDryRunSummary: "passed",
  postCheckDryRunSummary: "passed",
  executeNow: false,
  addRustDispatchNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task256 active tab info runtime mutation dry-run receipt", () => {
  it("builds a dry-run receipt without creating live execution ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt({
      runtimeMutationExecutorPlan: PLANNED_EXECUTOR_PLAN,
      runtimeExecutorDryRunId: "dry-run:active-tab-info-runtime-executor:001",
      expectedMutationSurfaceCount: 2,
      rollbackDryRunId: "dry-run:active-tab-info-rollback:001",
      postCheckDryRunId: "dry-run:active-tab-info-post-check:001",
    })

    expect(receipt).toEqual({
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
    })
  })

  it("blocks when executor plan, ids, or expected surface count are invalid", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt({
      runtimeMutationExecutorPlan: {
        ...PLANNED_EXECUTOR_PLAN,
        state: "blocked",
      },
      runtimeExecutorDryRunId: "",
      expectedMutationSurfaceCount: 3,
      rollbackDryRunId: "review:unsafe",
      postCheckDryRunId: "https://example.test/post-check?token=secret",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe("active_tab_info_runtime_mutation_dry_run_receipt_blocked")
    expect(receipt.blockingReasonCodes).toEqual([
      "runtime_mutation_dry_run_receipt_executor_plan_not_planned",
      "runtime_mutation_dry_run_receipt_executor_dry_run_id_invalid",
      "runtime_mutation_dry_run_receipt_surface_count_mismatch",
      "runtime_mutation_dry_run_receipt_rollback_dry_run_id_invalid",
      "runtime_mutation_dry_run_receipt_post_check_dry_run_id_invalid",
    ])
    expect(receipt.executeNow).toBe(false)
    expect(receipt.addRustDispatchNow).toBe(false)
    expect(receipt.enableSkillMappingNow).toBe(false)
    expect(receipt.addProductionBindingNow).toBe(false)
    expect(receipt.enableDefaultLiveSmokeNow).toBe(false)
    expect(receipt.createLiveExecutionReceiptNow).toBe(false)
  })

  it("does not carry audit, authorization, review, url, token, local path, or raw browser data", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoRuntimeMutationDryRunReceipt({
      runtimeMutationExecutorPlan: PLANNED_EXECUTOR_PLAN,
      runtimeExecutorDryRunId: "dry-run:active-tab-info-runtime-executor:001",
      expectedMutationSurfaceCount: 2,
      rollbackDryRunId: "dry-run:active-tab-info-rollback:001",
      postCheckDryRunId: "dry-run:active-tab-info-post-check:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /audit:|operator-proof|review:|https?:\/\/|\/Users\/|token=|raw title|raw url|live-execution|rust-dispatch|skill-mapping|production-binding/iu,
    )
  })
})
