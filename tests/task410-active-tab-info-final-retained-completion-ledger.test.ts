import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-completion-receipt.ts"

const READY_OPERATOR_FINAL_RETAINED_COMPLETION_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionReceipt = {
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
}

describe("task410 active tab info final retained completion ledger", () => {
  it("builds a minimal redacted final retained completion ledger without release or activation readiness", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger({
      operatorFinalRetainedCompletionReceipt:
        READY_OPERATOR_FINAL_RETAINED_COMPLETION_RECEIPT,
      sanitizedFinalRetainedCompletionLedgerRef:
        "final-retained-completion-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalRetainedCompletionRef:
        "final-retained-completion:active-tab-info:ack:001",
    })

    expect(ledger).toEqual({
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
    })
  })

  it("blocks unready operator final retained completion receipt and unsafe refs", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger({
      operatorFinalRetainedCompletionReceipt: {
        ...READY_OPERATOR_FINAL_RETAINED_COMPLETION_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedFinalRetainedCompletionLedgerRef:
        "https://example.test/ledger?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      finalRetainedCompletionRef: "",
    })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_completion_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_completion_ledger_receipt_not_ready",
      "final_retained_completion_ledger_ref_invalid",
      "final_retained_completion_ledger_product_log_evidence_ref_invalid",
      "final_retained_completion_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionLedger({
      operatorFinalRetainedCompletionReceipt:
        READY_OPERATOR_FINAL_RETAINED_COMPLETION_RECEIPT,
      sanitizedFinalRetainedCompletionLedgerRef:
        "final-retained-completion-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalRetainedCompletionRef:
        "final-retained-completion:active-tab-info:ack:001",
    })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
