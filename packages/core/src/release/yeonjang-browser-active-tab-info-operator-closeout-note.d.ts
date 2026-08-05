import type { YeonjangBrowserActiveTabInfoTerminalDeliveryReceipt } from "./yeonjang-browser-active-tab-info-terminal-delivery-receipt.js";
export type YeonjangBrowserActiveTabInfoOperatorCloseoutStatus = "closed";
export type YeonjangBrowserActiveTabInfoOperatorCloseoutNoteBlockingReasonCode = "operator_closeout_terminal_delivery_receipt_not_ready" | "operator_closeout_user_ack_ref_invalid" | "operator_closeout_product_log_evidence_ref_invalid" | "operator_closeout_note_ref_invalid";
export interface YeonjangBrowserActiveTabInfoOperatorCloseoutNoteInput {
    terminalDeliveryReceipt: YeonjangBrowserActiveTabInfoTerminalDeliveryReceipt;
    sanitizedUserAcknowledgementRef: string;
    productLogEvidenceRef: string;
    sanitizedOperatorCloseoutNoteRef: string;
}
export type YeonjangBrowserActiveTabInfoOperatorCloseoutNote = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-closeout-note.v1";
    method: "browser.active_tab_info";
    status: "operator_closeout_note_ready" | "blocked";
    reasonCode: "active_tab_info_operator_closeout_note_ready" | "active_tab_info_operator_closeout_note_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorCloseoutNoteBlockingReasonCode[];
    note?: Readonly<{
        operatorCloseoutNoteId: string;
        terminalDeliveryReceiptId: string;
        sanitizedUserAcknowledgementRef: string;
        productLogEvidenceRef: string;
        sanitizedOperatorCloseoutNoteRef: string;
        closeoutStatus: YeonjangBrowserActiveTabInfoOperatorCloseoutStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoOperatorCloseoutNote(input: YeonjangBrowserActiveTabInfoOperatorCloseoutNoteInput): YeonjangBrowserActiveTabInfoOperatorCloseoutNote;
//# sourceMappingURL=yeonjang-browser-active-tab-info-operator-closeout-note.d.ts.map