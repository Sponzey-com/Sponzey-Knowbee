import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger.ts"

const READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt.v1",
  method: "browser.active_tab_info",
  status:
    "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ready",
  receipt: {
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId:
      "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt:browser.active_tab_info:e0f",
    finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId:
      "final-retained-acknowledgement-completion-closeout-acknowledgement-ledger:browser.active_tab_info:723",
    sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptRef:
      "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef:
      "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task434 active tab info final retained acknowledgement completion closeout acknowledgement closure ledger", () => {
  it("builds a code-only final retained acknowledgement completion closeout acknowledgement closure ledger without release or activation readiness", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger({
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt:
          READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_RECEIPT,
        sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef:
          "final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureRef:
          "final-retained-acknowledgement-completion-closeout-acknowledgement-closure:active-tab-info:ack:001",
      })

    expect(ledger).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger.v1",
      method: "browser.active_tab_info",
      status:
        "final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ready",
      reasonCode:
        "active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ready",
      ledger: {
        finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerId:
          "final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger:browser.active_tab_info:b33",
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptId:
          "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt:browser.active_tab_info:e0f",
        sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef:
          "final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureRef:
          "final-retained-acknowledgement-completion-closeout-acknowledgement-closure:active-tab-info:ack:001",
        ledgerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator final retained acknowledgement completion closeout acknowledgement ledger receipt and unsafe refs", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger({
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt: {
          ...READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef:
          "https://example.test/ledger?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureRef: "",
      })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_receipt_not_ready",
      "final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ref_invalid",
      "final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_product_log_evidence_ref_invalid",
      "final_retained_acknowledgement_completion_closeout_acknowledgement_closure_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedger({
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt:
          READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER_RECEIPT,
        sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureLedgerRef:
          "final-retained-acknowledgement-completion-closeout-acknowledgement-closure-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedAcknowledgementCompletionCloseoutAcknowledgementClosureRef:
          "final-retained-acknowledgement-completion-closeout-acknowledgement-closure:active-tab-info:ack:001",
      })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
