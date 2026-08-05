import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoOperatorCloseoutNote,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-closeout-note.ts"
import type {
  YeonjangBrowserActiveTabInfoTerminalDeliveryReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-terminal-delivery-receipt.ts"

const READY_TERMINAL_DELIVERY_RECEIPT: YeonjangBrowserActiveTabInfoTerminalDeliveryReceipt = {
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
}

describe("task282 active tab info operator closeout note", () => {
  it("builds a minimal redacted operator closeout note without release or activation readiness", () => {
    const note = buildYeonjangBrowserActiveTabInfoOperatorCloseoutNote({
      terminalDeliveryReceipt: READY_TERMINAL_DELIVERY_RECEIPT,
      sanitizedUserAcknowledgementRef: "user-ack:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      sanitizedOperatorCloseoutNoteRef: "operator-closeout-note:active-tab-info:sanitized:001",
    })

    expect(note).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-closeout-note.v1",
      method: "browser.active_tab_info",
      status: "operator_closeout_note_ready",
      reasonCode: "active_tab_info_operator_closeout_note_ready",
      note: {
        operatorCloseoutNoteId: "operator-closeout-note:browser.active_tab_info:54c",
        terminalDeliveryReceiptId: "terminal-delivery-receipt:browser.active_tab_info:59c",
        sanitizedUserAcknowledgementRef: "user-ack:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        sanitizedOperatorCloseoutNoteRef: "operator-closeout-note:active-tab-info:sanitized:001",
        closeoutStatus: "closed",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready terminal delivery receipts and unsafe refs", () => {
    const note = buildYeonjangBrowserActiveTabInfoOperatorCloseoutNote({
      terminalDeliveryReceipt: {
        ...READY_TERMINAL_DELIVERY_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedUserAcknowledgementRef: "https://example.test/user?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      sanitizedOperatorCloseoutNoteRef: "",
    })

    expect(note.status).toBe("blocked")
    expect(note.reasonCode).toBe("active_tab_info_operator_closeout_note_blocked")
    expect(note.blockingReasonCodes).toEqual([
      "operator_closeout_terminal_delivery_receipt_not_ready",
      "operator_closeout_user_ack_ref_invalid",
      "operator_closeout_product_log_evidence_ref_invalid",
      "operator_closeout_note_ref_invalid",
    ])
    expect(note.note).toBeUndefined()
  })

  it("does not expose raw response body, raw browser data, or downstream activation ids", () => {
    const note = buildYeonjangBrowserActiveTabInfoOperatorCloseoutNote({
      terminalDeliveryReceipt: READY_TERMINAL_DELIVERY_RECEIPT,
      sanitizedUserAcknowledgementRef: "user-ack:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      sanitizedOperatorCloseoutNoteRef: "operator-closeout-note:active-tab-info:sanitized:001",
    })

    expect(JSON.stringify(note)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
