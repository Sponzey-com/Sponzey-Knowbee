import type { YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt } from "./yeonjang-browser-active-tab-info-operator-sealed-archive-handoff-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndexStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndexBlockingReasonCode = "final_sealed_archive_handoff_completion_index_receipt_not_ready" | "final_sealed_archive_handoff_completion_index_ref_invalid" | "final_sealed_archive_handoff_completion_index_product_log_evidence_ref_invalid" | "final_sealed_archive_handoff_completion_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndexInput {
    operatorSealedArchiveHandoffReceipt: YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt;
    sanitizedFinalSealedArchiveHandoffCompletionIndexRef: string;
    productLogEvidenceRef: string;
    finalSealedArchiveHandoffCompletionAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-handoff-completion-index.v1";
    method: "browser.active_tab_info";
    status: "final_sealed_archive_handoff_completion_index_ready" | "blocked";
    reasonCode: "active_tab_info_final_sealed_archive_handoff_completion_index_ready" | "active_tab_info_final_sealed_archive_handoff_completion_index_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndexBlockingReasonCode[];
    index?: Readonly<{
        finalSealedArchiveHandoffCompletionIndexId: string;
        operatorSealedArchiveHandoffReceiptId: string;
        sanitizedFinalSealedArchiveHandoffCompletionIndexRef: string;
        productLogEvidenceRef: string;
        finalSealedArchiveHandoffCompletionAcknowledgementRef: string;
        indexStatus: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndexStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex(input: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndexInput): YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-sealed-archive-handoff-completion-index.d.ts.map