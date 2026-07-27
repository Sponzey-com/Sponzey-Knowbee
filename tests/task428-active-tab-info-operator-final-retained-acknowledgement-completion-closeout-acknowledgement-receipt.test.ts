import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt.ts"

const READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutLedger = {
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
}

describe("task428 active tab info operator final retained acknowledgement completion closeout acknowledgement receipt", () => {
  it("builds a minimal redacted operator final retained acknowledgement completion closeout acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt({
        finalRetainedAcknowledgementCompletionCloseoutLedger:
          READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_LEDGER,
        sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptRef:
          "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef:
          "operator-final-retained-acknowledgement-completion-closeout-acknowledgement:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status:
        "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ready",
      receipt: {
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId:
          "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt:browser.active_tab_info:4d7",
        finalRetainedAcknowledgementCompletionCloseoutLedgerId:
          "final-retained-acknowledgement-completion-closeout-ledger:browser.active_tab_info:bcd",
        sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptRef:
          "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef:
          "operator-final-retained-acknowledgement-completion-closeout-acknowledgement:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained acknowledgement completion closeout ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt({
        finalRetainedAcknowledgementCompletionCloseoutLedger: {
          ...READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef:
          "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ledger_not_ready",
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ref_invalid",
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt({
        finalRetainedAcknowledgementCompletionCloseoutLedger:
          READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_LEDGER,
        sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptRef:
          "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef:
          "operator-final-retained-acknowledgement-completion-closeout-acknowledgement:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
