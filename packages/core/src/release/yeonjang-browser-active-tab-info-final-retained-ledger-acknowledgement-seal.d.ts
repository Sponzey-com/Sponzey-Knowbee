import type { YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt } from "./yeonjang-browser-active-tab-info-operator-retained-ledger-acknowledgement-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSealStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSealBlockingReasonCode = "final_retained_ledger_acknowledgement_seal_receipt_not_ready" | "final_retained_ledger_acknowledgement_seal_ref_invalid" | "final_retained_ledger_acknowledgement_seal_product_log_evidence_ref_invalid" | "final_retained_ledger_acknowledgement_seal_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSealInput {
    operatorRetainedLedgerAcknowledgementReceipt: YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt;
    sanitizedFinalRetainedLedgerAcknowledgementSealRef: string;
    productLogEvidenceRef: string;
    finalRetainedLedgerAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-retained-ledger-acknowledgement-seal.v1";
    method: "browser.active_tab_info";
    status: "final_retained_ledger_acknowledgement_seal_ready" | "blocked";
    reasonCode: "active_tab_info_final_retained_ledger_acknowledgement_seal_ready" | "active_tab_info_final_retained_ledger_acknowledgement_seal_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSealBlockingReasonCode[];
    seal?: Readonly<{
        finalRetainedLedgerAcknowledgementSealId: string;
        operatorRetainedLedgerAcknowledgementReceiptId: string;
        sanitizedFinalRetainedLedgerAcknowledgementSealRef: string;
        productLogEvidenceRef: string;
        finalRetainedLedgerAcknowledgementRef: string;
        sealStatus: YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSealStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal(input: YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSealInput): YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-retained-ledger-acknowledgement-seal.d.ts.map