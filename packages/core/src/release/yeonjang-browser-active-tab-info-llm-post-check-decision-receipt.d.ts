import type { YeonjangBrowserActiveTabInfoDispatchVerificationAdmission } from "./yeonjang-browser-active-tab-info-dispatch-verification-admission.js";
export type YeonjangBrowserActiveTabInfoLlmPostCheckDecisionStatus = "satisfied" | "uncertain" | "failed";
export type YeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceiptBlockingReasonCode = "llm_post_check_decision_verification_admission_not_ready" | "llm_post_check_decision_status_invalid" | "llm_post_check_decision_evidence_refs_required" | "llm_post_check_decision_evidence_ref_unsafe" | "llm_post_check_decision_decided_at_invalid";
export interface YeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceiptInput {
    verificationAdmission: YeonjangBrowserActiveTabInfoDispatchVerificationAdmission;
    llmPostCheckDecision: YeonjangBrowserActiveTabInfoLlmPostCheckDecisionStatus;
    goalSatisfactionEvidenceRefs: readonly string[];
    decidedAt: string;
}
export type YeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-llm-post-check-decision-receipt.v1";
    method: "browser.active_tab_info";
    status: "llm_post_check_decision_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_llm_post_check_decision_receipt_ready" | "active_tab_info_llm_post_check_decision_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        llmPostCheckDecisionReceiptId: string;
        verificationAdmissionId: string;
        dispatchExecutionReceiptId: string;
        decisionStatus: YeonjangBrowserActiveTabInfoLlmPostCheckDecisionStatus;
        evidenceRefCount: number;
        decidedAt: string;
    }>;
    goalSatisfied: boolean;
    deliverFinalResponseNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
    markUserGoalSucceededNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt(input: YeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceiptInput): YeonjangBrowserActiveTabInfoLlmPostCheckDecisionReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-llm-post-check-decision-receipt.d.ts.map