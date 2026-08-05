import type { YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex } from "./yeonjang-browser-active-tab-info-final-archival-completion-index.js";
export type YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptBlockingReasonCode = "operator_archival_completion_acknowledgement_receipt_index_not_ready" | "operator_archival_completion_acknowledgement_ref_invalid" | "operator_archival_completion_acknowledgement_product_log_evidence_ref_invalid" | "operator_archival_completion_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptInput {
    finalArchivalCompletionIndex: YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex;
    sanitizedArchivalCompletionAcknowledgementRef: string;
    productLogEvidenceRef: string;
    operatorArchivalCompletionAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-archival-completion-acknowledgement-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_archival_completion_acknowledgement_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_archival_completion_acknowledgement_receipt_ready" | "active_tab_info_operator_archival_completion_acknowledgement_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorArchivalCompletionAcknowledgementReceiptId: string;
        finalArchivalCompletionIndexId: string;
        sanitizedArchivalCompletionAcknowledgementRef: string;
        productLogEvidenceRef: string;
        operatorArchivalCompletionAcknowledgementRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt(input: YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceiptInput): YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-archival-completion-acknowledgement-receipt.d.ts.map