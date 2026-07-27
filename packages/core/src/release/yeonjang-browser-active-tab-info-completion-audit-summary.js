import { createHash } from "node:crypto";
const SAFE_FINAL_RESULT_PROJECTION_REF_PATTERN = /^final-result-projection:active-tab-info:redacted:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_OPERATOR_COMPLETION_NOTE_REF_PATTERN = /^operator-completion-note:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
function extractCloseoutReceiptId(receipt) {
    if (receipt.status !== "user_goal_closeout_receipt_ready" || receipt.receipt === undefined) {
        return undefined;
    }
    return receipt.receipt.userGoalCloseoutReceiptId;
}
function buildCompletionAuditSummaryId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.userGoalCloseoutReceiptId,
        input.finalResultProjectionRef,
        input.productLogEvidenceRef,
        input.sanitizedOperatorCompletionNoteRef,
        input.completionStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `completion-audit-summary:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-completion-audit-summary.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.summary === undefined ? {} : { summary: input.summary }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoCompletionAuditSummary(input) {
    const blockingReasonCodes = [];
    const userGoalCloseoutReceiptId = extractCloseoutReceiptId(input.userGoalCloseoutReceipt);
    if (userGoalCloseoutReceiptId === undefined) {
        blockingReasonCodes.push("completion_audit_user_goal_closeout_receipt_not_ready");
    }
    const finalResultProjectionRef = input.finalResultProjectionRef.trim();
    if (!SAFE_FINAL_RESULT_PROJECTION_REF_PATTERN.test(finalResultProjectionRef)) {
        blockingReasonCodes.push("completion_audit_final_result_projection_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("completion_audit_product_log_evidence_ref_invalid");
    }
    const sanitizedOperatorCompletionNoteRef = input.sanitizedOperatorCompletionNoteRef.trim();
    if (!SAFE_OPERATOR_COMPLETION_NOTE_REF_PATTERN.test(sanitizedOperatorCompletionNoteRef)) {
        blockingReasonCodes.push("completion_audit_operator_completion_note_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || userGoalCloseoutReceiptId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_completion_audit_summary_blocked",
            blockingReasonCodes,
        });
    }
    const completionStatus = "closed";
    return baseResult({
        status: "completion_audit_summary_ready",
        reasonCode: "active_tab_info_completion_audit_summary_ready",
        summary: Object.freeze({
            completionAuditSummaryId: buildCompletionAuditSummaryId({
                userGoalCloseoutReceiptId,
                finalResultProjectionRef,
                productLogEvidenceRef,
                sanitizedOperatorCompletionNoteRef,
                completionStatus,
            }),
            userGoalCloseoutReceiptId,
            finalResultProjectionRef,
            productLogEvidenceRef,
            sanitizedOperatorCompletionNoteRef,
            completionStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-completion-audit-summary.js.map