import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-seal-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-seal-closeout-ledger.ts"

const READY_OPERATOR_RETAINED_SEAL_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-retained-seal-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_retained_seal_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_retained_seal_acknowledgement_receipt_ready",
  receipt: {
    operatorRetainedSealAcknowledgementReceiptId:
      "operator-retained-seal-acknowledgement-receipt:browser.active_tab_info:53e",
    finalRetainedLedgerAcknowledgementSealId:
      "final-retained-ledger-acknowledgement-seal:browser.active_tab_info:170",
    sanitizedOperatorRetainedSealAcknowledgementReceiptRef:
      "operator-retained-seal-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetainedSealAcknowledgementRef:
      "operator-retained-seal:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task374 active tab info final retained seal closeout ledger", () => {
  it("builds a minimal redacted final retained seal closeout ledger without release or activation readiness", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger({
        operatorRetainedSealAcknowledgementReceipt:
          READY_OPERATOR_RETAINED_SEAL_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedSealCloseoutLedgerRef:
          "final-retained-seal-closeout-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedSealCloseoutAcknowledgementRef:
          "final-retained-seal-closeout:active-tab-info:ack:001",
      })

    expect(ledger).toEqual({
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
    })
  })

  it("blocks unready operator retained seal acknowledgement receipt and unsafe refs", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger({
        operatorRetainedSealAcknowledgementReceipt: {
          ...READY_OPERATOR_RETAINED_SEAL_ACKNOWLEDGEMENT_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedSealCloseoutLedgerRef:
          "https://example.test/ledger?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedSealCloseoutAcknowledgementRef: "",
      })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_seal_closeout_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_seal_closeout_ledger_receipt_not_ready",
      "final_retained_seal_closeout_ledger_ref_invalid",
      "final_retained_seal_closeout_ledger_product_log_evidence_ref_invalid",
      "final_retained_seal_closeout_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedSealCloseoutLedger({
        operatorRetainedSealAcknowledgementReceipt:
          READY_OPERATOR_RETAINED_SEAL_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedSealCloseoutLedgerRef:
          "final-retained-seal-closeout-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedSealCloseoutAcknowledgementRef:
          "final-retained-seal-closeout:active-tab-info:ack:001",
      })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
