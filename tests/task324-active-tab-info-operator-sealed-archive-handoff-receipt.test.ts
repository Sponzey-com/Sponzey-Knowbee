import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-sealed-archive-handoff-marker.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-sealed-archive-handoff-receipt.ts"

const READY_FINAL_SEALED_ARCHIVE_HANDOFF_MARKER: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffMarker = {
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
}

describe("task324 active tab info operator sealed archive handoff receipt", () => {
  it("builds a minimal redacted operator sealed archive handoff receipt without release or activation readiness", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt({
      finalSealedArchiveHandoffMarker:
        READY_FINAL_SEALED_ARCHIVE_HANDOFF_MARKER,
      sanitizedOperatorSealedArchiveHandoffReceiptRef:
        "operator-sealed-archive-handoff-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorSealedArchiveHandoffReceiptRef:
        "operator-sealed-archive-handoff:active-tab-info:receipt:001",
    })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-sealed-archive-handoff-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_sealed_archive_handoff_receipt_ready",
      reasonCode:
        "active_tab_info_operator_sealed_archive_handoff_receipt_ready",
      receipt: {
        operatorSealedArchiveHandoffReceiptId:
          "operator-sealed-archive-handoff-receipt:browser.active_tab_info:263",
        finalSealedArchiveHandoffMarkerId:
          "final-sealed-archive-handoff-marker:browser.active_tab_info:3b5",
        sanitizedOperatorSealedArchiveHandoffReceiptRef:
          "operator-sealed-archive-handoff-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorSealedArchiveHandoffReceiptRef:
          "operator-sealed-archive-handoff:active-tab-info:receipt:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final sealed archive handoff marker and unsafe refs", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt({
      finalSealedArchiveHandoffMarker: {
        ...READY_FINAL_SEALED_ARCHIVE_HANDOFF_MARKER,
        status: "blocked",
        marker: undefined,
      },
      sanitizedOperatorSealedArchiveHandoffReceiptRef:
        "https://example.test/receipt?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      operatorSealedArchiveHandoffReceiptRef: "",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_sealed_archive_handoff_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_sealed_archive_handoff_receipt_marker_not_ready",
      "operator_sealed_archive_handoff_receipt_ref_invalid",
      "operator_sealed_archive_handoff_receipt_product_log_evidence_ref_invalid",
      "operator_sealed_archive_handoff_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt({
      finalSealedArchiveHandoffMarker:
        READY_FINAL_SEALED_ARCHIVE_HANDOFF_MARKER,
      sanitizedOperatorSealedArchiveHandoffReceiptRef:
        "operator-sealed-archive-handoff-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorSealedArchiveHandoffReceiptRef:
        "operator-sealed-archive-handoff:active-tab-info:receipt:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
