import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-acknowledgement-ledger.ts"

const READY_FINAL_RETAINED_ACKNOWLEDGEMENT_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_acknowledgement_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_acknowledgement_ledger_ready",
  ledger: {
    finalRetainedAcknowledgementLedgerId:
      "final-retained-acknowledgement-ledger:browser.active_tab_info:a3d",
    operatorRetainedTransferIndexAcknowledgementReceiptId:
      "operator-retained-transfer-index-acknowledgement-receipt:browser.active_tab_info:2bb",
    sanitizedFinalRetainedAcknowledgementLedgerRef:
      "final-retained-acknowledgement-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedAcknowledgementRef:
      "final-retained-acknowledgement:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task360 active tab info operator final retained acknowledgement receipt", () => {
  it("builds a minimal redacted operator final retained acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt({
        finalRetainedAcknowledgementLedger:
          READY_FINAL_RETAINED_ACKNOWLEDGEMENT_LEDGER,
        sanitizedOperatorFinalRetainedAcknowledgementReceiptRef:
          "operator-final-retained-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedAcknowledgementRef:
          "operator-final-retained-acknowledgement:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_final_retained_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_retained_acknowledgement_receipt_ready",
      receipt: {
        operatorFinalRetainedAcknowledgementReceiptId:
          "operator-final-retained-acknowledgement-receipt:browser.active_tab_info:dbd",
        finalRetainedAcknowledgementLedgerId:
          "final-retained-acknowledgement-ledger:browser.active_tab_info:a3d",
        sanitizedOperatorFinalRetainedAcknowledgementReceiptRef:
          "operator-final-retained-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedAcknowledgementRef:
          "operator-final-retained-acknowledgement:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained acknowledgement ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt({
        finalRetainedAcknowledgementLedger: {
          ...READY_FINAL_RETAINED_ACKNOWLEDGEMENT_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalRetainedAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalRetainedAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_retained_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_retained_acknowledgement_receipt_ledger_not_ready",
      "operator_final_retained_acknowledgement_receipt_ref_invalid",
      "operator_final_retained_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_final_retained_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt({
        finalRetainedAcknowledgementLedger:
          READY_FINAL_RETAINED_ACKNOWLEDGEMENT_LEDGER,
        sanitizedOperatorFinalRetainedAcknowledgementReceiptRef:
          "operator-final-retained-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedAcknowledgementRef:
          "operator-final-retained-acknowledgement:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
