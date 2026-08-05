import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-post-transfer-archive-pointer.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-post-transfer-archive-acknowledgement-receipt.ts"

const READY_FINAL_POST_TRANSFER_ARCHIVE_POINTER: YeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-post-transfer-archive-pointer.v1",
  method: "browser.active_tab_info",
  status: "final_post_transfer_archive_pointer_ready",
  reasonCode:
    "active_tab_info_final_post_transfer_archive_pointer_ready",
  pointer: {
    finalPostTransferArchivePointerId:
      "final-post-transfer-archive-pointer:browser.active_tab_info:5df",
    operatorFinalTransferAcknowledgementReceiptId:
      "operator-final-transfer-acknowledgement-receipt:browser.active_tab_info:b20",
    sanitizedPostTransferArchivePointerRef:
      "post-transfer-archive-pointer:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    archiveTransferAcknowledgementRef:
      "archive-transfer:active-tab-info:ack:001",
    pointerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task352 active tab info operator post-transfer archive acknowledgement receipt", () => {
  it("builds a minimal redacted operator post-transfer archive acknowledgement receipt without release or activation readiness", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt({
      finalPostTransferArchivePointer:
        READY_FINAL_POST_TRANSFER_ARCHIVE_POINTER,
      sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef:
        "operator-post-transfer-archive-acknowledgement-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorPostTransferArchiveAcknowledgementRef:
        "operator-post-transfer-archive:active-tab-info:ack:001",
    })

    expect(receipt).toEqual({
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
    })
  })

  it("blocks unready final post-transfer archive pointer and unsafe refs", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt({
      finalPostTransferArchivePointer: {
        ...READY_FINAL_POST_TRANSFER_ARCHIVE_POINTER,
        status: "blocked",
        pointer: undefined,
      },
      sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef:
        "https://example.test/receipt?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      operatorPostTransferArchiveAcknowledgementRef: "",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_post_transfer_archive_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_post_transfer_archive_acknowledgement_receipt_pointer_not_ready",
      "operator_post_transfer_archive_acknowledgement_receipt_ref_invalid",
      "operator_post_transfer_archive_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_post_transfer_archive_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorPostTransferArchiveAcknowledgementReceipt({
      finalPostTransferArchivePointer:
        READY_FINAL_POST_TRANSFER_ARCHIVE_POINTER,
      sanitizedOperatorPostTransferArchiveAcknowledgementReceiptRef:
        "operator-post-transfer-archive-acknowledgement-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorPostTransferArchiveAcknowledgementRef:
        "operator-post-transfer-archive:active-tab-info:ack:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
