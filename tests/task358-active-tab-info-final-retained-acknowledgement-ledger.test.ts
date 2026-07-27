import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-acknowledgement-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt.ts"

const READY_OPERATOR_RETAINED_TRANSFER_INDEX_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status:
    "operator_retained_transfer_index_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_retained_transfer_index_acknowledgement_receipt_ready",
  receipt: {
    operatorRetainedTransferIndexAcknowledgementReceiptId:
      "operator-retained-transfer-index-acknowledgement-receipt:browser.active_tab_info:2bb",
    finalRetainedTransferIndexId:
      "final-retained-transfer-index:browser.active_tab_info:944",
    sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef:
      "operator-retained-transfer-index-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorRetainedTransferAcknowledgementRef:
      "operator-retained-transfer:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task358 active tab info final retained acknowledgement ledger", () => {
  it("builds a minimal redacted final retained acknowledgement ledger without release or activation readiness", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger({
        operatorRetainedTransferIndexAcknowledgementReceipt:
          READY_OPERATOR_RETAINED_TRANSFER_INDEX_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedAcknowledgementLedgerRef:
          "final-retained-acknowledgement-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedAcknowledgementRef:
          "final-retained-acknowledgement:active-tab-info:ack:001",
      })

    expect(ledger).toEqual({
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
    })
  })

  it("blocks unready operator retained transfer index acknowledgement receipt and unsafe refs", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger({
        operatorRetainedTransferIndexAcknowledgementReceipt: {
          ...READY_OPERATOR_RETAINED_TRANSFER_INDEX_ACKNOWLEDGEMENT_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedAcknowledgementLedgerRef:
          "https://example.test/ledger?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedAcknowledgementRef: "",
      })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_acknowledgement_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_acknowledgement_ledger_receipt_not_ready",
      "final_retained_acknowledgement_ledger_ref_invalid",
      "final_retained_acknowledgement_ledger_product_log_evidence_ref_invalid",
      "final_retained_acknowledgement_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger({
        operatorRetainedTransferIndexAcknowledgementReceipt:
          READY_OPERATOR_RETAINED_TRANSFER_INDEX_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedAcknowledgementLedgerRef:
          "final-retained-acknowledgement-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedAcknowledgementRef:
          "final-retained-acknowledgement:active-tab-info:ack:001",
      })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
