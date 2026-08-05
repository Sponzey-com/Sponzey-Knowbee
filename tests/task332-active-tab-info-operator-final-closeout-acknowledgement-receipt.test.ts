import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-sealed-archive-closeout-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-closeout-acknowledgement-receipt.ts"

const READY_FINAL_SEALED_ARCHIVE_CLOSEOUT_LEDGER: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-closeout-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_sealed_archive_closeout_ledger_ready",
  reasonCode:
    "active_tab_info_final_sealed_archive_closeout_ledger_ready",
  ledger: {
    finalSealedArchiveCloseoutLedgerId:
      "final-sealed-archive-closeout-ledger:browser.active_tab_info:320",
    operatorFinalSealedArchiveReceiptId:
      "operator-final-sealed-archive-receipt:browser.active_tab_info:a63",
    sanitizedFinalSealedArchiveCloseoutLedgerRef:
      "final-sealed-archive-closeout-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalSealedArchiveCloseoutAcknowledgementRef:
      "final-sealed-archive-closeout:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task332 active tab info operator final closeout acknowledgement receipt", () => {
  it("builds a minimal redacted operator final closeout acknowledgement receipt without release or activation readiness", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt({
      finalSealedArchiveCloseoutLedger:
        READY_FINAL_SEALED_ARCHIVE_CLOSEOUT_LEDGER,
      sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef:
        "operator-final-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorFinalCloseoutAcknowledgementReceiptRef:
        "operator-final-closeout:active-tab-info:receipt:001",
    })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-closeout-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_final_closeout_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_closeout_acknowledgement_receipt_ready",
      receipt: {
        operatorFinalCloseoutAcknowledgementReceiptId:
          "operator-final-closeout-acknowledgement-receipt:browser.active_tab_info:21b",
        finalSealedArchiveCloseoutLedgerId:
          "final-sealed-archive-closeout-ledger:browser.active_tab_info:320",
        sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef:
          "operator-final-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalCloseoutAcknowledgementReceiptRef:
          "operator-final-closeout:active-tab-info:receipt:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final sealed archive closeout ledger and unsafe refs", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt({
      finalSealedArchiveCloseoutLedger: {
        ...READY_FINAL_SEALED_ARCHIVE_CLOSEOUT_LEDGER,
        status: "blocked",
        ledger: undefined,
      },
      sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef:
        "https://example.test/receipt?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      operatorFinalCloseoutAcknowledgementReceiptRef: "",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_closeout_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_closeout_acknowledgement_receipt_ledger_not_ready",
      "operator_final_closeout_acknowledgement_receipt_ref_invalid",
      "operator_final_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_final_closeout_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt({
      finalSealedArchiveCloseoutLedger:
        READY_FINAL_SEALED_ARCHIVE_CLOSEOUT_LEDGER,
      sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef:
        "operator-final-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorFinalCloseoutAcknowledgementReceiptRef:
        "operator-final-closeout:active-tab-info:receipt:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
