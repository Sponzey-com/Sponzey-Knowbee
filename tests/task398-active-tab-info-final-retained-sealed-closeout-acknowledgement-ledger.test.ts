import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-sealed-closeout-acknowledgement-ledger.ts"

const READY_OPERATOR_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status:
    "operator_final_retained_sealed_closeout_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_retained_sealed_closeout_acknowledgement_receipt_ready",
  receipt: {
    operatorFinalRetainedSealedCloseoutAcknowledgementReceiptId:
      "operator-final-retained-sealed-closeout-acknowledgement-receipt:browser.active_tab_info:76c",
    finalRetainedSealedCloseoutLedgerId:
      "final-retained-sealed-closeout-ledger:browser.active_tab_info:89c",
    sanitizedOperatorFinalRetainedSealedCloseoutAcknowledgementReceiptRef:
      "operator-final-retained-sealed-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedSealedCloseoutAcknowledgementRef:
      "operator-final-retained-sealed-closeout:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task398 active tab info final retained sealed closeout acknowledgement ledger", () => {
  it("builds a minimal redacted final retained sealed closeout acknowledgement ledger without release or activation readiness", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger({
        operatorFinalRetainedSealedCloseoutAcknowledgementReceipt:
          READY_OPERATOR_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef:
          "final-retained-sealed-closeout-acknowledgement-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedSealedCloseoutAcknowledgementRef:
          "final-retained-sealed-closeout-acknowledgement:active-tab-info:ack:001",
      })

    expect(ledger).toEqual({
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
    })
  })

  it("blocks unready operator final retained sealed closeout acknowledgement receipt and unsafe refs", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger({
        operatorFinalRetainedSealedCloseoutAcknowledgementReceipt: {
          ...READY_OPERATOR_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef:
          "https://example.test/ledger?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedSealedCloseoutAcknowledgementRef: "",
      })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_sealed_closeout_acknowledgement_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_sealed_closeout_acknowledgement_ledger_receipt_not_ready",
      "final_retained_sealed_closeout_acknowledgement_ledger_ref_invalid",
      "final_retained_sealed_closeout_acknowledgement_ledger_product_log_evidence_ref_invalid",
      "final_retained_sealed_closeout_acknowledgement_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger({
        operatorFinalRetainedSealedCloseoutAcknowledgementReceipt:
          READY_OPERATOR_FINAL_RETAINED_SEALED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedSealedCloseoutAcknowledgementLedgerRef:
          "final-retained-sealed-closeout-acknowledgement-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedSealedCloseoutAcknowledgementRef:
          "final-retained-sealed-closeout-acknowledgement:active-tab-info:ack:001",
      })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
