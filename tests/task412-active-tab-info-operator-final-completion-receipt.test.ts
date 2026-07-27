import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-completion-receipt.ts"

const READY_FINAL_RETAINED_COMPLETION_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_completion_ledger_ready",
  reasonCode: "active_tab_info_final_retained_completion_ledger_ready",
  ledger: {
    finalRetainedCompletionLedgerId:
      "final-retained-completion-ledger:browser.active_tab_info:0d3",
    operatorFinalRetainedCompletionReceiptId:
      "operator-final-retained-completion-receipt:browser.active_tab_info:b03",
    sanitizedFinalRetainedCompletionLedgerRef:
      "final-retained-completion-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedCompletionRef:
      "final-retained-completion:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task412 active tab info operator final completion receipt", () => {
  it("builds a minimal redacted operator final completion receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt({
        finalRetainedCompletionLedger: READY_FINAL_RETAINED_COMPLETION_LEDGER,
        sanitizedOperatorFinalCompletionReceiptRef:
          "operator-final-completion-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalCompletionRef:
          "operator-final-completion:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-completion-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_final_completion_receipt_ready",
      reasonCode: "active_tab_info_operator_final_completion_receipt_ready",
      receipt: {
        operatorFinalCompletionReceiptId:
          "operator-final-completion-receipt:browser.active_tab_info:5d7",
        finalRetainedCompletionLedgerId:
          "final-retained-completion-ledger:browser.active_tab_info:0d3",
        sanitizedOperatorFinalCompletionReceiptRef:
          "operator-final-completion-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalCompletionRef:
          "operator-final-completion:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained completion ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt({
        finalRetainedCompletionLedger: {
          ...READY_FINAL_RETAINED_COMPLETION_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalCompletionReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalCompletionRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_completion_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_completion_receipt_ledger_not_ready",
      "operator_final_completion_receipt_ref_invalid",
      "operator_final_completion_receipt_product_log_evidence_ref_invalid",
      "operator_final_completion_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt({
        finalRetainedCompletionLedger: READY_FINAL_RETAINED_COMPLETION_LEDGER,
        sanitizedOperatorFinalCompletionReceiptRef:
          "operator-final-completion-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalCompletionRef:
          "operator-final-completion:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
