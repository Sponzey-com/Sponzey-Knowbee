import type { YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-retained-closeout-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedgerBlockingReasonCode = "final_retained_closeout_acknowledgement_ledger_receipt_not_ready" | "final_retained_closeout_acknowledgement_ledger_ref_invalid" | "final_retained_closeout_acknowledgement_ledger_product_log_evidence_ref_invalid" | "final_retained_closeout_acknowledgement_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedgerInput {
    operatorRetainedCloseoutAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt;
    sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedCloseoutAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-acknowledgement-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_closeout_acknowledgement_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_closeout_acknowledgement_ledger_ready" | "active_tab_info_final_retained_closeout_acknowledgement_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedCloseoutAcknowledgementLedgerId: string;
        operatorRetainedCloseoutAcknowledgementReceiptId: string;
        sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedCloseoutAcknowledgementRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-closeout-acknowledgement-ledger.d.ts.map