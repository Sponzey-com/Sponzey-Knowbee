import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoActivationRequest,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-activation-request.ts"
import {
  evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-enable-prerequisites.ts"

function readyPrerequisites() {
  return evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites({
    productionExposureAuditPassed: true,
    manualReviewRecordAccepted: true,
    runtimeTransitionReady: true,
    releaseApprovalEvidenceValid: true,
    finalProductLogBoundaryReady: true,
    operatorWordingReady: true,
    taskEvidenceReady: true,
  })
}

const baseInput = {
  prerequisiteProjection: readyPrerequisites(),
  manualApprovalReference: "review:browser-active-tab-info-live-enable",
  targetPlatform: "macos",
  operatorIdentityProof: "operator-proof:release-owner",
  rollbackRequirement: "disable_browser_active_tab_info_live_paths",
  explicitEnableScope: [
    "rust_live_handler",
    "skill_mapping",
    "production_binding",
  ],
} as const

describe("task240 active tab info activation request contract", () => {
  it("builds a code-only activation request without enabling runtime bindings", () => {
    const request = buildYeonjangBrowserActiveTabInfoActivationRequest(baseInput)

    expect(request).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-activation-request.v1",
      method: "browser.active_tab_info",
      status: "activation_request_ready",
      blockingReasonCodes: [],
      activationRequest: {
        manualApprovalReference: "review:browser-active-tab-info-live-enable",
        targetPlatform: "macos",
        operatorIdentityProof: "operator-proof:release-owner",
        rollbackRequirement: "disable_browser_active_tab_info_live_paths",
        explicitEnableScope: [
          "rust_live_handler",
          "skill_mapping",
          "production_binding",
        ],
      },
      executeNow: false,
      addRustDispatchNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks when prerequisites are not ready or required request fields are missing", () => {
    const request = buildYeonjangBrowserActiveTabInfoActivationRequest({
      ...baseInput,
      prerequisiteProjection: evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites({
        productionExposureAuditPassed: false,
        manualReviewRecordAccepted: true,
        runtimeTransitionReady: true,
        releaseApprovalEvidenceValid: true,
        finalProductLogBoundaryReady: true,
        operatorWordingReady: true,
        taskEvidenceReady: true,
      }),
      manualApprovalReference: "",
      explicitEnableScope: [],
    })

    expect(request.status).toBe("blocked")
    expect(request.blockingReasonCodes).toEqual([
      "activation_request_prerequisites_not_ready",
      "activation_request_manual_approval_reference_required",
      "activation_request_explicit_enable_scope_required",
    ])
    expect(request.activationRequest).toBeUndefined()
    expect(request.executeNow).toBe(false)
    expect(request.addRustDispatchNow).toBe(false)
    expect(request.enableSkillMappingNow).toBe(false)
    expect(request.addProductionBindingNow).toBe(false)
    expect(request.enableDefaultLiveSmokeNow).toBe(false)
  })

  it("keeps raw review, local path, url, token, and browser data out of the request", () => {
    const serialized = JSON.stringify(buildYeonjangBrowserActiveTabInfoActivationRequest({
      ...baseInput,
      manualApprovalReference: "review:browser-active-tab-info-live-enable?token=secret",
      operatorIdentityProof: "operator-proof:/Users/example/release-owner",
      rollbackRequirement: "disable after checking https://example.com/raw-title",
    }))

    expect(serialized).not.toMatch(
      /reviewIdHash|reviewerIdentityHash|evidenceChecksum|rollbackPlanChecksum|token=|https?:\/\/|\/Users\/|raw title|raw url|tabId|windowId/iu,
    )
  })
})
