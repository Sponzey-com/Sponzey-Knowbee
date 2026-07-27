import type { YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex } from "./yeonjang-browser-active-tab-info-final-sealed-archive-handoff-completion-index.js";
export type YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceiptBlockingReasonCode = "operator_final_sealed_archive_receipt_index_not_ready" | "operator_final_sealed_archive_receipt_ref_invalid" | "operator_final_sealed_archive_receipt_product_log_evidence_ref_invalid" | "operator_final_sealed_archive_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceiptInput {
    finalSealedArchiveHandoffCompletionIndex: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex;
    sanitizedOperatorFinalSealedArchiveReceiptRef: string;
    productLogEvidenceRef: string;
    operatorFinalSealedArchiveReceiptRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-sealed-archive-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_final_sealed_archive_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_final_sealed_archive_receipt_ready" | "active_tab_info_operator_final_sealed_archive_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorFinalSealedArchiveReceiptId: string;
        finalSealedArchiveHandoffCompletionIndexId: string;
        sanitizedOperatorFinalSealedArchiveReceiptRef: string;
        productLogEvidenceRef: string;
        operatorFinalSealedArchiveReceiptRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt(input: YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceiptInput): YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-final-sealed-archive-receipt.d.ts.map