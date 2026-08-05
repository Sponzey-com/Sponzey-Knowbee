import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-handoff-closure-marker.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-handoff-receipt.ts"

const READY_FINAL_HANDOFF_CLOSURE_MARKER: YeonjangBrowserActiveTabInfoFinalHandoffClosureMarker = {
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
}

describe("task344 active tab info operator final handoff receipt", () => {
  it("builds a minimal redacted operator final handoff receipt without release or activation readiness", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt({
      finalHandoffClosureMarker:
        READY_FINAL_HANDOFF_CLOSURE_MARKER,
      sanitizedOperatorFinalHandoffReceiptRef:
        "operator-final-handoff-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorFinalHandoffAcknowledgementRef:
        "operator-final-handoff:active-tab-info:ack:001",
    })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-handoff-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_final_handoff_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_handoff_receipt_ready",
      receipt: {
        operatorFinalHandoffReceiptId:
          "operator-final-handoff-receipt:browser.active_tab_info:a14",
        finalHandoffClosureMarkerId:
          "final-handoff-closure-marker:browser.active_tab_info:cbb",
        sanitizedOperatorFinalHandoffReceiptRef:
          "operator-final-handoff-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalHandoffAcknowledgementRef:
          "operator-final-handoff:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final handoff closure marker and unsafe refs", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt({
      finalHandoffClosureMarker: {
        ...READY_FINAL_HANDOFF_CLOSURE_MARKER,
        status: "blocked",
        marker: undefined,
      },
      sanitizedOperatorFinalHandoffReceiptRef:
        "https://example.test/receipt?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      operatorFinalHandoffAcknowledgementRef: "",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_handoff_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_handoff_receipt_marker_not_ready",
      "operator_final_handoff_receipt_ref_invalid",
      "operator_final_handoff_receipt_product_log_evidence_ref_invalid",
      "operator_final_handoff_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt({
      finalHandoffClosureMarker:
        READY_FINAL_HANDOFF_CLOSURE_MARKER,
      sanitizedOperatorFinalHandoffReceiptRef:
        "operator-final-handoff-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorFinalHandoffAcknowledgementRef:
        "operator-final-handoff:active-tab-info:ack:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
