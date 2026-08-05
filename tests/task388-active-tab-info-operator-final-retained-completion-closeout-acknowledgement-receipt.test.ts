import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-closeout-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-completion-closeout-acknowledgement-receipt.ts"

const READY_FINAL_RETAINED_COMPLETION_CLOSEOUT_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger = {
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
}

describe("task388 active tab info operator final retained completion closeout acknowledgement receipt", () => {
  it("builds a minimal redacted operator final retained completion closeout acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt({
        finalRetainedCompletionCloseoutLedger:
          READY_FINAL_RETAINED_COMPLETION_CLOSEOUT_LEDGER,
        sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef:
          "operator-final-retained-completion-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCompletionCloseoutAcknowledgementRef:
          "operator-final-retained-completion-closeout:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-completion-closeout-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status:
        "operator_final_retained_completion_closeout_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_retained_completion_closeout_acknowledgement_receipt_ready",
      receipt: {
        operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId:
          "operator-final-retained-completion-closeout-acknowledgement-receipt:browser.active_tab_info:016",
        finalRetainedCompletionCloseoutLedgerId:
          "final-retained-completion-closeout-ledger:browser.active_tab_info:7b7",
        sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef:
          "operator-final-retained-completion-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCompletionCloseoutAcknowledgementRef:
          "operator-final-retained-completion-closeout:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained completion closeout ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt({
        finalRetainedCompletionCloseoutLedger: {
          ...READY_FINAL_RETAINED_COMPLETION_CLOSEOUT_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalRetainedCompletionCloseoutAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_retained_completion_closeout_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_retained_completion_closeout_acknowledgement_receipt_ledger_not_ready",
      "operator_final_retained_completion_closeout_acknowledgement_receipt_ref_invalid",
      "operator_final_retained_completion_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_final_retained_completion_closeout_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt({
        finalRetainedCompletionCloseoutLedger:
          READY_FINAL_RETAINED_COMPLETION_CLOSEOUT_LEDGER,
        sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef:
          "operator-final-retained-completion-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedCompletionCloseoutAcknowledgementRef:
          "operator-final-retained-completion-closeout:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
