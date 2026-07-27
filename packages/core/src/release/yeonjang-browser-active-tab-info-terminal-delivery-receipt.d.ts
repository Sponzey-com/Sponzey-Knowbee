import type { YeonjangBrowserActiveTabInfoTerminalReportProjection } from "./yeonjang-browser-active-tab-info-terminal-report-projection.js";
export type YeonjangBrowserActiveTabInfoTerminalDeliveryStatus = "delivered";
export type YeonjangBrowserActiveTabInfoTerminalDeliveryReceiptBlockingReasonCode = "terminal_delivery_report_projection_not_ready" | "terminal_delivery_output_channel_ack_ref_invalid" | "terminal_delivery_product_log_evidence_ref_invalid" | "terminal_delivery_event_ref_invalid";
export interface YeonjangBrowserActiveTabInfoTerminalDeliveryReceiptInput {
    terminalReportProjection: YeonjangBrowserActiveTabInfoTerminalReportProjection;
    terminalOutputChannelAcknowledgementRef: string;
    productLogEvidenceRef: string;
    sanitizedTerminalDeliveryEventRef: string;
}
export type YeonjangBrowserActiveTabInfoTerminalDeliveryReceipt = Readonly<{
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-terminal-delivery-receipt.v1";
    method: "browser.active_tab_info";
    status: "terminal_delivery_receipt_ready" | "blocked";
    reasonCode: "active_tab_info_terminal_delivery_receipt_ready" | "active_tab_info_terminal_delivery_receipt_blocked";
    blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoTerminalDeliveryReceiptBlockingReasonCode[];
    receipt?: Readonly<{
        terminalDeliveryReceiptId: string;
        terminalReportProjectionId: string;
        terminalOutputChannelAcknowledgementRef: string;
        productLogEvidenceRef: string;
        sanitizedTerminalDeliveryEventRef: string;
        deliveryStatus: YeonjangBrowserActiveTabInfoTerminalDeliveryStatus;
    }>;
    releaseReadinessNow: false;
    publicationReadinessNow: false;
    enableSkillMappingNow: false;
    addProductionBindingNow: false;
    enableDefaultLiveSmokeNow: false;
}>;
export declare function buildYeonjangBrowserActiveTabInfoTerminalDeliveryReceipt(input: YeonjangBrowserActiveTabInfoTerminalDeliveryReceiptInput): YeonjangBrowserActiveTabInfoTerminalDeliveryReceipt;
//# sourceMappingURL=yeonjang-browser-active-tab-info-terminal-delivery-receipt.d.ts.map