import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoActivationExecutorBoundary,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-activation-executor-boundary.ts"
import {
  buildYeonjangBrowserActiveTabInfoActivationRequest,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-activation-request.ts"
import {
  transitionYeonjangBrowserActiveTabInfoActivationTask,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-activation-task-state-machine.ts"
import {
  evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-enable-prerequisites.ts"

function executionPlannedTaskState() {
  const activationRequest = buildYeonjangBrowserActiveTabInfoActivationRequest({
    prerequisiteProjection: evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites({
      productionExposureAuditPassed: true,
      manualReviewRecordAccepted: true,
      runtimeTransitionReady: true,
      releaseApprovalEvidenceValid: true,
      finalProductLogBoundaryReady: true,
      operatorWordingReady: true,
      taskEvidenceReady: true,
    }),
    manualApprovalReference: "review:browser-active-tab-info-live-enable",
    targetPlatform: "macos",
    operatorIdentityProof: "operator-proof:release-owner",
    rollbackRequirement: "disable_browser_active_tab_info_live_paths",
    explicitEnableScope: ["rust_live_handler", "skill_mapping", "production_binding"],
  })
  return transitionYeonjangBrowserActiveTabInfoActivationTask({
    currentState: "draft",
    activationRequest,
    operatorConfirmed: true,
    rollbackPlanAccepted: true,
    surfaceMatrixAccepted: true,
    cancelRequested: false,
  })
}

describe("task244 active tab info activation executor boundary", () => {
  it("returns only a dry-run executor plan when high-risk authorization is absent", () => {
    const result = buildYeonjangBrowserActiveTabInfoActivationExecutorBoundary({
      activationTaskState: executionPlannedTaskState(),
      highRiskOperatorAuthorizationAccepted: false,
      targetSurfaces: ["rust_live_handler", "skill_mapping"],
      rollbackCommandPlanAccepted: true,
      postCheckEvidenceRequirementAccepted: true,
      failureRecoveryRouteAccepted: true,
    })

    expect(result).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-executor-boundary.v1",
      method: "browser.active_tab_info",
      status: "dry_run_plan",
      reasonCode: "active_tab_info_activation_executor_high_risk_authorization_required",
      targetSurfaces: ["rust_live_handler", "skill_mapping"],
      rollbackCommandPlan: ["disable:browser.active_tab_info:rust_live_handler", "disable:browser.active_tab_info:skill_mapping"],
      postCheckEvidenceRequirements: [
        "active_tab_info_runtime_result_redacted",
        "active_tab_info_product_log_evidence_ref_only",
        "active_tab_info_release_surface_matrix_unchanged",
      ],
      failureRecoveryRoute: "disable_target_surfaces_then_report_reason_code",
      executeNow: false,
      addRustDispatchNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks when task state or executor prerequisite gates are missing", () => {
    const result = buildYeonjangBrowserActiveTabInfoActivationExecutorBoundary({
      activationTaskState: {
        ...executionPlannedTaskState(),
        state: "blocked",
      },
      highRiskOperatorAuthorizationAccepted: true,
      targetSurfaces: [],
      rollbackCommandPlanAccepted: false,
      postCheckEvidenceRequirementAccepted: false,
      failureRecoveryRouteAccepted: false,
    })

    expect(result.status).toBe("blocked")
    expect(result.reasonCode).toBe("active_tab_info_activation_executor_gate_missing")
    expect(result.blockingReasonCodes).toEqual([
      "activation_executor_task_state_not_execution_planned",
      "activation_executor_target_surfaces_required",
      "activation_executor_rollback_command_plan_required",
      "activation_executor_post_check_evidence_required",
      "activation_executor_failure_recovery_route_required",
    ])
    expect(result.executeNow).toBe(false)
    expect(result.addRustDispatchNow).toBe(false)
    expect(result.enableSkillMappingNow).toBe(false)
    expect(result.addProductionBindingNow).toBe(false)
    expect(result.enableDefaultLiveSmokeNow).toBe(false)
  })

  it("does not execute even when every executor boundary gate is present", () => {
    const result = buildYeonjangBrowserActiveTabInfoActivationExecutorBoundary({
      activationTaskState: executionPlannedTaskState(),
      highRiskOperatorAuthorizationAccepted: true,
      targetSurfaces: ["rust_live_handler", "skill_mapping", "production_binding"],
      rollbackCommandPlanAccepted: true,
      postCheckEvidenceRequirementAccepted: true,
      failureRecoveryRouteAccepted: true,
    })

    expect(result.status).toBe("dry_run_plan")
    expect(result.reasonCode).toBe("active_tab_info_activation_executor_ready_for_separate_runtime_change")
    expect(result.executeNow).toBe(false)
    expect(result.addRustDispatchNow).toBe(false)
    expect(result.enableSkillMappingNow).toBe(false)
    expect(result.addProductionBindingNow).toBe(false)
    expect(result.enableDefaultLiveSmokeNow).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(
      /manualApprovalReference|operatorIdentityProof|review:|https?:\/\/|\/Users\/|token=|raw title|raw url/iu,
    )
  })
})
