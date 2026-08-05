import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-closeout-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-closeout-acknowledgement-ledger.ts"

const READY_OPERATOR_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorRetainedCloseoutAcknowledgementReceipt = {
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
}

describe("task378 active tab info final retained closeout acknowledgement ledger", () => {
  it("builds a minimal redacted final retained closeout acknowledgement ledger without release or activation readiness", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger({
        operatorRetainedCloseoutAcknowledgementReceipt:
          READY_OPERATOR_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef:
          "final-retained-closeout-acknowledgement-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedCloseoutAcknowledgementRef:
          "final-retained-closeout:active-tab-info:ack:001",
      })

    expect(ledger).toEqual({
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
    })
  })

  it("blocks unready operator retained closeout acknowledgement receipt and unsafe refs", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger({
        operatorRetainedCloseoutAcknowledgementReceipt: {
          ...READY_OPERATOR_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef:
          "https://example.test/ledger?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedCloseoutAcknowledgementRef: "",
      })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_closeout_acknowledgement_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_closeout_acknowledgement_ledger_receipt_not_ready",
      "final_retained_closeout_acknowledgement_ledger_ref_invalid",
      "final_retained_closeout_acknowledgement_ledger_product_log_evidence_ref_invalid",
      "final_retained_closeout_acknowledgement_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger({
        operatorRetainedCloseoutAcknowledgementReceipt:
          READY_OPERATOR_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedCloseoutAcknowledgementLedgerRef:
          "final-retained-closeout-acknowledgement-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedCloseoutAcknowledgementRef:
          "final-retained-closeout:active-tab-info:ack:001",
      })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
