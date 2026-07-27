import type { YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex } from "./yeonjang-browser-active-tab-info-final-retained-completion-index.js";
export type YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptBlockingReasonCode = "operator_retained_completion_acknowledgement_receipt_index_not_ready" | "operator_retained_completion_acknowledgement_receipt_ref_invalid" | "operator_retained_completion_acknowledgement_receipt_product_log_evidence_ref_invalid" | "operator_retained_completion_acknowledgement_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptInput {
    finalRetainedCompletionIndex: YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex;
    sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef: string;
    productLogEvidenceRef: string;
    operatorRetainedCompletionAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-retained-completion-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_retained_completion_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_retained_completion_acknowledgement_receipt_ready" | "active_tab_info_operator_retained_completion_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorRetainedCompletionAcknowledgementReceiptId: string;
        finalRetainedCompletionIndexId: string;
        sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef: string;
        productLogEvidenceRef: string;
        operatorRetainedCompletionAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-retained-completion-acknowledgement-receipt.d.ts.map