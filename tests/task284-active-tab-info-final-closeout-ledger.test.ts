import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-closeout-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorCloseoutNote,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-closeout-note.ts"

const READY_OPERATOR_CLOSEOUT_NOTE: YeonjangBrowserActiveTabInfoOperatorCloseoutNote = {
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
}

describe("task284 active tab info final closeout ledger", () => {
  it("builds a minimal redacted final closeout ledger without release or activation readiness", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalCloseoutLedger({
      operatorCloseoutNote: READY_OPERATOR_CLOSEOUT_NOTE,
      completionAuditSummaryRef: "completion-audit-summary:active-tab-info:ref:001",
      terminalDeliveryReceiptRef: "terminal-delivery-receipt:active-tab-info:ref:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    })

    expect(ledger).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-closeout-ledger.v1",
      method: "browser.active_tab_info",
      status: "final_closeout_ledger_ready",
      reasonCode: "active_tab_info_final_closeout_ledger_ready",
      ledger: {
        finalCloseoutLedgerId: "final-closeout-ledger:browser.active_tab_info:0b3",
        operatorCloseoutNoteId: "operator-closeout-note:browser.active_tab_info:54c",
        completionAuditSummaryRef: "completion-audit-summary:active-tab-info:ref:001",
        terminalDeliveryReceiptRef: "terminal-delivery-receipt:active-tab-info:ref:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        ledgerStatus: "closed",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator closeout notes and unsafe refs", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalCloseoutLedger({
      operatorCloseoutNote: {
        ...READY_OPERATOR_CLOSEOUT_NOTE,
        status: "blocked",
        note: undefined,
      },
      completionAuditSummaryRef: "https://example.test/completion?token=secret",
      terminalDeliveryReceiptRef: "/Users/private/terminal-delivery.json",
      productLogEvidenceRef: "",
    })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe("active_tab_info_final_closeout_ledger_blocked")
    expect(ledger.blockingReasonCodes).toEqual([
      "final_closeout_operator_note_not_ready",
      "final_closeout_completion_audit_summary_ref_invalid",
      "final_closeout_terminal_delivery_receipt_ref_invalid",
      "final_closeout_product_log_evidence_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw response body, raw browser data, or downstream activation ids", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalCloseoutLedger({
      operatorCloseoutNote: READY_OPERATOR_CLOSEOUT_NOTE,
      completionAuditSummaryRef: "completion-audit-summary:active-tab-info:ref:001",
      terminalDeliveryReceiptRef: "terminal-delivery-receipt:active-tab-info:ref:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
