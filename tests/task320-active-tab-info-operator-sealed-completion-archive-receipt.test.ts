import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-completion-archive-seal.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-sealed-completion-archive-receipt.ts"

const READY_FINAL_COMPLETION_ARCHIVE_SEAL: YeonjangBrowserActiveTabInfoFinalCompletionArchiveSeal = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-completion-archive-seal.v1",
  method: "browser.active_tab_info",
  status: "final_completion_archive_seal_ready",
  reasonCode: "active_tab_info_final_completion_archive_seal_ready",
  seal: {
    finalCompletionArchiveSealId:
      "final-completion-archive-seal:browser.active_tab_info:4e1",
    operatorCompletionArchiveAcknowledgementId:
      "operator-completion-archive-acknowledgement:browser.active_tab_info:76c",
    sanitizedFinalCompletionArchiveSealRef:
      "final-completion-archive-seal:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalCompletionArchiveAcknowledgementRef:
      "final-completion-archive:active-tab-info:ack:001",
    sealStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task320 active tab info operator sealed completion archive receipt", () => {
  it("builds a minimal redacted operator sealed completion archive receipt without release or activation readiness", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt({
      finalCompletionArchiveSeal: READY_FINAL_COMPLETION_ARCHIVE_SEAL,
      sanitizedOperatorSealedCompletionArchiveReceiptRef:
        "operator-sealed-completion-archive-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorSealedCompletionArchiveReceiptRef:
        "operator-sealed-completion-archive:active-tab-info:receipt:001",
    })

    expect(receipt).toEqual({
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
    })
  })

  it("blocks unready final completion archive seal and unsafe refs", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt({
      finalCompletionArchiveSeal: {
        ...READY_FINAL_COMPLETION_ARCHIVE_SEAL,
        status: "blocked",
        seal: undefined,
      },
      sanitizedOperatorSealedCompletionArchiveReceiptRef:
        "https://example.test/receipt?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      operatorSealedCompletionArchiveReceiptRef: "",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_sealed_completion_archive_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_sealed_completion_archive_receipt_seal_not_ready",
      "operator_sealed_completion_archive_receipt_ref_invalid",
      "operator_sealed_completion_archive_receipt_product_log_evidence_ref_invalid",
      "operator_sealed_completion_archive_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorSealedCompletionArchiveReceipt({
      finalCompletionArchiveSeal: READY_FINAL_COMPLETION_ARCHIVE_SEAL,
      sanitizedOperatorSealedCompletionArchiveReceiptRef:
        "operator-sealed-completion-archive-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorSealedCompletionArchiveReceiptRef:
        "operator-sealed-completion-archive:active-tab-info:receipt:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
