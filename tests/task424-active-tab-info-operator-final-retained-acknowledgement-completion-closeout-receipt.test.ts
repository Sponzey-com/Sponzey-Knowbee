import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-receipt.ts"

const READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_acknowledgement_completion_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_acknowledgement_completion_ledger_ready",
  ledger: {
    finalRetainedAcknowledgementCompletionLedgerId:
      "final-retained-acknowledgement-completion-ledger:browser.active_tab_info:799",
    operatorFinalRetainedAcknowledgementCompletionReceiptId:
      "operator-final-retained-acknowledgement-completion-receipt:browser.active_tab_info:d21",
    sanitizedFinalRetainedAcknowledgementCompletionLedgerRef:
      "final-retained-acknowledgement-completion-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedAcknowledgementCompletionRef:
      "final-retained-acknowledgement-completion:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task424 active tab info operator final retained acknowledgement completion closeout receipt", () => {
  it("builds a minimal redacted operator final retained acknowledgement completion closeout receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt({
        finalRetainedAcknowledgementCompletionLedger:
          READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_LEDGER,
        sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef:
          "operator-final-retained-acknowledgement-completion-closeout-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedAcknowledgementCompletionCloseoutRef:
          "operator-final-retained-acknowledgement-completion-closeout:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
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
    })
  })

  it("blocks unready final retained acknowledgement completion ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt({
        finalRetainedAcknowledgementCompletionLedger: {
          ...READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalRetainedAcknowledgementCompletionCloseoutRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_retained_acknowledgement_completion_closeout_receipt_ledger_not_ready",
      "operator_final_retained_acknowledgement_completion_closeout_receipt_ref_invalid",
      "operator_final_retained_acknowledgement_completion_closeout_receipt_product_log_evidence_ref_invalid",
      "operator_final_retained_acknowledgement_completion_closeout_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt({
        finalRetainedAcknowledgementCompletionLedger:
          READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_LEDGER,
        sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef:
          "operator-final-retained-acknowledgement-completion-closeout-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedAcknowledgementCompletionCloseoutRef:
          "operator-final-retained-acknowledgement-completion-closeout:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
