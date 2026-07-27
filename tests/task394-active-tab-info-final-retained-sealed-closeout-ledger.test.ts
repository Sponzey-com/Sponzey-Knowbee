import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-closeout-sealed-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-sealed-closeout-ledger.ts"

const READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_SEALED_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutSealedAcknowledgementReceipt = {
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
}

describe("task394 active tab info final retained sealed closeout ledger", () => {
  it("builds a minimal redacted final retained sealed closeout ledger without release or activation readiness", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger({
        operatorFinalRetainedCloseoutSealedAcknowledgementReceipt:
          READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_SEALED_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedSealedCloseoutLedgerRef:
          "final-retained-sealed-closeout-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedSealedCloseoutRef:
          "final-retained-sealed-closeout:active-tab-info:ack:001",
      })

    expect(ledger).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-closeout-ledger.v1",
      method: "browser.active_tab_info",
      status: "final_retained_sealed_closeout_ledger_ready",
      reasonCode:
        "active_tab_info_final_retained_sealed_closeout_ledger_ready",
      ledger: {
        finalRetainedSealedCloseoutLedgerId:
          "final-retained-sealed-closeout-ledger:browser.active_tab_info:89c",
        operatorFinalRetainedCloseoutSealedAcknowledgementReceiptId:
          "operator-final-retained-closeout-sealed-acknowledgement-receipt:browser.active_tab_info:f25",
        sanitizedFinalRetainedSealedCloseoutLedgerRef:
          "final-retained-sealed-closeout-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedSealedCloseoutRef:
          "final-retained-sealed-closeout:active-tab-info:ack:001",
        ledgerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator final retained closeout sealed acknowledgement receipt and unsafe refs", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger({
        operatorFinalRetainedCloseoutSealedAcknowledgementReceipt: {
          ...READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_SEALED_ACKNOWLEDGEMENT_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedSealedCloseoutLedgerRef:
          "https://example.test/ledger?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedSealedCloseoutRef: "",
      })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_sealed_closeout_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_sealed_closeout_ledger_receipt_not_ready",
      "final_retained_sealed_closeout_ledger_ref_invalid",
      "final_retained_sealed_closeout_ledger_product_log_evidence_ref_invalid",
      "final_retained_sealed_closeout_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutLedger({
        operatorFinalRetainedCloseoutSealedAcknowledgementReceipt:
          READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_SEALED_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedSealedCloseoutLedgerRef:
          "final-retained-sealed-closeout-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedSealedCloseoutRef:
          "final-retained-sealed-closeout:active-tab-info:ack:001",
      })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
