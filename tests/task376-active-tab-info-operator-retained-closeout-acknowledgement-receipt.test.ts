import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-seal-closeout-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-closeout-acknowledgement-receipt.ts"

const READY_FINAL_RETAINED_SEAL_CLOSEOUT_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-seal-closeout-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_seal_closeout_ledger_ready",
  reasonCode: "active_tab_info_final_retained_seal_closeout_ledger_ready",
  ledger: {
    finalRetainedSealCloseoutLedgerId:
      "final-retained-seal-closeout-ledger:browser.active_tab_info:5c3",
    operatorRetainedSealAcknowledgementReceiptId:
      "operator-retained-seal-acknowledgement-receipt:browser.active_tab_info:53e",
    sanitizedFinalRetainedSealCloseoutLedgerRef:
      "final-retained-seal-closeout-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedSealCloseoutAcknowledgementRef:
      "final-retained-seal-closeout:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task376 active tab info operator retained closeout acknowledgement receipt", () => {
  it("builds a minimal redacted operator retained closeout acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt({
        finalRetainedSealCloseoutLedger:
          READY_FINAL_RETAINED_SEAL_CLOSEOUT_LEDGER,
        sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef:
          "operator-retained-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedCloseoutAcknowledgementRef:
          "operator-retained-closeout:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-retained-closeout-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_retained_closeout_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_retained_closeout_acknowledgement_receipt_ready",
      receipt: {
        operatorRetainedCloseoutAcknowledgementReceiptId:
          "operator-retained-closeout-acknowledgement-receipt:browser.active_tab_info:d34",
        finalRetainedSealCloseoutLedgerId:
          "final-retained-seal-closeout-ledger:browser.active_tab_info:5c3",
        sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef:
          "operator-retained-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedCloseoutAcknowledgementRef:
          "operator-retained-closeout:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained seal closeout ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt({
        finalRetainedSealCloseoutLedger: {
          ...READY_FINAL_RETAINED_SEAL_CLOSEOUT_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorRetainedCloseoutAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_retained_closeout_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_retained_closeout_acknowledgement_receipt_ledger_not_ready",
      "operator_retained_closeout_acknowledgement_receipt_ref_invalid",
      "operator_retained_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_retained_closeout_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt({
        finalRetainedSealCloseoutLedger:
          READY_FINAL_RETAINED_SEAL_CLOSEOUT_LEDGER,
        sanitizedOperatorRetainedCloseoutAcknowledgementReceiptRef:
          "operator-retained-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedCloseoutAcknowledgementRef:
          "operator-retained-closeout:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
