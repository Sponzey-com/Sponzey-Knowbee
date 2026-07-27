import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-sealed-archive-handoff-marker.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.ts"

const READY_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT: YeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_sealed_completion_archive_receipt_ready",
  reasonCode:
    "active_tab_info_operator_sealed_completion_archive_receipt_ready",
  receipt: {
    operatorSealedCompletionArchiveReceiptId:
      "operator-sealed-completion-archive-receipt:browser.active_tab_info:a91",
    finalCompletionArchiveSealId:
      "final-completion-archive-seal:browser.active_tab_info:4e1",
    sanitizedOperatorSealedCompletionArchiveReceiptRef:
      "operator-sealed-completion-archive-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorSealedCompletionArchiveReceiptRef:
      "operator-sealed-completion-archive:active-tab-info:receipt:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task322 active tab info final sealed archive handoff marker", () => {
  it("builds a minimal redacted final sealed archive handoff marker without release or activation readiness", () => {
    const marker = buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker({
      operatorSealedCompletionArchiveReceipt:
        READY_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT,
      sanitizedFinalSealedArchiveHandoffMarkerRef:
        "final-sealed-archive-handoff-marker:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalSealedArchiveHandoffAcknowledgementRef:
        "final-sealed-archive-handoff:active-tab-info:ack:001",
    })

    expect(marker).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-handoff-marker.v1",
      method: "browser.active_tab_info",
      status: "final_sealed_archive_handoff_marker_ready",
      reasonCode: "active_tab_info_final_sealed_archive_handoff_marker_ready",
      marker: {
        finalSealedArchiveHandoffMarkerId:
          "final-sealed-archive-handoff-marker:browser.active_tab_info:3b5",
        operatorSealedCompletionArchiveReceiptId:
          "operator-sealed-completion-archive-receipt:browser.active_tab_info:a91",
        sanitizedFinalSealedArchiveHandoffMarkerRef:
          "final-sealed-archive-handoff-marker:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalSealedArchiveHandoffAcknowledgementRef:
          "final-sealed-archive-handoff:active-tab-info:ack:001",
        markerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator sealed completion archive receipt and unsafe refs", () => {
    const marker = buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker({
      operatorSealedCompletionArchiveReceipt: {
        ...READY_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedFinalSealedArchiveHandoffMarkerRef:
        "https://example.test/marker?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      finalSealedArchiveHandoffAcknowledgementRef: "",
    })

    expect(marker.status).toBe("blocked")
    expect(marker.reasonCode).toBe(
      "active_tab_info_final_sealed_archive_handoff_marker_blocked",
    )
    expect(marker.blockingReasonCodes).toEqual([
      "final_sealed_archive_handoff_marker_receipt_not_ready",
      "final_sealed_archive_handoff_marker_ref_invalid",
      "final_sealed_archive_handoff_marker_product_log_evidence_ref_invalid",
      "final_sealed_archive_handoff_ack_ref_invalid",
    ])
    expect(marker.marker).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const marker = buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker({
      operatorSealedCompletionArchiveReceipt:
        READY_OPERATOR_SEALED_COMPLETION_ARCHIVE_RECEIPT,
      sanitizedFinalSealedArchiveHandoffMarkerRef:
        "final-sealed-archive-handoff-marker:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalSealedArchiveHandoffAcknowledgementRef:
        "final-sealed-archive-handoff:active-tab-info:ack:001",
    })

    expect(JSON.stringify(marker)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
