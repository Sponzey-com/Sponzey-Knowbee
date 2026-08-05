import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-closeout-acknowledgement-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-closeout-acknowledgement-receipt.ts"

const READY_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-acknowledgement-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_closeout_acknowledgement_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_closeout_acknowledgement_ledger_ready",
  ledger: {
    finalRetainedCloseoutAcknowledgementLedgerId:
      "final-retained-closeout-acknowledgement-ledger:browser.active_tab_info:b87",
    operatorRetainedCloseoutAcknowledgementReceiptId:
      "operator-retained-closeout-acknowledgement-receipt:browser.active_tab_info:d34",
    sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef:
      "final-retained-closeout-acknowledgement-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedCloseoutAcknowledgementRef:
      "final-retained-closeout:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task380 active tab info operator final retained closeout acknowledgement receipt", () => {
  it("builds a minimal redacted operator final retained closeout acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt({
        finalRetainedCloseoutAcknowledgementLedger:
          READY_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER,
        sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef:
          "operator-final-retained-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCloseoutAcknowledgementRef:
          "operator-final-retained-closeout:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_final_retained_closeout_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_retained_closeout_acknowledgement_receipt_ready",
      receipt: {
        operatorFinalRetainedCloseoutAcknowledgementReceiptId:
          "operator-final-retained-closeout-acknowledgement-receipt:browser.active_tab_info:31f",
        finalRetainedCloseoutAcknowledgementLedgerId:
          "final-retained-closeout-acknowledgement-ledger:browser.active_tab_info:b87",
        sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef:
          "operator-final-retained-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCloseoutAcknowledgementRef:
          "operator-final-retained-closeout:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained closeout acknowledgement ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt({
        finalRetainedCloseoutAcknowledgementLedger: {
          ...READY_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalRetainedCloseoutAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_retained_closeout_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_retained_closeout_acknowledgement_receipt_ledger_not_ready",
      "operator_final_retained_closeout_acknowledgement_receipt_ref_invalid",
      "operator_final_retained_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_final_retained_closeout_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt({
        finalRetainedCloseoutAcknowledgementLedger:
          READY_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER,
        sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef:
          "operator-final-retained-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCloseoutAcknowledgementRef:
          "operator-final-retained-closeout:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
