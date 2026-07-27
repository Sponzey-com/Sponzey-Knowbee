import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-operator-closeout-index.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-index-retention-receipt.ts"

const READY_FINAL_OPERATOR_CLOSEOUT_INDEX: YeonjangBrowserActiveTabInfoFinalOperatorCloseoutIndex = {
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
}

describe("task336 active tab info operator final index retention receipt", () => {
  it("builds a minimal redacted operator final index retention receipt without release or activation readiness", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt({
      finalOperatorCloseoutIndex:
        READY_FINAL_OPERATOR_CLOSEOUT_INDEX,
      sanitizedOperatorFinalIndexRetentionReceiptRef:
        "operator-final-index-retention-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorFinalIndexRetentionReceiptRef:
        "operator-final-index-retention:active-tab-info:receipt:001",
    })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-index-retention-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_final_index_retention_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_index_retention_receipt_ready",
      receipt: {
        operatorFinalIndexRetentionReceiptId:
          "operator-final-index-retention-receipt:browser.active_tab_info:394",
        finalOperatorCloseoutIndexId:
          "final-operator-closeout-index:browser.active_tab_info:d25",
        sanitizedOperatorFinalIndexRetentionReceiptRef:
          "operator-final-index-retention-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalIndexRetentionReceiptRef:
          "operator-final-index-retention:active-tab-info:receipt:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final operator closeout index and unsafe refs", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt({
      finalOperatorCloseoutIndex: {
        ...READY_FINAL_OPERATOR_CLOSEOUT_INDEX,
        status: "blocked",
        index: undefined,
      },
      sanitizedOperatorFinalIndexRetentionReceiptRef:
        "https://example.test/receipt?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      operatorFinalIndexRetentionReceiptRef: "",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_index_retention_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_index_retention_receipt_index_not_ready",
      "operator_final_index_retention_receipt_ref_invalid",
      "operator_final_index_retention_receipt_product_log_evidence_ref_invalid",
      "operator_final_index_retention_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt({
      finalOperatorCloseoutIndex:
        READY_FINAL_OPERATOR_CLOSEOUT_INDEX,
      sanitizedOperatorFinalIndexRetentionReceiptRef:
        "operator-final-index-retention-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorFinalIndexRetentionReceiptRef:
        "operator-final-index-retention:active-tab-info:receipt:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
