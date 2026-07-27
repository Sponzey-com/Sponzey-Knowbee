import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-sealed-archive-handoff-completion-index.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-sealed-archive-handoff-receipt.ts"

const READY_OPERATOR_SEALED_ARCHIVE_HANDOFF_RECEIPT: YeonjangBrowserActiveTabInfoOperatorSealedArchiveHandoffReceipt = {
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
}

describe("task326 active tab info final sealed archive handoff completion index", () => {
  it("builds a minimal redacted final sealed archive handoff completion index without release or activation readiness", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex({
      operatorSealedArchiveHandoffReceipt:
        READY_OPERATOR_SEALED_ARCHIVE_HANDOFF_RECEIPT,
      sanitizedFinalSealedArchiveHandoffCompletionIndexRef:
        "final-sealed-archive-handoff-completion-index:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalSealedArchiveHandoffCompletionAcknowledgementRef:
        "final-sealed-archive-handoff-completion:active-tab-info:ack:001",
    })

    expect(index).toEqual({
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
    })
  })

  it("blocks unready operator sealed archive handoff receipt and unsafe refs", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex({
      operatorSealedArchiveHandoffReceipt: {
        ...READY_OPERATOR_SEALED_ARCHIVE_HANDOFF_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedFinalSealedArchiveHandoffCompletionIndexRef:
        "https://example.test/index?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      finalSealedArchiveHandoffCompletionAcknowledgementRef: "",
    })

    expect(index.status).toBe("blocked")
    expect(index.reasonCode).toBe(
      "active_tab_info_final_sealed_archive_handoff_completion_index_blocked",
    )
    expect(index.blockingReasonCodes).toEqual([
      "final_sealed_archive_handoff_completion_index_receipt_not_ready",
      "final_sealed_archive_handoff_completion_index_ref_invalid",
      "final_sealed_archive_handoff_completion_index_product_log_evidence_ref_invalid",
      "final_sealed_archive_handoff_completion_ack_ref_invalid",
    ])
    expect(index.index).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalSealedArchiveHandoffCompletionIndex({
      operatorSealedArchiveHandoffReceipt:
        READY_OPERATOR_SEALED_ARCHIVE_HANDOFF_RECEIPT,
      sanitizedFinalSealedArchiveHandoffCompletionIndexRef:
        "final-sealed-archive-handoff-completion-index:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalSealedArchiveHandoffCompletionAcknowledgementRef:
        "final-sealed-archive-handoff-completion:active-tab-info:ack:001",
    })

    expect(JSON.stringify(index)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
