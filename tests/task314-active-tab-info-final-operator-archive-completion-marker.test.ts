import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-operator-archive-completion-marker.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-archival-completion-acknowledgement-receipt.ts"

const READY_OPERATOR_ARCHIVAL_COMPLETION_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-archival-completion-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_archival_completion_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_archival_completion_acknowledgement_receipt_ready",
  receipt: {
    operatorArchivalCompletionAcknowledgementReceiptId:
      "operator-archival-completion-acknowledgement-receipt:browser.active_tab_info:59e",
    finalArchivalCompletionIndexId:
      "final-archival-completion-index:browser.active_tab_info:7f7",
    sanitizedArchivalCompletionAcknowledgementRef:
      "archival-completion-acknowledgement:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorArchivalCompletionAcknowledgementRef:
      "operator-archival-completion:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task314 active tab info final operator archive completion marker", () => {
  it("builds a minimal redacted final operator archive completion marker without release or activation readiness", () => {
    const marker = buildYeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker({
      operatorArchivalCompletionAcknowledgementReceipt:
        READY_OPERATOR_ARCHIVAL_COMPLETION_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedFinalOperatorArchiveCompletionMarkerRef:
        "final-operator-archive-completion-marker:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalOperatorArchiveCompletionAcknowledgementRef:
        "final-operator-archive-completion:active-tab-info:ack:001",
    })

    expect(marker).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-operator-archive-completion-marker.v1",
      method: "browser.active_tab_info",
      status: "final_operator_archive_completion_marker_ready",
      reasonCode: "active_tab_info_final_operator_archive_completion_marker_ready",
      marker: {
        finalOperatorArchiveCompletionMarkerId:
          "final-operator-archive-completion-marker:browser.active_tab_info:d47",
        operatorArchivalCompletionAcknowledgementReceiptId:
          "operator-archival-completion-acknowledgement-receipt:browser.active_tab_info:59e",
        sanitizedFinalOperatorArchiveCompletionMarkerRef:
          "final-operator-archive-completion-marker:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalOperatorArchiveCompletionAcknowledgementRef:
          "final-operator-archive-completion:active-tab-info:ack:001",
        markerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator archival completion acknowledgement receipt and unsafe refs", () => {
    const marker = buildYeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker({
      operatorArchivalCompletionAcknowledgementReceipt: {
        ...READY_OPERATOR_ARCHIVAL_COMPLETION_ACKNOWLEDGEMENT_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedFinalOperatorArchiveCompletionMarkerRef:
        "https://example.test/marker?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      finalOperatorArchiveCompletionAcknowledgementRef: "",
    })

    expect(marker.status).toBe("blocked")
    expect(marker.reasonCode).toBe(
      "active_tab_info_final_operator_archive_completion_marker_blocked",
    )
    expect(marker.blockingReasonCodes).toEqual([
      "final_operator_archive_completion_marker_receipt_not_ready",
      "final_operator_archive_completion_marker_ref_invalid",
      "final_operator_archive_completion_marker_product_log_evidence_ref_invalid",
      "final_operator_archive_completion_ack_ref_invalid",
    ])
    expect(marker.marker).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const marker = buildYeonjangBrowserActiveTabInfoFinalOperatorArchiveCompletionMarker({
      operatorArchivalCompletionAcknowledgementReceipt:
        READY_OPERATOR_ARCHIVAL_COMPLETION_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedFinalOperatorArchiveCompletionMarkerRef:
        "final-operator-archive-completion-marker:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalOperatorArchiveCompletionAcknowledgementRef:
        "final-operator-archive-completion:active-tab-info:ack:001",
    })

    expect(JSON.stringify(marker)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
