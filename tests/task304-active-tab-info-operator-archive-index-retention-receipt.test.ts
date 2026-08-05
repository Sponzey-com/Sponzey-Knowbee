import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-release-archive-index-pointer.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-archive-index-retention-receipt.ts"

const READY_FINAL_RELEASE_ARCHIVE_INDEX_POINTER: YeonjangBrowserActiveTabInfoFinalReleaseArchiveIndexPointer = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-release-archive-index-pointer.v1",
  method: "browser.active_tab_info",
  status: "final_release_archive_index_pointer_ready",
  reasonCode: "active_tab_info_final_release_archive_index_pointer_ready",
  pointer: {
    finalReleaseArchiveIndexPointerId:
      "final-release-archive-index-pointer:browser.active_tab_info:f27",
    operatorReleaseArchiveCompletionNoticeId:
      "operator-release-archive-completion-notice:browser.active_tab_info:f4d",
    sanitizedReleaseArchiveIndexPointerRef:
      "release-archive-index-pointer:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    archiveIndexRetentionAcknowledgementRef:
      "archive-index-retention:active-tab-info:ack:001",
    pointerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task304 active tab info operator archive index retention receipt", () => {
  it("builds a minimal redacted archive index retention receipt without release or activation readiness", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt({
      finalReleaseArchiveIndexPointer: READY_FINAL_RELEASE_ARCHIVE_INDEX_POINTER,
      sanitizedArchiveIndexRetentionReceiptRef:
        "archive-index-retention-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorRetentionAcknowledgementRef:
        "operator-retention:active-tab-info:ack:001",
    })

    expect(receipt).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-archive-index-retention-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_archive_index_retention_receipt_ready",
      reasonCode: "active_tab_info_operator_archive_index_retention_receipt_ready",
      receipt: {
        operatorArchiveIndexRetentionReceiptId:
          "operator-archive-index-retention-receipt:browser.active_tab_info:51a",
        finalReleaseArchiveIndexPointerId:
          "final-release-archive-index-pointer:browser.active_tab_info:f27",
        sanitizedArchiveIndexRetentionReceiptRef:
          "archive-index-retention-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetentionAcknowledgementRef:
          "operator-retention:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final release archive index pointers and unsafe refs", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt({
      finalReleaseArchiveIndexPointer: {
        ...READY_FINAL_RELEASE_ARCHIVE_INDEX_POINTER,
        status: "blocked",
        pointer: undefined,
      },
      sanitizedArchiveIndexRetentionReceiptRef:
        "https://example.test/retention?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      operatorRetentionAcknowledgementRef: "",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe("active_tab_info_operator_archive_index_retention_receipt_blocked")
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_archive_index_retention_receipt_pointer_not_ready",
      "operator_archive_index_retention_receipt_ref_invalid",
      "operator_archive_index_retention_receipt_product_log_evidence_ref_invalid",
      "operator_archive_index_retention_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt({
      finalReleaseArchiveIndexPointer: READY_FINAL_RELEASE_ARCHIVE_INDEX_POINTER,
      sanitizedArchiveIndexRetentionReceiptRef:
        "archive-index-retention-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorRetentionAcknowledgementRef:
        "operator-retention:active-tab-info:ack:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
