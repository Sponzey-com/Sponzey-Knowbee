import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-archived-release-closure-marker.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-archive-index-retention-receipt.ts"

const READY_OPERATOR_ARCHIVE_INDEX_RETENTION_RECEIPT: YeonjangBrowserActiveTabInfoOperatorArchiveIndexRetentionReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-archive-index-retention-receipt.v1",
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
}

describe("task306 active tab info final archived release closure marker", () => {
  it("builds a minimal redacted archived release closure marker without release or activation readiness", () => {
    const marker = buildYeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker({
      operatorArchiveIndexRetentionReceipt: READY_OPERATOR_ARCHIVE_INDEX_RETENTION_RECEIPT,
      sanitizedArchivedReleaseClosureMarkerRef:
        "archived-release-closure-marker:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalArchiveRetentionAcknowledgementRef:
        "final-archive-retention:active-tab-info:ack:001",
    })

    expect(marker).toEqual({
      schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-archived-release-closure-marker.v1",
      method: "browser.active_tab_info",
      status: "final_archived_release_closure_marker_ready",
      reasonCode: "active_tab_info_final_archived_release_closure_marker_ready",
      marker: {
        finalArchivedReleaseClosureMarkerId:
          "final-archived-release-closure-marker:browser.active_tab_info:b25",
        operatorArchiveIndexRetentionReceiptId:
          "operator-archive-index-retention-receipt:browser.active_tab_info:51a",
        sanitizedArchivedReleaseClosureMarkerRef:
          "archived-release-closure-marker:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalArchiveRetentionAcknowledgementRef:
          "final-archive-retention:active-tab-info:ack:001",
        markerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator archive index retention receipts and unsafe refs", () => {
    const marker = buildYeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker({
      operatorArchiveIndexRetentionReceipt: {
        ...READY_OPERATOR_ARCHIVE_INDEX_RETENTION_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedArchivedReleaseClosureMarkerRef:
        "https://example.test/closure?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      finalArchiveRetentionAcknowledgementRef: "",
    })

    expect(marker.status).toBe("blocked")
    expect(marker.reasonCode).toBe("active_tab_info_final_archived_release_closure_marker_blocked")
    expect(marker.blockingReasonCodes).toEqual([
      "final_archived_release_closure_marker_receipt_not_ready",
      "final_archived_release_closure_marker_ref_invalid",
      "final_archived_release_closure_marker_product_log_evidence_ref_invalid",
      "final_archive_retention_ack_ref_invalid",
    ])
    expect(marker.marker).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const marker = buildYeonjangBrowserActiveTabInfoFinalArchivedReleaseClosureMarker({
      operatorArchiveIndexRetentionReceipt: READY_OPERATOR_ARCHIVE_INDEX_RETENTION_RECEIPT,
      sanitizedArchivedReleaseClosureMarkerRef:
        "archived-release-closure-marker:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalArchiveRetentionAcknowledgementRef:
        "final-archive-retention:active-tab-info:ack:001",
    })

    expect(JSON.stringify(marker)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
