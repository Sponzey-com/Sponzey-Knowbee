import type { YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt } from "./yeonjang-browser-active-tab-info-operator-final-sealed-archive-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerBlockingReasonCode = "final_sealed_archive_closeout_ledger_receipt_not_ready" | "final_sealed_archive_closeout_ledger_ref_invalid" | "final_sealed_archive_closeout_ledger_product_log_evidence_ref_invalid" | "final_sealed_archive_closeout_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerInput {
    operatorFinalSealedArchiveReceipt: YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt;
    sanitizedFinalSealedArchiveCloseoutLedgerRef: string;
    productLogEvidenceRef: string;
    finalSealedArchiveCloseoutAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-closeout-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_sealed_archive_closeout_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_sealed_archive_closeout_ledger_ready" | "active_tab_info_final_sealed_archive_closeout_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalSealedArchiveCloseoutLedgerId: string;
        operatorFinalSealedArchiveReceiptId: string;
        sanitizedFinalSealedArchiveCloseoutLedgerRef: string;
        productLogEvidenceRef: string;
        finalSealedArchiveCloseoutAcknowledgementRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger(input: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedgerInput): YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-sealed-archive-closeout-ledger.d.ts.map