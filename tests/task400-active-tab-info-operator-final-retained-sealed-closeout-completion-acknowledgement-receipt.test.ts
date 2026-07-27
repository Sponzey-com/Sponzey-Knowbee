import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-sealed-closeout-acknowledgement-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-completion-acknowledgement-receipt.ts"

const READY_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-closeout-acknowledgement-ledger.v1",
  method: "browser.active_tab_info",
  status:
    "final_retained_sealed_closeout_acknowledgement_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_sealed_closeout_acknowledgement_ledger_ready",
  ledger: {
    finalRetainedSealedCloseoutAcknowledgementLedgerId:
      "final-retained-sealed-closeout-acknowledgement-ledger:browser.active_tab_info:c1f",
    operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId:
      "operator-final-retained-sealed-closeout-acknowledgement-receipt:browser.active_tab_info:76c",
    sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef:
      "final-retained-sealed-closeout-acknowledgement-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedSealedCloseoutAcknowledgementRef:
      "final-retained-sealed-closeout-acknowledgement:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task400 active tab info operator final retained sealed closeout completion acknowledgement receipt", () => {
  it("builds a minimal redacted operator final retained sealed closeout completion acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt({
        finalRetainedSealedCloseoutAcknowledgementLedger:
          READY_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER,
        sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef:
          "operator-final-retained-sealed-closeout-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef:
          "operator-final-retained-sealed-closeout-completion:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-completion-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status:
        "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ready",
      receipt: {
        operatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptId:
          "operator-final-retained-sealed-closeout-completion-acknowledgement-receipt:browser.active_tab_info:162",
        finalRetainedSealedCloseoutAcknowledgementLedgerId:
          "final-retained-sealed-closeout-acknowledgement-ledger:browser.active_tab_info:c1f",
        sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef:
          "operator-final-retained-sealed-closeout-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef:
          "operator-final-retained-sealed-closeout-completion:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained sealed closeout acknowledgement ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt({
        finalRetainedSealedCloseoutAcknowledgementLedger: {
          ...READY_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ledger_not_ready",
      "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ref_invalid",
      "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt({
        finalRetainedSealedCloseoutAcknowledgementLedger:
          READY_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER,
        sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef:
          "operator-final-retained-sealed-closeout-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef:
          "operator-final-retained-sealed-closeout-completion:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
