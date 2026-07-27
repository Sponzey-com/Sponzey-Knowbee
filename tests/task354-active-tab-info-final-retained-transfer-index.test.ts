import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedTransferIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-transfer-index.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-post-transfer-archive-acknowledgement-receipt.ts"

const READY_OPERATOR_POST_TRANSFER_ARCHIVE_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-post-transfer-archive-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_post_transfer_archive_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_post_transfer_archive_acknowledgement_receipt_ready",
  receipt: {
    operatorPostTransferArchiveAcknowledgementReceiptId:
      "operator-post-transfer-archive-acknowledgement-receipt:browser.active_tab_info:cf2",
    finalPostTransferArchivePointerId:
      "final-post-transfer-archive-pointer:browser.active_tab_info:5df",
    sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef:
      "operator-post-transfer-archive-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorPostTransferArchiveAcknowledgementRef:
      "operator-post-transfer-archive:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task354 active tab info final retained transfer index", () => {
  it("builds a minimal redacted final retained transfer index without release or activation readiness", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalRetainedTransferIndex({
      operatorPostTransferArchiveAcknowledgementReceipt:
        READY_OPERATOR_POST_TRANSFER_ARCHIVE_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedRetainedTransferIndexRef:
        "retained-transfer-index:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      retentionTransferAcknowledgementRef:
        "retention-transfer:active-tab-info:ack:001",
    })

    expect(index).toEqual({
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
    })
  })

  it("blocks unready operator post-transfer archive acknowledgement receipt and unsafe refs", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalRetainedTransferIndex({
      operatorPostTransferArchiveAcknowledgementReceipt: {
        ...READY_OPERATOR_POST_TRANSFER_ARCHIVE_ACKNOWLEDGEMENT_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedRetainedTransferIndexRef:
        "https://example.test/index?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      retentionTransferAcknowledgementRef: "",
    })

    expect(index.status).toBe("blocked")
    expect(index.reasonCode).toBe(
      "active_tab_info_final_retained_transfer_index_blocked",
    )
    expect(index.blockingReasonCodes).toEqual([
      "final_retained_transfer_index_receipt_not_ready",
      "final_retained_transfer_index_ref_invalid",
      "final_retained_transfer_index_product_log_evidence_ref_invalid",
      "final_retained_transfer_index_ack_ref_invalid",
    ])
    expect(index.index).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalRetainedTransferIndex({
      operatorPostTransferArchiveAcknowledgementReceipt:
        READY_OPERATOR_POST_TRANSFER_ARCHIVE_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedRetainedTransferIndexRef:
        "retained-transfer-index:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      retentionTransferAcknowledgementRef:
        "retention-transfer:active-tab-info:ack:001",
    })

    expect(JSON.stringify(index)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
