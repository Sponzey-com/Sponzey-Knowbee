import type { YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndexStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndexBlockingReasonCode = "final_retained_completion_index_receipt_not_ready" | "final_retained_completion_index_ref_invalid" | "final_retained_completion_index_product_log_evidence_ref_invalid" | "final_retained_completion_index_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndexInput {
    operatorFinalRetainedAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt;
    sanitizedFinalRetainedCompletionIndexRef: string;
    productLogEvidenceRef: string;
    retainedCompletionAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-index.v1";
    method: "browser.active_tab_info";
    status: "final_retained_completion_index_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_completion_index_ready" | "active_tab_info_final_retained_completion_index_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndexBlockingReasonCode[];
    index?: Readonly<{
        finalRetainedCompletionIndexId: string;
        operatorFinalRetainedAcknowledgementReceiptId: string;
        sanitizedFinalRetainedCompletionIndexRef: string;
        productLogEvidenceRef: string;
        retainedCompletionAcknowledgementRef: string;
        indexStatus: YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndexStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex(input: YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndexInput): YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-completion-index.d.ts.map