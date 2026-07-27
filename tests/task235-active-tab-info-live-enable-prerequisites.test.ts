import { describe, expect, it } from "vitest"

import {
  evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-enable-prerequisites.ts"

function completeInput() {
  return {
    productionExposureAuditPassed: true,
    manualReviewRecordAccepted: true,
    runtimeTransitionReady: true,
    releaseApprovalEvidenceValid: true,
    finalProductLogBoundaryReady: true,
    operatorWordingReady: true,
    taskEvidenceReady: true,
  } as const
}

describe("Task 235 active tab info live enable prerequisites", () => {
  it("allows only a separate explicit enable task after every prerequisite is proven", () => {
    const result = evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites(completeInput())

    expect(result).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-prerequisites.v1",
      method: "browser.active_tab_info",
      status: "ready_for_explicit_enable_task",
      missingPrerequisites: [],
      blockingReasonCodes: [],
      requiredPrerequisites: [
        "production_exposure_audit",
        "manual_review_record",
        "runtime_transition_state_machine",
        "release_approval_evidence",
        "final_product_log_boundary",
        "operator_wording",
        "task_evidence",
      ],
      explicitEnableTaskRequired: true,
      addRustDispatchNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks when any prerequisite is missing and still keeps live paths closed", () => {
    const result = evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites({
      ...completeInput(),
      productionExposureAuditPassed: false,
      runtimeTransitionReady: false,
      finalProductLogBoundaryReady: false,
    })

    expect(result.status).toBe("blocked")
    expect(result.missingPrerequisites).toEqual([
      "production_exposure_audit",
      "runtime_transition_state_machine",
      "final_product_log_boundary",
    ])
    expect(result.blockingReasonCodes).toEqual([
      "live_enable_prerequisite_missing:production_exposure_audit",
      "live_enable_prerequisite_missing:runtime_transition_state_machine",
      "live_enable_prerequisite_missing:final_product_log_boundary",
    ])
    expect(result.explicitEnableTaskRequired).toBe(true)
    expect(result.addRustDispatchNow).toBe(false)
    expect(result.enableSkillMappingNow).toBe(false)
    expect(result.addProductionBindingNow).toBe(false)
    expect(result.enableDefaultLiveSmokeNow).toBe(false)
  })

  it("keeps the projection code-only without leaking review, evidence, or runtime details", () => {
    const serialized = JSON.stringify(evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites({
      ...completeInput(),
      releaseApprovalEvidenceValid: false,
      taskEvidenceReady: false,
    }))

    expect(serialized).not.toMatch(
      /reviewId|reviewerIdentityHash|evidenceChecksum|runtime transition|review_record_accepted|https?:\/\/|\/Users\/|token=|raw title|raw url/iu,
    )
  })
})
