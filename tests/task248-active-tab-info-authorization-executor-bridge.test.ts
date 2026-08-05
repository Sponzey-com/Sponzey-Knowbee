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

function executorDryRunPlan(targetSurfaces = ["rust_live_handler", "skill_mapping"] as const) {
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

function acceptedAuthorization(targetSurfaces = ["rust_live_handler", "skill_mapping"] as const) {
  return buildYeonjangBrowserActiveTabInfoHighRiskAuthorization({
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
}

describe("task248 active tab info authorization executor bridge", () => {
  it("marks the bridge ready for a separate runtime change without executing", () => {
    const bridge = bridgeYeonjangBrowserActiveTabInfoAuthorizationToExecutor({
      authorization: acceptedAuthorization(),
      executorBoundary: executorDryRunPlan(),
      now: new Date("2026-07-22T01:30:00.000Z"),
    })

    expect(bridge).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-authorization-executor-bridge.v1",
      method: "browser.active_tab_info",
      status: "ready_for_separate_runtime_change",
      reasonCode: "active_tab_info_authorization_executor_bridge_ready",
      targetSurfaces: ["rust_live_handler", "skill_mapping"],
      executeNow: false,
      addRustDispatchNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks when authorization is rejected, expired, or target surfaces do not match executor plan", () => {
    const bridge = bridgeYeonjangBrowserActiveTabInfoAuthorizationToExecutor({
      authorization: acceptedAuthorization(["rust_live_handler"]),
      executorBoundary: executorDryRunPlan(["rust_live_handler", "skill_mapping"]),
      now: new Date("2026-07-22T02:30:00.000Z"),
    })

    expect(bridge.status).toBe("blocked")
    expect(bridge.reasonCode).toBe("active_tab_info_authorization_executor_bridge_blocked")
    expect(bridge.blockingReasonCodes).toEqual([
      "authorization_executor_bridge_authorization_expired",
      "authorization_executor_bridge_target_surface_mismatch",
    ])
    expect(bridge.executeNow).toBe(false)
    expect(bridge.addRustDispatchNow).toBe(false)
    expect(bridge.enableSkillMappingNow).toBe(false)
    expect(bridge.addProductionBindingNow).toBe(false)
    expect(bridge.enableDefaultLiveSmokeNow).toBe(false)
  })

  it("does not carry audit reference, operator proof, url, token, or local path details", () => {
    const bridge = bridgeYeonjangBrowserActiveTabInfoAuthorizationToExecutor({
      authorization: acceptedAuthorization(),
      executorBoundary: executorDryRunPlan(),
      now: new Date("2026-07-22T01:30:00.000Z"),
    })

    expect(JSON.stringify(bridge)).not.toMatch(
      /audit:|operator-proof|https?:\/\/|\/Users\/|token=|raw title|raw url/iu,
    )
  })
})
