import { describe, expect, it } from "vitest"

import {
  transitionYeonjangBrowserActiveTabInfoActivationTask,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-activation-task-state-machine.ts"
import {
  buildYeonjangBrowserActiveTabInfoActivationRequest,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-activation-request.ts"
import {
  evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-enable-prerequisites.ts"

function readyActivationRequest() {
  return buildYeonjangBrowserActiveTabInfoActivationRequest({
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
    explicitEnableScope: ["rust_live_handler", "skill_mapping"],
  })
}

describe("task242 active tab info activation task state machine", () => {
  it("moves from draft to execution_planned only after request, operator, rollback, and surface checks pass", () => {
    const result = transitionYeonjangBrowserActiveTabInfoActivationTask({
      currentState: "draft",
      activationRequest: readyActivationRequest(),
      operatorConfirmed: true,
      rollbackPlanAccepted: true,
      surfaceMatrixAccepted: true,
      cancelRequested: false,
    })

    expect(result).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-task-state.v1",
      method: "browser.active_tab_info",
      state: "execution_planned",
      reasonCode: "active_tab_info_activation_execution_planned",
      executeNow: false,
      addRustDispatchNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks before execution planning when any required gate is missing", () => {
    const result = transitionYeonjangBrowserActiveTabInfoActivationTask({
      currentState: "draft",
      activationRequest: readyActivationRequest(),
      operatorConfirmed: false,
      rollbackPlanAccepted: false,
      surfaceMatrixAccepted: false,
      cancelRequested: false,
    })

    expect(result.state).toBe("blocked")
    expect(result.reasonCode).toBe("active_tab_info_activation_gate_missing")
    expect(result.blockingReasonCodes).toEqual([
      "activation_task_operator_confirmation_required",
      "activation_task_rollback_plan_required",
      "activation_task_surface_matrix_required",
    ])
    expect(result.executeNow).toBe(false)
    expect(result.addRustDispatchNow).toBe(false)
    expect(result.enableSkillMappingNow).toBe(false)
    expect(result.addProductionBindingNow).toBe(false)
    expect(result.enableDefaultLiveSmokeNow).toBe(false)
  })

  it("cancels without preserving activation request payload details", () => {
    const result = transitionYeonjangBrowserActiveTabInfoActivationTask({
      currentState: "operator_confirmed",
      activationRequest: readyActivationRequest(),
      operatorConfirmed: true,
      rollbackPlanAccepted: true,
      surfaceMatrixAccepted: true,
      cancelRequested: true,
    })
    const serialized = JSON.stringify(result)

    expect(result.state).toBe("cancelled")
    expect(result.reasonCode).toBe("active_tab_info_activation_cancelled")
    expect(serialized).not.toMatch(
      /manualApprovalReference|operatorIdentityProof|rollbackRequirement|activation_request_ready|https?:\/\/|\/Users\/|token=|raw title|raw url/iu,
    )
  })
})
