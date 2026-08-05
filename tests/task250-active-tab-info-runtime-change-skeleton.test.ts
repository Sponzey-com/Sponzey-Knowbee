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
  bridgeYeonjangBrowserActiveTabInfoAuthorizationToExecutor,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-authorization-executor-bridge.ts"
import {
  buildYeonjangBrowserActiveTabInfoHighRiskAuthorization,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-high-risk-authorization.ts"
import {
  buildYeonjangBrowserActiveTabInfoRuntimeChangeSkeleton,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-change-skeleton.ts"
import {
  evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-enable-prerequisites.ts"

function executorDryRunPlan() {
  const targetSurfaces = ["rust_live_handler", "skill_mapping"] as const
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
    explicitEnableScope: targetSurfaces,
  })
  const activationTaskState = transitionYeonjangBrowserActiveTabInfoActivationTask({
    currentState: "draft",
    activationRequest,
    operatorConfirmed: true,
    rollbackPlanAccepted: true,
    surfaceMatrixAccepted: true,
    cancelRequested: false,
  })
  return buildYeonjangBrowserActiveTabInfoActivationExecutorBoundary({
    activationTaskState,
    highRiskOperatorAuthorizationAccepted: true,
    targetSurfaces,
    rollbackCommandPlanAccepted: true,
    postCheckEvidenceRequirementAccepted: true,
    failureRecoveryRouteAccepted: true,
  })
}

function bridgeReadiness() {
  const executorBoundary = executorDryRunPlan()
  const authorization = buildYeonjangBrowserActiveTabInfoHighRiskAuthorization({
    operatorIdentityProof: "operator-proof:release-owner",
    authorizationScope: "runtime_activation_executor",
    targetSurfaces: ["rust_live_handler", "skill_mapping"],
    rollbackAcknowledged: true,
    postCheckAcknowledged: true,
    auditReference: "audit:browser-active-tab-info-live-enable",
    authorizedAt: "2026-07-22T01:00:00.000Z",
    expiresAt: "2026-07-22T02:00:00.000Z",
  }, {
    now: new Date("2026-07-22T01:30:00.000Z"),
  })
  return bridgeYeonjangBrowserActiveTabInfoAuthorizationToExecutor({
    authorization,
    executorBoundary,
    now: new Date("2026-07-22T01:30:00.000Z"),
  })
}

describe("task250 active tab info runtime change skeleton", () => {
  it("builds a code-only runtime change skeleton without executing", () => {
    const executorBoundary = executorDryRunPlan()
    const skeleton = buildYeonjangBrowserActiveTabInfoRuntimeChangeSkeleton({
      bridgeReadiness: bridgeReadiness(),
      targetSurfaces: executorBoundary.targetSurfaces,
      rollbackCommandPlan: executorBoundary.rollbackCommandPlan,
      postCheckEvidenceRequirements: executorBoundary.postCheckEvidenceRequirements,
      failureRecoveryRoute: executorBoundary.failureRecoveryRoute,
    })

    expect(skeleton).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-runtime-change-skeleton.v1",
      method: "browser.active_tab_info",
      status: "runtime_change_skeleton_ready",
      reasonCode: "active_tab_info_runtime_change_skeleton_ready",
      targetSurfaces: ["rust_live_handler", "skill_mapping"],
      orderedSteps: [
        "confirm_runtime_change_authorization_scope",
        "prepare_target_surface_change_plan",
        "stage_rollback_commands",
        "define_post_check_evidence_collection",
        "stop_before_runtime_binding_mutation",
      ],
      rollbackCommandPlan: [
        "disable:browser.active_tab_info:rust_live_handler",
        "disable:browser.active_tab_info:skill_mapping",
      ],
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

  it("blocks when bridge readiness or required skeleton inputs are missing", () => {
    const skeleton = buildYeonjangBrowserActiveTabInfoRuntimeChangeSkeleton({
      bridgeReadiness: {
        ...bridgeReadiness(),
        status: "blocked",
      },
      targetSurfaces: [],
      rollbackCommandPlan: [],
      postCheckEvidenceRequirements: [],
      failureRecoveryRoute: undefined,
    })

    expect(skeleton.status).toBe("blocked")
    expect(skeleton.reasonCode).toBe("active_tab_info_runtime_change_skeleton_blocked")
    expect(skeleton.blockingReasonCodes).toEqual([
      "runtime_change_skeleton_bridge_not_ready",
      "runtime_change_skeleton_target_surfaces_required",
      "runtime_change_skeleton_rollback_command_plan_required",
      "runtime_change_skeleton_post_check_evidence_required",
      "runtime_change_skeleton_failure_recovery_route_required",
    ])
    expect(skeleton.executeNow).toBe(false)
    expect(skeleton.addRustDispatchNow).toBe(false)
    expect(skeleton.enableSkillMappingNow).toBe(false)
    expect(skeleton.addProductionBindingNow).toBe(false)
    expect(skeleton.enableDefaultLiveSmokeNow).toBe(false)
  })

  it("does not carry authorization, audit, url, token, local path, or raw browser data", () => {
    const executorBoundary = executorDryRunPlan()
    const skeleton = buildYeonjangBrowserActiveTabInfoRuntimeChangeSkeleton({
      bridgeReadiness: bridgeReadiness(),
      targetSurfaces: executorBoundary.targetSurfaces,
      rollbackCommandPlan: executorBoundary.rollbackCommandPlan,
      postCheckEvidenceRequirements: executorBoundary.postCheckEvidenceRequirements,
      failureRecoveryRoute: executorBoundary.failureRecoveryRoute,
    })

    expect(JSON.stringify(skeleton)).not.toMatch(
      /audit:|operator-proof|review:|https?:\/\/|\/Users\/|token=|raw title|raw url/iu,
    )
  })
})
