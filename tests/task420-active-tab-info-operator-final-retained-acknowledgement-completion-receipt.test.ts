import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-acknowledgement-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-receipt.ts"

const READY_FINAL_ACKNOWLEDGEMENT_LEDGER: YeonjangBrowserActiveTabInfoFinalAcknowledgementLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-acknowledgement-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_acknowledgement_ledger_ready",
  reasonCode: "active_tab_info_final_acknowledgement_ledger_ready",
  ledger: {
    finalAcknowledgementLedgerId:
      "final-acknowledgement-ledger:browser.active_tab_info:828",
    operatorFinalAcknowledgementReceiptId:
      "operator-final-acknowledgement-receipt:browser.active_tab_info:fb2",
    sanitizedFinalAcknowledgementLedgerRef:
      "final-acknowledgement-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalAcknowledgementRef:
      "final-acknowledgement:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task420 active tab info operator final retained acknowledgement completion receipt", () => {
  it("builds a minimal redacted operator final retained acknowledgement completion receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt({
        finalAcknowledgementLedger: READY_FINAL_ACKNOWLEDGEMENT_LEDGER,
        sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef:
          "operator-final-retained-acknowledgement-completion-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedAcknowledgementCompletionRef:
          "operator-final-retained-acknowledgement-completion:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_final_retained_acknowledgement_completion_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_retained_acknowledgement_completion_receipt_ready",
      receipt: {
        operatorFinalRetainedAcknowledgementCompletionReceiptId:
          "operator-final-retained-acknowledgement-completion-receipt:browser.active_tab_info:d21",
        finalAcknowledgementLedgerId:
          "final-acknowledgement-ledger:browser.active_tab_info:828",
        sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef:
          "operator-final-retained-acknowledgement-completion-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedAcknowledgementCompletionRef:
          "operator-final-retained-acknowledgement-completion:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final acknowledgement ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt({
        finalAcknowledgementLedger: {
          ...READY_FINAL_ACKNOWLEDGEMENT_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalRetainedAcknowledgementCompletionRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_retained_acknowledgement_completion_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_retained_acknowledgement_completion_receipt_ledger_not_ready",
      "operator_final_retained_acknowledgement_completion_receipt_ref_invalid",
      "operator_final_retained_acknowledgement_completion_receipt_product_log_evidence_ref_invalid",
      "operator_final_retained_acknowledgement_completion_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt({
        finalAcknowledgementLedger: READY_FINAL_ACKNOWLEDGEMENT_LEDGER,
        sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef:
          "operator-final-retained-acknowledgement-completion-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedAcknowledgementCompletionRef:
          "operator-final-retained-acknowledgement-completion:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
