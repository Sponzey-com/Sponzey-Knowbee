import type { YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-final-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalAcknowledgementLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalAcknowledgementLedgerBlockingReasonCode = "final_acknowledgement_ledger_receipt_not_ready" | "final_acknowledgement_ledger_ref_invalid" | "final_acknowledgement_ledger_product_log_evidence_ref_invalid" | "final_acknowledgement_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalAcknowledgementLedgerInput {
    operatorFinalAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt;
    sanitizedFinalAcknowledgementLedgerRef: string;
    productLogEvidenceRef: string;
    finalAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalAcknowledgementLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-acknowledgement-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_acknowledgement_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_acknowledgement_ledger_ready" | "active_tab_info_final_acknowledgement_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalAcknowledgementLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalAcknowledgementLedgerId: string;
        operatorFinalAcknowledgementReceiptId: string;
        sanitizedFinalAcknowledgementLedgerRef: string;
        productLogEvidenceRef: string;
        finalAcknowledgementRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalAcknowledgementLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalAcknowledgementLedger(input: YeonjangBrowserActiveTabInfoFinalAcknowledgementLedgerInput): YeonjangBrowserActiveTabInfoFinalAcknowledgementLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-acknowledgement-ledger.d.ts.map