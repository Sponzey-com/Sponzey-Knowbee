import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-sealed-archive-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-sealed-archive-closeout-ledger.ts"

const READY_OPERATOR_FINAL_SEALED_ARCHIVE_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-sealed-archive-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_sealed_archive_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_sealed_archive_receipt_ready",
  receipt: {
    operatorFinalSealedArchiveReceiptId:
      "operator-final-sealed-archive-receipt:browser.active_tab_info:a63",
    finalSealedArchiveHandoffCompletionIndexId:
      "final-sealed-archive-handoff-completion-index:browser.active_tab_info:246",
    sanitizedOperatorFinalSealedArchiveReceiptRef:
      "operator-final-sealed-archive-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalSealedArchiveReceiptRef:
      "operator-final-sealed-archive:active-tab-info:receipt:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task330 active tab info final sealed archive closeout ledger", () => {
  it("builds a minimal redacted final sealed archive closeout ledger without release or activation readiness", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger({
      operatorFinalSealedArchiveReceipt:
        READY_OPERATOR_FINAL_SEALED_ARCHIVE_RECEIPT,
      sanitizedFinalSealedArchiveCloseoutLedgerRef:
        "final-sealed-archive-closeout-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalSealedArchiveCloseoutAcknowledgementRef:
        "final-sealed-archive-closeout:active-tab-info:ack:001",
    })

    expect(ledger).toEqual({
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
    })
  })

  it("blocks unready operator final sealed archive receipt and unsafe refs", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger({
      operatorFinalSealedArchiveReceipt: {
        ...READY_OPERATOR_FINAL_SEALED_ARCHIVE_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedFinalSealedArchiveCloseoutLedgerRef:
        "https://example.test/ledger?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      finalSealedArchiveCloseoutAcknowledgementRef: "",
    })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_sealed_archive_closeout_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_sealed_archive_closeout_ledger_receipt_not_ready",
      "final_sealed_archive_closeout_ledger_ref_invalid",
      "final_sealed_archive_closeout_ledger_product_log_evidence_ref_invalid",
      "final_sealed_archive_closeout_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger({
      operatorFinalSealedArchiveReceipt:
        READY_OPERATOR_FINAL_SEALED_ARCHIVE_RECEIPT,
      sanitizedFinalSealedArchiveCloseoutLedgerRef:
        "final-sealed-archive-closeout-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalSealedArchiveCloseoutAcknowledgementRef:
        "final-sealed-archive-closeout:active-tab-info:ack:001",
    })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
