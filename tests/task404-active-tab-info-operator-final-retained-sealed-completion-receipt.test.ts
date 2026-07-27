import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-sealed-closeout-completion-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-sealed-completion-receipt.ts"

const READY_FINAL_RETAINED_SEALED_CLOSEOUT_COMPLETION_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutCompletionLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-closeout-completion-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_sealed_closeout_completion_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_sealed_closeout_completion_ledger_ready",
  ledger: {
    finalRetainedSealedCloseoutCompletionLedgerId:
      "final-retained-sealed-closeout-completion-ledger:browser.active_tab_info:35d",
    operatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptId:
      "operator-final-retained-sealed-closeout-completion-acknowledgement-receipt:browser.active_tab_info:162",
    sanitizedFinalRetainedSealedCloseoutCompletionLedgerRef:
      "final-retained-sealed-closeout-completion-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedSealedCloseoutCompletionRef:
      "final-retained-sealed-closeout-completion:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task404 active tab info operator final retained sealed completion receipt", () => {
  it("builds a minimal redacted operator final retained sealed completion receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt({
        finalRetainedSealedCloseoutCompletionLedger:
          READY_FINAL_RETAINED_SEALED_CLOSEOUT_COMPLETION_LEDGER,
        sanitizedOperatorFinalRetainedSealedCompletionReceiptRef:
          "operator-final-retained-sealed-completion-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedSealedCompletionRef:
          "operator-final-retained-sealed-completion:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-sealed-completion-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_final_retained_sealed_completion_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_retained_sealed_completion_receipt_ready",
      receipt: {
        operatorFinalRetainedSealedCompletionReceiptId:
          "operator-final-retained-sealed-completion-receipt:browser.active_tab_info:4b2",
        finalRetainedSealedCloseoutCompletionLedgerId:
          "final-retained-sealed-closeout-completion-ledger:browser.active_tab_info:35d",
        sanitizedOperatorFinalRetainedSealedCompletionReceiptRef:
          "operator-final-retained-sealed-completion-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedSealedCompletionRef:
          "operator-final-retained-sealed-completion:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained sealed closeout completion ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt({
        finalRetainedSealedCloseoutCompletionLedger: {
          ...READY_FINAL_RETAINED_SEALED_CLOSEOUT_COMPLETION_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalRetainedSealedCompletionReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalRetainedSealedCompletionRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_retained_sealed_completion_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_retained_sealed_completion_receipt_ledger_not_ready",
      "operator_final_retained_sealed_completion_receipt_ref_invalid",
      "operator_final_retained_sealed_completion_receipt_product_log_evidence_ref_invalid",
      "operator_final_retained_sealed_completion_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt({
        finalRetainedSealedCloseoutCompletionLedger:
          READY_FINAL_RETAINED_SEALED_CLOSEOUT_COMPLETION_LEDGER,
        sanitizedOperatorFinalRetainedSealedCompletionReceiptRef:
          "operator-final-retained-sealed-completion-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedSealedCompletionRef:
          "operator-final-retained-sealed-completion:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
