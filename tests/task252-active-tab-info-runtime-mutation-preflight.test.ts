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
  evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-enable-prerequisites.ts"
import {
  buildYeonjangBrowserActiveTabInfoRuntimeChangeSkeleton,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-change-skeleton.ts"
import {
  buildYeonjangBrowserActiveTabInfoRuntimeMutationPreflight,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-mutation-preflight.ts"

function runtimeChangeSkeleton() {
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
  const executorBoundary = buildYeonjangBrowserActiveTabInfoActivationExecutorBoundary({
    activationTaskState,
    highRiskOperatorAuthorizationAccepted: true,
    targetSurfaces,
    rollbackCommandPlanAccepted: true,
    postCheckEvidenceRequirementAccepted: true,
    failureRecoveryRouteAccepted: true,
  })
  const authorization = buildYeonjangBrowserActiveTabInfoHighRiskAuthorization({
    operatorIdentityProof: "operator-proof:release-owner",
    authorizationScope: "runtime_activation_executor",
    targetSurfaces,
    rollbackAcknowledged: true,
    postCheckAcknowledged: true,
    auditReference: "audit:browser-active-tab-info-live-enable",
    authorizedAt: "2026-07-22T01:00:00.000Z",
    expiresAt: "2026-07-22T02:00:00.000Z",
  }, {
    now: new Date("2026-07-22T01:30:00.000Z"),
  })
  const bridgeReadiness = bridgeYeonjangBrowserActiveTabInfoAuthorizationToExecutor({
    authorization,
    executorBoundary,
    now: new Date("2026-07-22T01:30:00.000Z"),
  })

  return buildYeonjangBrowserActiveTabInfoRuntimeChangeSkeleton({
    bridgeReadiness,
    targetSurfaces: executorBoundary.targetSurfaces,
    rollbackCommandPlan: executorBoundary.rollbackCommandPlan,
    postCheckEvidenceRequirements: executorBoundary.postCheckEvidenceRequirements,
    failureRecoveryRoute: executorBoundary.failureRecoveryRoute,
  })
}

describe("task252 active tab info runtime mutation preflight", () => {
  it("builds a code-only mutation preflight without opening runtime paths", () => {
    const preflight = buildYeonjangBrowserActiveTabInfoRuntimeMutationPreflight({
      runtimeChangeSkeleton: runtimeChangeSkeleton(),
      productionExposureClosed: true,
      rollbackCommandAvailable: true,
      postCheckCollectorAvailable: true,
      finalProductLogBoundaryReady: true,
    })

    expect(preflight).toEqual({
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
        "active_tab_info_release_surface_matrix_unchanged",
      ],
      executeNow: false,
      addRustDispatchNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks mutation preflight when any required safety gate is missing", () => {
    const preflight = buildYeonjangBrowserActiveTabInfoRuntimeMutationPreflight({
      runtimeChangeSkeleton: {
        ...runtimeChangeSkeleton(),
        status: "blocked",
      },
      productionExposureClosed: false,
      rollbackCommandAvailable: false,
      postCheckCollectorAvailable: false,
      finalProductLogBoundaryReady: false,
    })

    expect(preflight.status).toBe("blocked")
    expect(preflight.reasonCode).toBe("active_tab_info_runtime_mutation_preflight_blocked")
    expect(preflight.blockingReasonCodes).toEqual([
      "runtime_mutation_preflight_skeleton_not_ready",
      "runtime_mutation_preflight_production_exposure_open",
      "runtime_mutation_preflight_rollback_command_unavailable",
      "runtime_mutation_preflight_post_check_collector_unavailable",
      "runtime_mutation_preflight_final_product_log_boundary_missing",
    ])
    expect(preflight.executeNow).toBe(false)
    expect(preflight.addRustDispatchNow).toBe(false)
    expect(preflight.enableSkillMappingNow).toBe(false)
    expect(preflight.addProductionBindingNow).toBe(false)
    expect(preflight.enableDefaultLiveSmokeNow).toBe(false)
  })

  it("does not carry audit, authorization, review, url, token, local path, or raw browser data", () => {
    const preflight = buildYeonjangBrowserActiveTabInfoRuntimeMutationPreflight({
      runtimeChangeSkeleton: runtimeChangeSkeleton(),
      productionExposureClosed: true,
      rollbackCommandAvailable: true,
      postCheckCollectorAvailable: true,
      finalProductLogBoundaryReady: true,
    })

    expect(JSON.stringify(preflight)).not.toMatch(
      /audit:|operator-proof|review:|https?:\/\/|\/Users\/|token=|raw title|raw url/iu,
    )
  })
})
