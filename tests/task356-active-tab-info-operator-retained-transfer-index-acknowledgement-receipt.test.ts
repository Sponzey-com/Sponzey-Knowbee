import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedTransferIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-transfer-index.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt.ts"

const READY_FINAL_RETAINED_TRANSFER_INDEX: YeonjangBrowserActiveTabInfoFinalRetainedTransferIndex = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-transfer-index.v1",
  method: "browser.active_tab_info",
  status: "final_retained_transfer_index_ready",
  reasonCode: "active_tab_info_final_retained_transfer_index_ready",
  index: {
    finalRetainedTransferIndexId:
      "final-retained-transfer-index:browser.active_tab_info:944",
    operatorPostTransferArchiveAcknowledgementReceiptId:
      "operator-post-transfer-archive-acknowledgement-receipt:browser.active_tab_info:cf2",
    sanitizedRetainedTransferIndexRef:
      "retained-transfer-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    retentionTransferAcknowledgementRef:
      "retention-transfer:active-tab-info:ack:001",
    indexStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task356 active tab info operator retained transfer index acknowledgement receipt", () => {
  it("builds a minimal redacted operator retained transfer index acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt({
        finalRetainedTransferIndex: READY_FINAL_RETAINED_TRANSFER_INDEX,
        sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef:
          "operator-retained-transfer-index-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedTransferAcknowledgementRef:
          "operator-retained-transfer:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
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
    })
  })

  it("blocks unready final retained transfer index and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt({
        finalRetainedTransferIndex: {
          ...READY_FINAL_RETAINED_TRANSFER_INDEX,
          status: "blocked",
          index: undefined,
        },
        sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorRetainedTransferAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_retained_transfer_index_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_retained_transfer_index_acknowledgement_receipt_index_not_ready",
      "operator_retained_transfer_index_acknowledgement_receipt_ref_invalid",
      "operator_retained_transfer_index_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_retained_transfer_index_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt({
        finalRetainedTransferIndex: READY_FINAL_RETAINED_TRANSFER_INDEX,
        sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef:
          "operator-retained-transfer-index-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedTransferAcknowledgementRef:
          "operator-retained-transfer:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
