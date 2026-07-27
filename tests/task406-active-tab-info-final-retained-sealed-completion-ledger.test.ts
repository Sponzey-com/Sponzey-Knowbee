import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-sealed-completion-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-sealed-completion-receipt.ts"

const READY_OPERATOR_FINAL_RETAINED_SEALED_COMPLETION_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCompletionReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-sealed-completion-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_retained_sealed_completion_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_retained_sealed_completion_receipt_ready",
  receipt: {
    operatorFinalRetainedSealedCompletionReceiptId:
      "operator-final-retained-sealed-completion-receipt:browser.active_tab_info:4b2",
    finalRetainedSealedCloseoutCompletionLedgerId:
      "final-retained-sealed-closeout-completion-ledger:browser.active_tab_info:35d",
    sanitizedOperatorFinalRetainedSealedCompletionReceiptRef:
      "operator-final-retained-sealed-completion-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedSealedCompletionRef:
      "operator-final-retained-sealed-completion:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task406 active tab info final retained sealed completion ledger", () => {
  it("builds a minimal redacted final retained sealed completion ledger without release or activation readiness", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger({
        operatorFinalRetainedSealedCompletionReceipt:
          READY_OPERATOR_FINAL_RETAINED_SEALED_COMPLETION_RECEIPT,
        sanitizedFinalRetainedSealedCompletionLedgerRef:
          "final-retained-sealed-completion-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedSealedCompletionRef:
          "final-retained-sealed-completion:active-tab-info:ack:001",
      })

    expect(ledger).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-retained-sealed-completion-ledger.v1",
      method: "browser.active_tab_info",
      status: "final_retained_sealed_completion_ledger_ready",
      reasonCode:
        "active_tab_info_final_retained_sealed_completion_ledger_ready",
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
    })
  })

  it("blocks unready operator final retained sealed completion receipt and unsafe refs", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger({
        operatorFinalRetainedSealedCompletionReceipt: {
          ...READY_OPERATOR_FINAL_RETAINED_SEALED_COMPLETION_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedSealedCompletionLedgerRef:
          "https://example.test/ledger?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedSealedCompletionRef: "",
      })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_sealed_completion_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_sealed_completion_ledger_receipt_not_ready",
      "final_retained_sealed_completion_ledger_ref_invalid",
      "final_retained_sealed_completion_ledger_product_log_evidence_ref_invalid",
      "final_retained_sealed_completion_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedSealedCompletionLedger({
        operatorFinalRetainedSealedCompletionReceipt:
          READY_OPERATOR_FINAL_RETAINED_SEALED_COMPLETION_RECEIPT,
        sanitizedFinalRetainedSealedCompletionLedgerRef:
          "final-retained-sealed-completion-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedSealedCompletionRef:
          "final-retained-sealed-completion:active-tab-info:ack:001",
      })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
