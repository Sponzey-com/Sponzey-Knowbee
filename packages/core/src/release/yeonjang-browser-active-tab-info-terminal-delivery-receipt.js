import { createHash } from "node:crypto";
const SAFE_TERMINAL_OUTPUT_CHANNEL_ACK_REF_PATTERN = /^terminal-output-channel:active-tab-info:ack:[a-z0-9._:-]+$/u;
const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN = /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u;
const SAFE_TERMINAL_DELIVERY_EVENT_REF_PATTERN = /^terminal-delivery-event:active-tab-info:sanitized:[a-z0-9._:-]+$/u;
function extractTerminalReportProjectionId(projection) {
    if (projection.status !== "terminal_report_projection_ready" || projection.projection === undefined) {
        return undefined;
    }
    return projection.projection.terminalReportProjectionId;
}
function buildTerminalDeliveryReceiptId(input) {
    const hash = createHash("sha256");
    for (const value of [
        input.terminalReportProjectionId,
        input.terminalOutputChannelAcknowledgementRef,
        input.productLogEvidenceRef,
        input.sanitizedTerminalDeliveryEventRef,
        input.deliveryStatus,
    ]) {
        hash.update(value);
        hash.update("\n");
    }
    return `terminal-delivery-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`;
}
function baseResult(input) {
    return Object.freeze({
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-terminal-delivery-receipt.v1",
        method: "browser.active_tab_info",
        status: input.status,
        reasonCode: input.reasonCode,
        ...(input.blockingReasonCodes === undefined
            ? {}
            : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
        ...(input.receipt === undefined ? {} : { receipt: input.receipt }),
        releaseReadinessNow: false,
        publicationReadinessNow: false,
        enableSkillMappingNow: false,
        addProductionBindingNow: false,
        enableDefaultLiveSmokeNow: false,
    });
}
export function buildYeonjangBrowserActiveTabInfoTerminalDeliveryReceipt(input) {
    const blockingReasonCodes = [];
    const terminalReportProjectionId = extractTerminalReportProjectionId(input.terminalReportProjection);
    if (terminalReportProjectionId === undefined) {
        blockingReasonCodes.push("terminal_delivery_report_projection_not_ready");
    }
    const terminalOutputChannelAcknowledgementRef = input.terminalOutputChannelAcknowledgementRef.trim();
    if (!SAFE_TERMINAL_OUTPUT_CHANNEL_ACK_REF_PATTERN.test(terminalOutputChannelAcknowledgementRef)) {
        blockingReasonCodes.push("terminal_delivery_output_channel_ack_ref_invalid");
    }
    const productLogEvidenceRef = input.productLogEvidenceRef.trim();
    if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
        blockingReasonCodes.push("terminal_delivery_product_log_evidence_ref_invalid");
    }
    const sanitizedTerminalDeliveryEventRef = input.sanitizedTerminalDeliveryEventRef.trim();
    if (!SAFE_TERMINAL_DELIVERY_EVENT_REF_PATTERN.test(sanitizedTerminalDeliveryEventRef)) {
        blockingReasonCodes.push("terminal_delivery_event_ref_invalid");
    }
    if (blockingReasonCodes.length > 0 || terminalReportProjectionId === undefined) {
        return baseResult({
            status: "blocked",
            reasonCode: "active_tab_info_terminal_delivery_receipt_blocked",
            blockingReasonCodes,
        });
    }
    const deliveryStatus = "delivered";
    return baseResult({
        status: "terminal_delivery_receipt_ready",
        reasonCode: "active_tab_info_terminal_delivery_receipt_ready",
        receipt: Object.freeze({
            terminalDeliveryReceiptId: buildTerminalDeliveryReceiptId({
                terminalReportProjectionId,
                terminalOutputChannelAcknowledgementRef,
                productLogEvidenceRef,
                sanitizedTerminalDeliveryEventRef,
                deliveryStatus,
            }),
            terminalReportProjectionId,
            terminalOutputChannelAcknowledgementRef,
            productLogEvidenceRef,
            sanitizedTerminalDeliveryEventRef,
            deliveryStatus,
        }),
    });
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-terminal-delivery-receipt.js.map