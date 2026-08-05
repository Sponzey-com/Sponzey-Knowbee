import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoTerminalDeliveryReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-terminal-delivery-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoTerminalReportProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-terminal-report-projection.ts"

const READY_TERMINAL_REPORT_PROJECTION: YeonjangBrowserActiveTabInfoTerminalReportProjection = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-terminal-report-projection.v1",
  method: "browser.active_tab_info",
  status: "terminal_report_projection_ready",
  reasonCode: "active_tab_info_terminal_report_projection_ready",
  projection: {
    terminalReportProjectionId: "terminal-report-projection:browser.active_tab_info:ab0",
    completionAuditSummaryId: "completion-audit-summary:browser.active_tab_info:19b",
    userFacingResponseAcknowledgementRef: "user-facing-response:active-tab-info:ack:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    sanitizedTerminalReportRef: "terminal-report:active-tab-info:sanitized:001",
    terminalReportStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task280 active tab info terminal delivery receipt", () => {
  it("builds a minimal redacted terminal delivery receipt without release or activation readiness", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoTerminalDeliveryReceipt({
      terminalReportProjection: READY_TERMINAL_REPORT_PROJECTION,
      terminalOutputChannelAcknowledgementRef: "terminal-output-channel:active-tab-info:ack:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      sanitizedTerminalDeliveryEventRef: "terminal-delivery-event:active-tab-info:sanitized:001",
    })

    expect(receipt).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-terminal-delivery-receipt.v1",
      method: "browser.active_tab_info",
      status: "terminal_delivery_receipt_ready",
      reasonCode: "active_tab_info_terminal_delivery_receipt_ready",
      receipt: {
        terminalDeliveryReceiptId: "terminal-delivery-receipt:browser.active_tab_info:59c",
        terminalReportProjectionId: "terminal-report-projection:browser.active_tab_info:ab0",
        terminalOutputChannelAcknowledgementRef: "terminal-output-channel:active-tab-info:ack:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        sanitizedTerminalDeliveryEventRef: "terminal-delivery-event:active-tab-info:sanitized:001",
        deliveryStatus: "delivered",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready terminal report projections and unsafe refs", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoTerminalDeliveryReceipt({
      terminalReportProjection: {
        ...READY_TERMINAL_REPORT_PROJECTION,
        status: "blocked",
        projection: undefined,
      },
      terminalOutputChannelAcknowledgementRef: "https://example.test/output?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      sanitizedTerminalDeliveryEventRef: "",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe("active_tab_info_terminal_delivery_receipt_blocked")
    expect(receipt.blockingReasonCodes).toEqual([
      "terminal_delivery_report_projection_not_ready",
      "terminal_delivery_output_channel_ack_ref_invalid",
      "terminal_delivery_product_log_evidence_ref_invalid",
      "terminal_delivery_event_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw response body, raw browser data, or downstream activation ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoTerminalDeliveryReceipt({
      terminalReportProjection: READY_TERMINAL_REPORT_PROJECTION,
      terminalOutputChannelAcknowledgementRef: "terminal-output-channel:active-tab-info:ack:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      sanitizedTerminalDeliveryEventRef: "terminal-delivery-event:active-tab-info:sanitized:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
