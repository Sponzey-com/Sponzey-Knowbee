import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-transfer-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-post-transfer-archive-pointer.ts"

const READY_OPERATOR_FINAL_TRANSFER_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-transfer-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_transfer_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_transfer_acknowledgement_receipt_ready",
  receipt: {
    operatorFinalTransferAcknowledgementReceiptId:
      "operator-final-transfer-acknowledgement-receipt:browser.active_tab_info:b20",
    finalTransferCloseoutLedgerId:
      "final-transfer-closeout-ledger:browser.active_tab_info:b00",
    sanitizedOperatorFinalTransferAcknowledgementReceiptRef:
      "operator-final-transfer-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalTransferAcknowledgementRef:
      "operator-final-transfer:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task350 active tab info final post-transfer archive pointer", () => {
  it("builds a minimal redacted final post-transfer archive pointer without release or activation readiness", () => {
    const pointer = buildYeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer({
      operatorFinalTransferAcknowledgementReceipt:
        READY_OPERATOR_FINAL_TRANSFER_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedPostTransferArchivePointerRef:
        "post-transfer-archive-pointer:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      archiveTransferAcknowledgementRef:
        "archive-transfer:active-tab-info:ack:001",
    })

    expect(pointer).toEqual({
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
    })
  })

  it("blocks unready operator final transfer acknowledgement receipt and unsafe refs", () => {
    const pointer = buildYeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer({
      operatorFinalTransferAcknowledgementReceipt: {
        ...READY_OPERATOR_FINAL_TRANSFER_ACKNOWLEDGEMENT_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedPostTransferArchivePointerRef:
        "https://example.test/pointer?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      archiveTransferAcknowledgementRef: "",
    })

    expect(pointer.status).toBe("blocked")
    expect(pointer.reasonCode).toBe(
      "active_tab_info_final_post_transfer_archive_pointer_blocked",
    )
    expect(pointer.blockingReasonCodes).toEqual([
      "final_post_transfer_archive_pointer_receipt_not_ready",
      "final_post_transfer_archive_pointer_ref_invalid",
      "final_post_transfer_archive_pointer_product_log_evidence_ref_invalid",
      "final_post_transfer_archive_pointer_ack_ref_invalid",
    ])
    expect(pointer.pointer).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const pointer = buildYeonjangBrowserActiveTabInfoFinalPostTransferArchivePointer({
      operatorFinalTransferAcknowledgementReceipt:
        READY_OPERATOR_FINAL_TRANSFER_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedPostTransferArchivePointerRef:
        "post-transfer-archive-pointer:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      archiveTransferAcknowledgementRef:
        "archive-transfer:active-tab-info:ack:001",
    })

    expect(JSON.stringify(pointer)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
