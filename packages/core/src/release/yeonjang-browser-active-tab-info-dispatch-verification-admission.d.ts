import type { YeonjangBrowserActiveTabInfoDispatchExecutionReceipt } from "./yeonjang-browser-active-tab-info-dispatch-execution-receipt.js";
export type YeonjangBrowserActiveTabInfoDispatchVerificationAdmissionBlockingReasonCode = "dispatch_verification_admission_execution_receipt_not_ready" | "dispatch_verification_admission_observation_ref_invalid" | "dispatch_verification_admission_llm_decision_not_verified" | "dispatch_verification_admission_llm_summary_ref_invalid" | "dispatch_verification_admission_checklist_not_passed";
export interface YeonjangBrowserActiveTabInfoDispatchVerificationAdmissionInput {
    dispatchExecutionReceipt: YeonjangBrowserActiveTabInfoDispatchExecutionReceipt;
    redactedRuntimeObservationRef: string;
    llmVerificationDecision: "verified" | "unverifiable" | "failed";
    llmDecisionSummaryRef: string;
    verificationChecklistStatus: "passed" | "failed";
}
export type YeonjangBrowserActiveTabInfoDispatchVerificationAdmission = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-dispatch-verification-admission.v1";
    method: "browser.active_tab_info";
    status: "verification_admission_ready" | "blocked";
    reasonCode: "active_tab_info_dispatch_verification_admission_ready" | "active_tab_info_dispatch_verification_admission_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoDispatchVerificationAdmissionBlockingReasonCode[];
    admission?: Readonly<{
        verificationAdmissionId: string;
        dispatchExecutionReceiptId: string;
        redactedRuntimeObservationRef: string;
        verificationChecklistStatus: "passed";
        llmDecisionSummaryRef: string;
    }>;
    admitNow: boolean;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
    markUserGoalSucceededNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoDispatchVerificationAdmission(input: YeonjangBrowserActiveTabInfoDispatchVerificationAdmissionInput): YeonjangBrowserActiveTabInfoDispatchVerificationAdmission;
//# sourceMappingURL=yeonjang-browser-active-tab-info-dispatch-verification-admission.d.ts.map