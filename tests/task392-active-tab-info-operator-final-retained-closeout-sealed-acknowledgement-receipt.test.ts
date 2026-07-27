import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-closeout-sealed-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-closeout-sealed-acknowledgement-receipt.ts"

const READY_FINAL_RETAINED_CLOSEOUT_SEALED_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutSealedLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-sealed-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_closeout_sealed_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_closeout_sealed_ledger_ready",
  ledger: {
    finalRetainedCloseoutSealedLedgerId:
      "final-retained-closeout-sealed-ledger:browser.active_tab_info:ac0",
    operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId:
      "operator-final-retained-completion-closeout-acknowledgement-receipt:browser.active_tab_info:016",
    sanitizedFinalRetainedCloseoutSealedLedgerRef:
      "final-retained-closeout-sealed-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedCloseoutSealedRef:
      "final-retained-closeout-sealed:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task392 active tab info operator final retained closeout sealed acknowledgement receipt", () => {
  it("builds a minimal redacted operator final retained closeout sealed acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt({
        finalRetainedCloseoutSealedLedger:
          READY_FINAL_RETAINED_CLOSEOUT_SEALED_LEDGER,
        sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef:
          "operator-final-retained-closeout-sealed-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCloseoutSealedAcknowledgementRef:
          "operator-final-retained-closeout-sealed:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-sealed-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status:
        "operator_final_retained_closeout_sealed_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_retained_closeout_sealed_acknowledgement_receipt_ready",
      receipt: {
        operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId:
          "operator-final-retained-closeout-sealed-acknowledgement-receipt:browser.active_tab_info:f25",
        finalRetainedCloseoutSealedLedgerId:
          "final-retained-closeout-sealed-ledger:browser.active_tab_info:ac0",
        sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef:
          "operator-final-retained-closeout-sealed-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCloseoutSealedAcknowledgementRef:
          "operator-final-retained-closeout-sealed:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained closeout sealed ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt({
        finalRetainedCloseoutSealedLedger: {
          ...READY_FINAL_RETAINED_CLOSEOUT_SEALED_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalRetainedCloseoutSealedAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_retained_closeout_sealed_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_retained_closeout_sealed_acknowledgement_receipt_ledger_not_ready",
      "operator_final_retained_closeout_sealed_acknowledgement_receipt_ref_invalid",
      "operator_final_retained_closeout_sealed_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_final_retained_closeout_sealed_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt({
        finalRetainedCloseoutSealedLedger:
          READY_FINAL_RETAINED_CLOSEOUT_SEALED_LEDGER,
        sanitizedOperatorFinalRetainedCloseoutSealedAcknowledgementReceiptRef:
          "operator-final-retained-closeout-sealed-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCloseoutSealedAcknowledgementRef:
          "operator-final-retained-closeout-sealed:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
