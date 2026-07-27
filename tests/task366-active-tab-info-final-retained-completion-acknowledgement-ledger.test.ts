import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-acknowledgement-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-completion-acknowledgement-receipt.ts"

const READY_OPERATOR_RETAINED_COMPLETION_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt = {
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
}

describe("task366 active tab info final retained completion acknowledgement ledger", () => {
  it("builds a minimal redacted final retained completion acknowledgement ledger without release or activation readiness", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger({
        operatorRetainedCompletionAcknowledgementReceipt:
          READY_OPERATOR_RETAINED_COMPLETION_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedCompletionAcknowledgementLedgerRef:
          "final-retained-completion-acknowledgement-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedCompletionAcknowledgementRef:
          "final-retained-completion:active-tab-info:ack:001",
      })

    expect(ledger).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-acknowledgement-ledger.v1",
      method: "browser.active_tab_info",
      status: "final_retained_completion_acknowledgement_ledger_ready",
      reasonCode:
        "active_tab_info_final_retained_completion_acknowledgement_ledger_ready",
      ledger: {
        finalRetainedCompletionAcknowledgementLedgerId:
          "final-retained-completion-acknowledgement-ledger:browser.active_tab_info:6e8",
        operatorRetainedCompletionAcknowledgementReceiptId:
          "operator-retained-completion-acknowledgement-receipt:browser.active_tab_info:fd3",
        sanitizedFinalRetainedCompletionAcknowledgementLedgerRef:
          "final-retained-completion-acknowledgement-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedCompletionAcknowledgementRef:
          "final-retained-completion:active-tab-info:ack:001",
        ledgerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator retained completion acknowledgement receipt and unsafe refs", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger({
        operatorRetainedCompletionAcknowledgementReceipt: {
          ...READY_OPERATOR_RETAINED_COMPLETION_ACKNOWLEDGEMENT_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedCompletionAcknowledgementLedgerRef:
          "https://example.test/ledger?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedCompletionAcknowledgementRef: "",
      })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_completion_acknowledgement_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_completion_acknowledgement_ledger_receipt_not_ready",
      "final_retained_completion_acknowledgement_ledger_ref_invalid",
      "final_retained_completion_acknowledgement_ledger_product_log_evidence_ref_invalid",
      "final_retained_completion_acknowledgement_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger({
        operatorRetainedCompletionAcknowledgementReceipt:
          READY_OPERATOR_RETAINED_COMPLETION_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedCompletionAcknowledgementLedgerRef:
          "final-retained-completion-acknowledgement-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedCompletionAcknowledgementRef:
          "final-retained-completion:active-tab-info:ack:001",
      })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
