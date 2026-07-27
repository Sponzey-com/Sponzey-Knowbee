export type YeonjangBrowserActiveTabInfoLiveEnablePrerequisiteId =
  | "production_exposure_audit"
  | "manual_review_record"
  | "runtime_transition_state_machine"
  | "release_approval_evidence"
  | "final_product_log_boundary"
  | "operator_wording"
  | "task_evidence"

export interface YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesInput {
  productionExposureAuditPassed: boolean
  manualReviewRecordAccepted: boolean
  runtimeTransitionReady: boolean
  releaseApprovalEvidenceValid: boolean
  finalProductLogBoundaryReady: boolean
  operatorWordingReady: boolean
  taskEvidenceReady: boolean
}

export interface YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesProjection {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-prerequisites.v1"
  method: "browser.active_tab_info"
  status: "ready_for_explicit_enable_task" | "blocked"
  missingPrerequisites: YeonjangBrowserActiveTabInfoLiveEnablePrerequisiteId[]
  blockingReasonCodes: string[]
  requiredPrerequisites: YeonjangBrowserActiveTabInfoLiveEnablePrerequisiteId[]
  explicitEnableTaskRequired: true
  addRustDispatchNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}

const REQUIRED_PREREQUISITES: readonly YeonjangBrowserActiveTabInfoLiveEnablePrerequisiteId[] = [
  "production_exposure_audit",
  "manual_review_record",
  "runtime_transition_state_machine",
  "release_approval_evidence",
  "final_product_log_boundary",
  "operator_wording",
  "task_evidence",
]

export function evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites(
  input: YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesInput,
): YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesProjection {
  const readiness = new Map<YeonjangBrowserActiveTabInfoLiveEnablePrerequisiteId, boolean>([
    ["production_exposure_audit", input.productionExposureAuditPassed],
    ["manual_review_record", input.manualReviewRecordAccepted],
    ["runtime_transition_state_machine", input.runtimeTransitionReady],
    ["release_approval_evidence", input.releaseApprovalEvidenceValid],
    ["final_product_log_boundary", input.finalProductLogBoundaryReady],
    ["operator_wording", input.operatorWordingReady],
    ["task_evidence", input.taskEvidenceReady],
  ])
  const missingPrerequisites = REQUIRED_PREREQUISITES.filter(
    (prerequisiteId) => !readiness.get(prerequisiteId),
  )

  return Object.freeze({
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-prerequisites.v1",
    method: "browser.active_tab_info",
    status: missingPrerequisites.length === 0 ? "ready_for_explicit_enable_task" : "blocked",
    missingPrerequisites: [...missingPrerequisites],
    blockingReasonCodes: missingPrerequisites.map(
      (prerequisiteId) => `live_enable_prerequisite_missing:${prerequisiteId}`,
    ),
    requiredPrerequisites: [...REQUIRED_PREREQUISITES],
    explicitEnableTaskRequired: true,
    addRustDispatchNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}
