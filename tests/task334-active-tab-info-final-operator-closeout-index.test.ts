import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-closeout-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-operator-closeout-index.ts"

const READY_OPERATOR_FINAL_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt = {
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
}

describe("task334 active tab info final operator closeout index", () => {
  it("builds a minimal redacted final operator closeout index without release or activation readiness", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex({
      operatorFinalCloseoutAcknowledgementReceipt:
        READY_OPERATOR_FINAL_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedFinalOperatorCloseoutIndexRef:
        "final-operator-closeout-index:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalOperatorCloseoutAcknowledgementRef:
        "final-operator-closeout:active-tab-info:ack:001",
    })

    expect(index).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-operator-closeout-index.v1",
      method: "browser.active_tab_info",
      status: "final_operator_closeout_index_ready",
      reasonCode:
        "active_tab_info_final_operator_closeout_index_ready",
      index: {
        finalOperatorCloseoutIndexId:
          "final-operator-closeout-index:browser.active_tab_info:d25",
        operatorFinalCloseoutAcknowledgementReceiptId:
          "operator-final-closeout-acknowledgement-receipt:browser.active_tab_info:21b",
        sanitizedFinalOperatorCloseoutIndexRef:
          "final-operator-closeout-index:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalOperatorCloseoutAcknowledgementRef:
          "final-operator-closeout:active-tab-info:ack:001",
        indexStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator final closeout acknowledgement receipt and unsafe refs", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex({
      operatorFinalCloseoutAcknowledgementReceipt: {
        ...READY_OPERATOR_FINAL_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedFinalOperatorCloseoutIndexRef:
        "https://example.test/index?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      finalOperatorCloseoutAcknowledgementRef: "",
    })

    expect(index.status).toBe("blocked")
    expect(index.reasonCode).toBe(
      "active_tab_info_final_operator_closeout_index_blocked",
    )
    expect(index.blockingReasonCodes).toEqual([
      "final_operator_closeout_index_receipt_not_ready",
      "final_operator_closeout_index_ref_invalid",
      "final_operator_closeout_index_product_log_evidence_ref_invalid",
      "final_operator_closeout_index_ack_ref_invalid",
    ])
    expect(index.index).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex({
      operatorFinalCloseoutAcknowledgementReceipt:
        READY_OPERATOR_FINAL_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedFinalOperatorCloseoutIndexRef:
        "final-operator-closeout-index:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalOperatorCloseoutAcknowledgementRef:
        "final-operator-closeout:active-tab-info:ack:001",
    })

    expect(JSON.stringify(index)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
