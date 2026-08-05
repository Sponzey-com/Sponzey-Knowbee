export type YeonjangBrowserActiveTabInfoLiveEnablePrerequisiteId = "production_exposure_audit" | "manual_review_record" | "runtime_transition_state_machine" | "release_approval_evidence" | "final_product_log_boundary" | "operator_wording" | "task_evidence";
export interface YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesInput {
    productionExposureAuditPassed: boolean;
    manualReviewRecordAccepted: boolean;
    runtimeTransitionReady: boolean;
    releaseApprovalEvidenceValid: boolean;
    finalProductLogBoundaryReady: boolean;
    operatorWordingReady: boolean;
    taskEvidenceReady: boolean;
}
export interface YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesProjection {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-prerequisites.v1";
    method: "browser.active_tab_info";
    status: "ready_for_explicit_enable_task" | "blocked";
    missingPrerequisites: YeonjangBrowserActiveTabInfoLiveEnablePrerequisiteId[];
    blockingReasonCodes: string[];
    requiredPrerequisites: YeonjangBrowserActiveTabInfoLiveEnablePrerequisiteId[];
    explicitEnableTaskRequired: true;
    addRustDispatchNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}
export declare function evaluateYeonjangBrowserActiveTabInfoLiveEnablePrerequisites(input: YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesInput): YeonjangBrowserActiveTabInfoLiveEnablePrerequisitesProjection;
//# sourceMappingURL=yeonjang-browser-active-tab-info-live-enable-prerequisites.d.ts.map