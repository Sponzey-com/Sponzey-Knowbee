import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-sealed-completion-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-completion-receipt.ts"

const READY_FINAL_RETAINED_SEALED_COMPLETION_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-completion-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_sealed_completion_ledger_ready",
  reasonCode: "active_tab_info_final_retained_sealed_completion_ledger_ready",
  ledger: {
    finalRetainedSealedCompletionLedgerId:
      "final-retained-sealed-completion-ledger:browser.active_tab_info:965",
    operatorFinalRetainedSealedCompletionReceiptId:
      "operator-final-retained-sealed-completion-receipt:browser.active_tab_info:4b2",
    sanitizedFinalRetainedSealedCompletionLedgerRef:
      "final-retained-sealed-completion-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedSealedCompletionRef:
      "final-retained-sealed-completion:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task408 active tab info operator final retained completion receipt", () => {
  it("builds a minimal redacted operator final retained completion receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt({
        finalRetainedSealedCompletionLedger:
          READY_FINAL_RETAINED_SEALED_COMPLETION_LEDGER,
        sanitizedOperatorFinalRetainedCompletionReceiptRef:
          "operator-final-retained-completion-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCompletionRef:
          "operator-final-retained-completion:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-completion-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_final_retained_completion_receipt_ready",
      reasonCode: "active_tab_info_operator_final_retained_completion_receipt_ready",
      receipt: {
        operatorFinalRetainedCompletionReceiptId:
          "operator-final-retained-completion-receipt:browser.active_tab_info:b03",
        finalRetainedSealedCompletionLedgerId:
          "final-retained-sealed-completion-ledger:browser.active_tab_info:965",
        sanitizedOperatorFinalRetainedCompletionReceiptRef:
          "operator-final-retained-completion-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCompletionRef:
          "operator-final-retained-completion:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained sealed completion ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt({
        finalRetainedSealedCompletionLedger: {
          ...READY_FINAL_RETAINED_SEALED_COMPLETION_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalRetainedCompletionReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalRetainedCompletionRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_retained_completion_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_retained_completion_receipt_ledger_not_ready",
      "operator_final_retained_completion_receipt_ref_invalid",
      "operator_final_retained_completion_receipt_product_log_evidence_ref_invalid",
      "operator_final_retained_completion_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt({
        finalRetainedSealedCompletionLedger:
          READY_FINAL_RETAINED_SEALED_COMPLETION_LEDGER,
        sanitizedOperatorFinalRetainedCompletionReceiptRef:
          "operator-final-retained-completion-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCompletionRef:
          "operator-final-retained-completion:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
