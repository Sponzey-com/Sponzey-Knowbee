import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-sealed-archive-handoff-completion-index.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-sealed-archive-receipt.ts"

const READY_FINAL_SEALED_ARCHIVE_HANDOFF_COMPLETION_INDEX: YeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-sealed-archive-handoff-completion-index.v1",
  method: "browser.active_tab_info",
  status: "final_sealed_archive_handoff_completion_index_ready",
  reasonCode:
    "active_tab_info_final_sealed_archive_handoff_completion_index_ready",
  index: {
    finalSealedArchiveHandoffCompletionIndexId:
      "final-sealed-archive-handoff-completion-index:browser.active_tab_info:246",
    operatorSealedArchiveHandoffReceiptId:
      "operator-sealed-archive-handoff-receipt:browser.active_tab_info:263",
    sanitizedFinalSealedArchiveHandoffCompletionIndexRef:
      "final-sealed-archive-handoff-completion-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalSealedArchiveHandoffCompletionAcknowledgementRef:
      "final-sealed-archive-handoff-completion:active-tab-info:ack:001",
    indexStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task328 active tab info operator final sealed archive receipt", () => {
  it("builds a minimal redacted operator final sealed archive receipt without release or activation readiness", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt({
      finalSealedArchiveHandoffCompletionIndex:
        READY_FINAL_SEALED_ARCHIVE_HANDOFF_COMPLETION_INDEX,
      sanitizedOperatorFinalSealedArchiveReceiptRef:
        "operator-final-sealed-archive-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorFinalSealedArchiveReceiptRef:
        "operator-final-sealed-archive:active-tab-info:receipt:001",
    })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-sealed-archive-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_final_sealed_archive_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_sealed_archive_receipt_ready",
      receipt: {
        operatorFinalSealedArchiveReceiptId:
          "operator-final-sealed-archive-receipt:browser.active_tab_info:a63",
        finalSealedArchiveHandoffCompletionIndexId:
          "final-sealed-archive-handoff-completion-index:browser.active_tab_info:246",
        sanitizedOperatorFinalSealedArchiveReceiptRef:
          "operator-final-sealed-archive-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalSealedArchiveReceiptRef:
          "operator-final-sealed-archive:active-tab-info:receipt:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final sealed archive handoff completion index and unsafe refs", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt({
      finalSealedArchiveHandoffCompletionIndex: {
        ...READY_FINAL_SEALED_ARCHIVE_HANDOFF_COMPLETION_INDEX,
        status: "blocked",
        index: undefined,
      },
      sanitizedOperatorFinalSealedArchiveReceiptRef:
        "https://example.test/receipt?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      operatorFinalSealedArchiveReceiptRef: "",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_sealed_archive_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_sealed_archive_receipt_index_not_ready",
      "operator_final_sealed_archive_receipt_ref_invalid",
      "operator_final_sealed_archive_receipt_product_log_evidence_ref_invalid",
      "operator_final_sealed_archive_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalSealedArchiveReceipt({
      finalSealedArchiveHandoffCompletionIndex:
        READY_FINAL_SEALED_ARCHIVE_HANDOFF_COMPLETION_INDEX,
      sanitizedOperatorFinalSealedArchiveReceiptRef:
        "operator-final-sealed-archive-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorFinalSealedArchiveReceiptRef:
        "operator-final-sealed-archive:active-tab-info:receipt:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
