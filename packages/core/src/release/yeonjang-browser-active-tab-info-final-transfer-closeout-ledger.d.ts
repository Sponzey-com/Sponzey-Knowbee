import type { YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt } from "./yeonjang-browser-active-tab-info-operator-final-handoff-receipt.js";
export type YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedgerStatus = "ready";
export type YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedgerBlockingReasonCode = "final_transfer_closeout_ledger_receipt_not_ready" | "final_transfer_closeout_ledger_ref_invalid" | "final_transfer_closeout_ledger_product_log_evidence_ref_invalid" | "final_transfer_closeout_ledger_ack_ref_invalid";
export interface YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedgerInput {
    operatorFinalHandoffReceipt: YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt;
    sanitizedFinalTransferCloseoutLedgerRef: string;
    productLogEvidenceRef: string;
    finalTransferCloseoutAcknowledgementRef: string;
}
export type YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-transfer-closeout-ledger.v1";
    method: "browser.active_tab_info";
    status: "final_transfer_closeout_ledger_ready" | "blocked";
    reasonCode: "active_tab_info_final_transfer_closeout_ledger_ready" | "active_tab_info_final_transfer_closeout_ledger_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedgerBlockingReasonCode[];
    ledger?: Readonly<{
        finalTransferCloseoutLedgerId: string;
        operatorFinalHandoffReceiptId: string;
        sanitizedFinalTransferCloseoutLedgerRef: string;
        productLogEvidenceRef: string;
        finalTransferCloseoutAcknowledgementRef: string;
        ledgerStatus: YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedgerStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger(input: YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedgerInput): YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger;
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-transfer-closeout-ledger.d.ts.map