import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-index.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-receipt.ts"

const READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_retained_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_retained_acknowledgement_receipt_ready",
  receipt: {
    operatorFinalRetainedAcknowledgementReceiptId:
      "operator-final-retained-acknowledgement-receipt:browser.active_tab_info:dbd",
    finalRetainedAcknowledgementLedgerId:
      "final-retained-acknowledgement-ledger:browser.active_tab_info:a3d",
    sanitizedOperatorFinalRetainedAcknowledgementReceiptRef:
      "operator-final-retained-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedAcknowledgementRef:
      "operator-final-retained-acknowledgement:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task362 active tab info final retained completion index", () => {
  it("builds a minimal redacted final retained completion index without release or activation readiness", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex({
      operatorFinalRetainedAcknowledgementReceipt:
        READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedFinalRetainedCompletionIndexRef:
        "final-retained-completion-index:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      retainedCompletionAcknowledgementRef:
        "retained-completion:active-tab-info:ack:001",
    })

    expect(index).toEqual({
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
    })
  })

  it("blocks unready operator final retained acknowledgement receipt and unsafe refs", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex({
      operatorFinalRetainedAcknowledgementReceipt: {
        ...READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedFinalRetainedCompletionIndexRef:
        "https://example.test/index?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      retainedCompletionAcknowledgementRef: "",
    })

    expect(index.status).toBe("blocked")
    expect(index.reasonCode).toBe(
      "active_tab_info_final_retained_completion_index_blocked",
    )
    expect(index.blockingReasonCodes).toEqual([
      "final_retained_completion_index_receipt_not_ready",
      "final_retained_completion_index_ref_invalid",
      "final_retained_completion_index_product_log_evidence_ref_invalid",
      "final_retained_completion_index_ack_ref_invalid",
    ])
    expect(index.index).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const index = buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex({
      operatorFinalRetainedAcknowledgementReceipt:
        READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedFinalRetainedCompletionIndexRef:
        "final-retained-completion-index:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      retainedCompletionAcknowledgementRef:
        "retained-completion:active-tab-info:ack:001",
    })

    expect(JSON.stringify(index)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
