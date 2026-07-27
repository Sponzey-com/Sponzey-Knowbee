import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-completion-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-completion-receipt.ts"

const READY_OPERATOR_FINAL_COMPLETION_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalCompletionReceipt = {
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
}

describe("task414 active tab info final completion ledger", () => {
  it("builds a minimal redacted final completion ledger without release or activation readiness", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalCompletionLedger({
      operatorFinalCompletionReceipt: READY_OPERATOR_FINAL_COMPLETION_RECEIPT,
      sanitizedFinalCompletionLedgerRef:
        "final-completion-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalCompletionRef: "final-completion:active-tab-info:ack:001",
    })

    expect(ledger).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-completion-ledger.v1",
      method: "browser.active_tab_info",
      status: "final_completion_ledger_ready",
      reasonCode: "active_tab_info_final_completion_ledger_ready",
      ledger: {
        finalCompletionLedgerId:
          "final-completion-ledger:browser.active_tab_info:158",
        operatorFinalCompletionReceiptId:
          "operator-final-completion-receipt:browser.active_tab_info:5d7",
        sanitizedFinalCompletionLedgerRef:
          "final-completion-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalCompletionRef: "final-completion:active-tab-info:ack:001",
        ledgerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator final completion receipt and unsafe refs", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalCompletionLedger({
      operatorFinalCompletionReceipt: {
        ...READY_OPERATOR_FINAL_COMPLETION_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedFinalCompletionLedgerRef:
        "https://example.test/ledger?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      finalCompletionRef: "",
    })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_completion_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_completion_ledger_receipt_not_ready",
      "final_completion_ledger_ref_invalid",
      "final_completion_ledger_product_log_evidence_ref_invalid",
      "final_completion_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalCompletionLedger({
      operatorFinalCompletionReceipt: READY_OPERATOR_FINAL_COMPLETION_RECEIPT,
      sanitizedFinalCompletionLedgerRef:
        "final-completion-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalCompletionRef: "final-completion:active-tab-info:ack:001",
    })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
