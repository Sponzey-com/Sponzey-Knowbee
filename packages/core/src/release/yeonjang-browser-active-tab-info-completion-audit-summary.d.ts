import type { YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt } from "./yeonjang-browser-active-tab-info-user-goal-closeout-receipt.js";
export type YeonjangBrowserActiveTabInfoCompletionStatus = "closed";
export type YeonjangBrowserActiveTabInfoCompletionAuditSummaryBlockingReasonCode = "completion_audit_user_goal_closeout_receipt_not_ready" | "completion_audit_final_result_projection_ref_invalid" | "completion_audit_product_log_evidence_ref_invalid" | "completion_audit_operator_completion_note_ref_invalid";
export interface YeonjangBrowserActiveTabInfoCompletionAuditSummaryInput {
    userGoalCloseoutReceipt: YeonjangBrowserActiveTabInfoUserGoalCloseoutReceipt;
    finalResultProjectionRef: string;
    productLogEvidenceRef: string;
    sanitizedOperatorCompletionNoteRef: string;
}
export type YeonjangBrowserActiveTabInfoCompletionAuditSummary = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-completion-audit-summary.v1";
    method: "browser.active_tab_info";
    status: "completion_audit_summary_ready" | "blocked";
    reasonCode: "active_tab_info_completion_audit_summary_ready" | "active_tab_info_completion_audit_summary_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoCompletionAuditSummaryBlockingReasonCode[];
    summary?: Readonly<{
        completionAuditSummaryId: string;
        userGoalCloseoutReceiptId: string;
        finalResultProjectionRef: string;
        productLogEvidenceRef: string;
        sanitizedOperatorCompletionNoteRef: string;
        completionStatus: YeonjangBrowserActiveTabInfoCompletionStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoCompletionAuditSummary(input: YeonjangBrowserActiveTabInfoCompletionAuditSummaryInput): YeonjangBrowserActiveTabInfoCompletionAuditSummary;
//# sourceMappingURL=yeonjang-browser-active-tab-info-completion-audit-summary.d.ts.map