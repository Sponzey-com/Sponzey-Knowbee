import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-ledger.ts"

const READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-receipt.v1",
  method: "browser.active_tab_info",
  status:
    "operator_final_retained_acknowledgement_completion_closeout_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_receipt_ready",
  receipt: {
    operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId:
      "operator-final-retained-acknowledgement-completion-closeout-receipt:browser.active_tab_info:2e9",
    finalRetainedAcknowledgementCompletionLedgerId:
      "final-retained-acknowledgement-completion-ledger:browser.active_tab_info:799",
    sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef:
      "operator-final-retained-acknowledgement-completion-closeout-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedAcknowledgementCompletionCloseoutRef:
      "operator-final-retained-acknowledgement-completion-closeout:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task426 active tab info final retained acknowledgement completion closeout ledger", () => {
  it("builds a minimal redacted final retained acknowledgement completion closeout ledger without release or activation readiness", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedger({
        operatorFinalRetainedAcknowledgementCompletionCloseoutReceipt:
          READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_RECEIPT,
        sanitizedFinalRetainedAcknowledgementCompletionCloseoutLedgerRef:
          "final-retained-acknowledgement-completion-closeout-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedAcknowledgementCompletionCloseoutRef:
          "final-retained-acknowledgement-completion-closeout:active-tab-info:ack:001",
      })

    expect(ledger).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-ledger.v1",
      method: "browser.active_tab_info",
      status: "final_retained_acknowledgement_completion_closeout_ledger_ready",
      reasonCode:
        "active_tab_info_final_retained_acknowledgement_completion_closeout_ledger_ready",
      ledger: {
        finalRetainedAcknowledgementCompletionCloseoutLedgerId:
          "final-retained-acknowledgement-completion-closeout-ledger:browser.active_tab_info:bcd",
        operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId:
          "operator-final-retained-acknowledgement-completion-closeout-receipt:browser.active_tab_info:2e9",
        sanitizedFinalRetainedAcknowledgementCompletionCloseoutLedgerRef:
          "final-retained-acknowledgement-completion-closeout-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedAcknowledgementCompletionCloseoutRef:
          "final-retained-acknowledgement-completion-closeout:active-tab-info:ack:001",
        ledgerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator final retained acknowledgement completion closeout receipt and unsafe refs", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedger({
        operatorFinalRetainedAcknowledgementCompletionCloseoutReceipt: {
          ...READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedAcknowledgementCompletionCloseoutLedgerRef:
          "https://example.test/ledger?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedAcknowledgementCompletionCloseoutRef: "",
      })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_acknowledgement_completion_closeout_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_acknowledgement_completion_closeout_ledger_receipt_not_ready",
      "final_retained_acknowledgement_completion_closeout_ledger_ref_invalid",
      "final_retained_acknowledgement_completion_closeout_ledger_product_log_evidence_ref_invalid",
      "final_retained_acknowledgement_completion_closeout_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedger({
        operatorFinalRetainedAcknowledgementCompletionCloseoutReceipt:
          READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_RECEIPT,
        sanitizedFinalRetainedAcknowledgementCompletionCloseoutLedgerRef:
          "final-retained-acknowledgement-completion-closeout-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedAcknowledgementCompletionCloseoutRef:
          "final-retained-acknowledgement-completion-closeout:active-tab-info:ack:001",
      })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
