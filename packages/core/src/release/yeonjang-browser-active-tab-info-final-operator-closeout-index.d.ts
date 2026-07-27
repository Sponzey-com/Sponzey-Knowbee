import type { YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-final-closeout-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexBlockingReasonCode = "final_operator_closeout_index_receipt_not_ready" | "final_operator_closeout_index_ref_invalid" | "final_operator_closeout_index_product_log_evidence_ref_invalid" | "final_operator_closeout_index_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexInput {
    operatorFinalCloseoutAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt;
    sanitizedFinalOperatorCloseoutIndexRef: string;
    productLogEvidenceRef: string;
    finalOperatorCloseoutAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-operator-closeout-index.v1";
    method: "browser.active_tab_info";
    status: "final_operator_closeout_index_ready" | "blocked";
    reasonCode: "active_tab_info_final_operator_closeout_index_ready" | "active_tab_info_final_operator_closeout_index_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexBlockingReasonCode[];
    index?: Readonly<{
        finalOperatorCloseoutIndexId: string;
        operatorFinalCloseoutAcknowledgementReceiptId: string;
        sanitizedFinalOperatorCloseoutIndexRef: string;
        productLogEvidenceRef: string;
        finalOperatorCloseoutAcknowledgementRef: string;
        indexStatus: YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex(input: YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndexInput): YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-operator-closeout-index.d.ts.map