import type { YeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal } from "./yeonjang-browser-active-tab-info-final-completion-archive-seal.js";
export type YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptStatus = "ready";
export type YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptBlockingReasonCode = "operator_sealed_completion_archive_receipt_seal_not_ready" | "operator_sealed_completion_archive_receipt_ref_invalid" | "operator_sealed_completion_archive_receipt_product_log_evidence_ref_invalid" | "operator_sealed_completion_archive_receipt_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptInput {
    finalCompletionArchiveSeal: YeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal;
    sanitizedOperatorSealedCompletionArchiveReceiptRef: string;
    productLogEvidenceRef: string;
    operatorSealedCompletionArchiveReceiptRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.v1";
    method: "browser.active_tab_info";
    status: "operator_sealed_completion_archive_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_operator_sealed_completion_archive_receipt_ready" | "active_tab_info_operator_sealed_completion_archive_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        operatorSealedCompletionArchiveReceiptId: string;
        finalCompletionArchiveSealId: string;
        sanitizedOperatorSealedCompletionArchiveReceiptRef: string;
        productLogEvidenceRef: string;
        operatorSealedCompletionArchiveReceiptRef: string;
        receiptStatus: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt(input: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceiptInput): YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.d.ts.map