import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-archival-completion-acknowledgement-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-archival-completion-index.ts"

const READY_FINAL_ARCHIVAL_COMPLETION_INDEX: YeonjangBrowserActiveTabInfoFinalArchivalCompletionIndex = {
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-final-archival-completion-index.v1",
  method: "browser.active_tab_info",
  status: "final_archival_completion_index_ready",
  reasonCode: "active_tab_info_final_archival_completion_index_ready",
  index: {
    finalArchivalCompletionIndexId:
      "final-archival-completion-index:browser.active_tab_info:7f7",
    operatorArchivedReleaseAcknowledgementId:
      "operator-archived-release-acknowledgement:browser.active_tab_info:a4b",
    sanitizedArchivalCompletionIndexRef:
      "archival-completion-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    archivalCompletionRetentionAcknowledgementRef:
      "archival-completion-retention:active-tab-info:ack:001",
    indexStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task312 active tab info operator archival completion acknowledgement receipt", () => {
  it("builds a minimal redacted operator acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt({
        finalArchivalCompletionIndex: READY_FINAL_ARCHIVAL_COMPLETION_INDEX,
        sanitizedArchivalCompletionAcknowledgementRef:
          "archival-completion-acknowledgement:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorArchivalCompletionAcknowledgementRef:
          "operator-archival-completion:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
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
    })
  })

  it("blocks unready final archival completion index and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt({
        finalArchivalCompletionIndex: {
          ...READY_FINAL_ARCHIVAL_COMPLETION_INDEX,
          status: "blocked",
          index: undefined,
        },
        sanitizedArchivalCompletionAcknowledgementRef:
          "https://example.test/ack?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorArchivalCompletionAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_archival_completion_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_archival_completion_acknowledgement_receipt_index_not_ready",
      "operator_archival_completion_acknowledgement_ref_invalid",
      "operator_archival_completion_acknowledgement_product_log_evidence_ref_invalid",
      "operator_archival_completion_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorArchivalCompletionAcknowledgementReceipt({
        finalArchivalCompletionIndex: READY_FINAL_ARCHIVAL_COMPLETION_INDEX,
        sanitizedArchivalCompletionAcknowledgementRef:
          "archival-completion-acknowledgement:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorArchivalCompletionAcknowledgementRef:
          "operator-archival-completion:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
