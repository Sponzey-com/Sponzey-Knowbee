import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-closeout-completion-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-closeout-ledger.ts"

const READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_COMPLETION_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutCompletionAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-completion-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status:
    "operator_final_retained_closeout_completion_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_retained_closeout_completion_acknowledgement_receipt_ready",
  receipt: {
    operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId:
      "operator-final-retained-closeout-completion-acknowledgement-receipt:browser.active_tab_info:8ae",
    finalRetainedCloseoutCompletionLedgerId:
      "final-retained-closeout-completion-ledger:browser.active_tab_info:bc1",
    sanitizedOperatorFinalRetainedCloseoutCompletionAcknowledgementReceiptRef:
      "operator-final-retained-closeout-completion-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedCloseoutCompletionAcknowledgementRef:
      "operator-final-retained-closeout-completion:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task386 active tab info final retained completion closeout ledger", () => {
  it("builds a minimal redacted final retained completion closeout ledger without release or activation readiness", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger({
        operatorFinalRetainedCloseoutCompletionAcknowledgementReceipt:
          READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_COMPLETION_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedCompletionCloseoutLedgerRef:
          "final-retained-completion-closeout-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedCompletionCloseoutRef:
          "final-retained-completion-closeout:active-tab-info:ack:001",
      })

    expect(ledger).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-closeout-ledger.v1",
      method: "browser.active_tab_info",
      status: "final_retained_completion_closeout_ledger_ready",
      reasonCode:
        "active_tab_info_final_retained_completion_closeout_ledger_ready",
      ledger: {
        finalRetainedCompletionCloseoutLedgerId:
          "final-retained-completion-closeout-ledger:browser.active_tab_info:7b7",
        operatorFinalRetainedCloseoutCompletionAcknowledgementReceiptId:
          "operator-final-retained-closeout-completion-acknowledgement-receipt:browser.active_tab_info:8ae",
        sanitizedFinalRetainedCompletionCloseoutLedgerRef:
          "final-retained-completion-closeout-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedCompletionCloseoutRef:
          "final-retained-completion-closeout:active-tab-info:ack:001",
        ledgerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator final retained closeout completion acknowledgement receipt and unsafe refs", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger({
        operatorFinalRetainedCloseoutCompletionAcknowledgementReceipt: {
          ...READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_COMPLETION_ACKNOWLEDGEMENT_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedCompletionCloseoutLedgerRef:
          "https://example.test/ledger?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedCompletionCloseoutRef: "",
      })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_completion_closeout_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_completion_closeout_ledger_receipt_not_ready",
      "final_retained_completion_closeout_ledger_ref_invalid",
      "final_retained_completion_closeout_ledger_product_log_evidence_ref_invalid",
      "final_retained_completion_closeout_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger({
        operatorFinalRetainedCloseoutCompletionAcknowledgementReceipt:
          READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_COMPLETION_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedCompletionCloseoutLedgerRef:
          "final-retained-completion-closeout-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedCompletionCloseoutRef:
          "final-retained-completion-closeout:active-tab-info:ack:001",
      })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
