import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-closeout-completion-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-closeout-completion-acknowledgement-receipt.ts"

const READY_FINAL_RETAINED_CLOSEOUT_COMPLETION_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-completion-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_closeout_completion_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_closeout_completion_ledger_ready",
  ledger: {
    finalRetainedCloseoutCompletionLedgerId:
      "final-retained-closeout-completion-ledger:browser.active_tab_info:bc1",
    operatorFinalRetainedCloseoutAcknowledgementReceiptId:
      "operator-final-retained-closeout-acknowledgement-receipt:browser.active_tab_info:31f",
    sanitizedFinalRetainedCloseoutCompletionLedgerRef:
      "final-retained-closeout-completion-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedCloseoutCompletionRef:
      "final-retained-closeout-completion:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task384 active tab info operator final retained closeout completion acknowledgement receipt", () => {
  it("builds a minimal redacted operator final retained closeout completion acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt({
        finalRetainedCloseoutCompletionLedger:
          READY_FINAL_RETAINED_CLOSEOUT_COMPLETION_LEDGER,
        sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef:
          "operator-final-retained-closeout-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCloseoutCompletionAcknowledgementRef:
          "operator-final-retained-closeout-completion:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-completion-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status:
        "operator_final_retained_closeout_completion_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_retained_closeout_completion_acknowledgement_receipt_ready",
      receipt: {
        operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId:
          "operator-final-retained-closeout-completion-acknowledgement-receipt:browser.active_tab_info:8ae",
        finalRetainedCloseoutCompletionLedgerId:
          "final-retained-closeout-completion-ledger:browser.active_tab_info:bc1",
        sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef:
          "operator-final-retained-closeout-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCloseoutCompletionAcknowledgementRef:
          "operator-final-retained-closeout-completion:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained closeout completion ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt({
        finalRetainedCloseoutCompletionLedger: {
          ...READY_FINAL_RETAINED_CLOSEOUT_COMPLETION_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalRetainedCloseoutCompletionAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_retained_closeout_completion_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_retained_closeout_completion_acknowledgement_receipt_ledger_not_ready",
      "operator_final_retained_closeout_completion_acknowledgement_receipt_ref_invalid",
      "operator_final_retained_closeout_completion_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_final_retained_closeout_completion_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt({
        finalRetainedCloseoutCompletionLedger:
          READY_FINAL_RETAINED_CLOSEOUT_COMPLETION_LEDGER,
        sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef:
          "operator-final-retained-closeout-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCloseoutCompletionAcknowledgementRef:
          "operator-final-retained-closeout-completion:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
