import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-mutation-executor-plan.ts"
import type {
  YeonjangBrowserActiveTabInfoRuntimeMutationPreflight,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-mutation-preflight.ts"

const READY_PREFLIGHT: YeonjangBrowserActiveTabInfoRuntimeMutationPreflight = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-mutation-preflight.v1",
  method: "browser.active_tab_info",
  status: "mutation_preflight_ready",
  reasonCode: "active_tab_info_runtime_mutation_preflight_ready",
  targetSurfaces: ["rust_live_handler", "skill_mapping"],
  plannedMutationSurfaces: ["rust_live_handler", "skill_mapping"],
  rollbackCommandPlan: [
    "disable:browser.active_tab_info:rust_live_handler",
    "disable:browser.active_tab_info:skill_mapping",
  ],
  postCheckEvidenceRequirements: [
    "active_tab_info_runtime_result_redacted",
    "active_tab_info_product_log_evidence_ref_only",
  ],
  executeNow: false,
  addRustDispatchNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task254 active tab info runtime mutation executor plan", () => {
  it("builds a planned code-only executor state without executing runtime mutation", () => {
    const plan = buildYeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan({
      runtimeMutationPreflight: READY_PREFLIGHT,
      operatorFinalConfirmation: true,
      rollbackCommandDryRunResult: "passed",
      postCheckCollectorDryRunResult: "passed",
      mutationSurfaceLockAcquired: true,
      cancelRequested: false,
    })

    expect(plan).toEqual({
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
    })
  })

  it("blocks when preflight, confirmation, dry-runs, or surface lock are not ready", () => {
    const plan = buildYeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan({
      runtimeMutationPreflight: {
        ...READY_PREFLIGHT,
        status: "blocked",
      },
      operatorFinalConfirmation: false,
      rollbackCommandDryRunResult: "failed",
      postCheckCollectorDryRunResult: "failed",
      mutationSurfaceLockAcquired: false,
      cancelRequested: false,
    })

    expect(plan.state).toBe("blocked")
    expect(plan.reasonCode).toBe("active_tab_info_runtime_mutation_executor_plan_blocked")
    expect(plan.blockingReasonCodes).toEqual([
      "runtime_mutation_executor_preflight_not_ready",
      "runtime_mutation_executor_operator_final_confirmation_missing",
      "runtime_mutation_executor_rollback_dry_run_failed",
      "runtime_mutation_executor_post_check_dry_run_failed",
      "runtime_mutation_executor_surface_lock_missing",
    ])
    expect(plan.executeNow).toBe(false)
    expect(plan.addRustDispatchNow).toBe(false)
    expect(plan.enableSkillMappingNow).toBe(false)
    expect(plan.addProductionBindingNow).toBe(false)
    expect(plan.enableDefaultLiveSmokeNow).toBe(false)
  })

  it("cancels before blocking or planning when cancel is requested", () => {
    const plan = buildYeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan({
      runtimeMutationPreflight: READY_PREFLIGHT,
      operatorFinalConfirmation: true,
      rollbackCommandDryRunResult: "passed",
      postCheckCollectorDryRunResult: "passed",
      mutationSurfaceLockAcquired: true,
      cancelRequested: true,
    })

    expect(plan.state).toBe("cancelled")
    expect(plan.reasonCode).toBe("active_tab_info_runtime_mutation_executor_plan_cancelled")
    expect(plan.executeNow).toBe(false)
  })

  it("does not carry audit, authorization, review, url, token, local path, or raw browser data", () => {
    const plan = buildYeonjangBrowserActiveTabInfoRuntimeMutationExecutorPlan({
      runtimeMutationPreflight: READY_PREFLIGHT,
      operatorFinalConfirmation: true,
      rollbackCommandDryRunResult: "passed",
      postCheckCollectorDryRunResult: "passed",
      mutationSurfaceLockAcquired: true,
      cancelRequested: false,
    })

    expect(JSON.stringify(plan)).not.toMatch(
      /audit:|operator-proof|review:|https?:\/\/|\/Users\/|token=|raw title|raw url/iu,
    )
  })
})
