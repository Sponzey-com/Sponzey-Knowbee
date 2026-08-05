import type { YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-retained-seal-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerBlockingReasonCode = "final_retained_seal_closeout_ledger_receipt_not_ready" | "final_retained_seal_closeout_ledger_ref_invalid" | "final_retained_seal_closeout_ledger_product_log_evidence_ref_invalid" | "final_retained_seal_closeout_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerInput {
    operatorRetainedSealAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt;
    sanitizedFinalRetainedSealCloseoutLedgerRef: string;
    productLogEvidenceRef: string;
    finalRetainedSealCloseoutAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-seal-closeout-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_retained_seal_closeout_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_seal_closeout_ledger_ready" | "active_tab_info_final_retained_seal_closeout_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalRetainedSealCloseoutLedgerId: string;
        operatorRetainedSealAcknowledgementReceiptId: string;
        sanitizedFinalRetainedSealCloseoutLedgerRef: string;
        productLogEvidenceRef: string;
        finalRetainedSealCloseoutAcknowledgementRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger(input: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedgerInput): YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-seal-closeout-ledger.d.ts.map