import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-completion-acknowledgement-receipt.ts"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-index.ts"

const READY_FINAL_RETAINED_COMPLETION_INDEX: YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-index.v1",
  method: "browser.active_tab_info",
  status: "final_retained_completion_index_ready",
  reasonCode: "active_tab_info_final_retained_completion_index_ready",
  index: {
    finalRetainedCompletionIndexId:
      "final-retained-completion-index:browser.active_tab_info:252",
    operatorFinalRetainedAcknowledgementReceiptId:
      "operator-final-retained-acknowledgement-receipt:browser.active_tab_info:dbd",
    sanitizedFinalRetainedCompletionIndexRef:
      "final-retained-completion-index:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    retainedCompletionAcknowledgementRef:
      "retained-completion:active-tab-info:ack:001",
    indexStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task364 active tab info operator retained completion acknowledgement receipt", () => {
  it("builds a minimal redacted operator retained completion acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt({
        finalRetainedCompletionIndex: READY_FINAL_RETAINED_COMPLETION_INDEX,
        sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef:
          "operator-retained-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedCompletionAcknowledgementRef:
          "operator-retained-completion:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-retained-completion-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_retained_completion_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_retained_completion_acknowledgement_receipt_ready",
      receipt: {
        operatorRetainedCompletionAcknowledgementReceiptId:
          "operator-retained-completion-acknowledgement-receipt:browser.active_tab_info:fd3",
        finalRetainedCompletionIndexId:
          "final-retained-completion-index:browser.active_tab_info:252",
        sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef:
          "operator-retained-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedCompletionAcknowledgementRef:
          "operator-retained-completion:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained completion index and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt({
        finalRetainedCompletionIndex: {
          ...READY_FINAL_RETAINED_COMPLETION_INDEX,
          status: "blocked",
          index: undefined,
        },
        sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorRetainedCompletionAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_retained_completion_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_retained_completion_acknowledgement_receipt_index_not_ready",
      "operator_retained_completion_acknowledgement_receipt_ref_invalid",
      "operator_retained_completion_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_retained_completion_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt({
        finalRetainedCompletionIndex: READY_FINAL_RETAINED_COMPLETION_INDEX,
        sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef:
          "operator-retained-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedCompletionAcknowledgementRef:
          "operator-retained-completion:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
