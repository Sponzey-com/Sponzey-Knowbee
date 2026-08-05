import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retention-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalHandoffClosureMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-handoff-closure-marker.ts"

const READY_OPERATOR_FINAL_RETENTION_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retention-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_retention_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_retention_acknowledgement_receipt_ready",
  receipt: {
    operatorFinalRetentionAcknowledgementReceiptId:
      "operator-final-retention-acknowledgement-receipt:browser.active_tab_info:8b2",
    finalRetentionClosureLedgerId:
      "final-retention-closure-ledger:browser.active_tab_info:647",
    sanitizedOperatorFinalRetentionAcknowledgementReceiptRef:
      "operator-final-retention-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetentionAcknowledgementRef:
      "operator-final-retention-acknowledgement:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task342 active tab info final handoff closure marker", () => {
  it("builds a minimal redacted final handoff closure marker without release or activation readiness", () => {
    const marker = buildYeonjangBrowserActiveTabInfoFinalHandoffClosureMarker({
      operatorFinalRetentionAcknowledgementReceipt:
        READY_OPERATOR_FINAL_RETENTION_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedFinalHandoffClosureMarkerRef:
        "final-handoff-closure-marker:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalHandoffClosureAcknowledgementRef:
        "final-handoff-closure:active-tab-info:ack:001",
    })

    expect(marker).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-handoff-closure-marker.v1",
      method: "browser.active_tab_info",
      status: "final_handoff_closure_marker_ready",
      reasonCode:
        "active_tab_info_final_handoff_closure_marker_ready",
      marker: {
        finalHandoffClosureMarkerId:
          "final-handoff-closure-marker:browser.active_tab_info:cbb",
        operatorFinalRetentionAcknowledgementReceiptId:
          "operator-final-retention-acknowledgement-receipt:browser.active_tab_info:8b2",
        sanitizedFinalHandoffClosureMarkerRef:
          "final-handoff-closure-marker:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalHandoffClosureAcknowledgementRef:
          "final-handoff-closure:active-tab-info:ack:001",
        markerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator final retention acknowledgement receipt and unsafe refs", () => {
    const marker = buildYeonjangBrowserActiveTabInfoFinalHandoffClosureMarker({
      operatorFinalRetentionAcknowledgementReceipt: {
        ...READY_OPERATOR_FINAL_RETENTION_ACKNOWLEDGEMENT_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedFinalHandoffClosureMarkerRef:
        "https://example.test/marker?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      finalHandoffClosureAcknowledgementRef: "",
    })

    expect(marker.status).toBe("blocked")
    expect(marker.reasonCode).toBe(
      "active_tab_info_final_handoff_closure_marker_blocked",
    )
    expect(marker.blockingReasonCodes).toEqual([
      "final_handoff_closure_marker_receipt_not_ready",
      "final_handoff_closure_marker_ref_invalid",
      "final_handoff_closure_marker_product_log_evidence_ref_invalid",
      "final_handoff_closure_marker_ack_ref_invalid",
    ])
    expect(marker.marker).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const marker = buildYeonjangBrowserActiveTabInfoFinalHandoffClosureMarker({
      operatorFinalRetentionAcknowledgementReceipt:
        READY_OPERATOR_FINAL_RETENTION_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedFinalHandoffClosureMarkerRef:
        "final-handoff-closure-marker:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalHandoffClosureAcknowledgementRef:
        "final-handoff-closure:active-tab-info:ack:001",
    })

    expect(JSON.stringify(marker)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
