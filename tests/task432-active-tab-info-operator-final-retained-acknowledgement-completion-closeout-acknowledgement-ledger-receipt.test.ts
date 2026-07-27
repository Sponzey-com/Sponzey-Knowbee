import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt.ts"

const READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger.v1",
  method: "browser.active_tab_info",
  status:
    "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ready",
  ledger: {
    finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerId:
      "final-retained-acknowledgement-completion-closeout-acknowledgement-ledger:browser.active_tab_info:723",
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId:
      "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt:browser.active_tab_info:4d7",
    sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef:
      "final-retained-acknowledgement-completion-closeout-acknowledgement-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef:
      "final-retained-acknowledgement-completion-closeout-acknowledgement:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task432 active tab info operator final retained acknowledgement completion closeout acknowledgement ledger receipt", () => {
  it("builds a minimal redacted operator final retained acknowledgement completion closeout acknowledgement ledger receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt({
        finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger:
          READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER,
        sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptRef:
          "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef:
          "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
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
    })
  })

  it("blocks unready final retained acknowledgement completion closeout acknowledgement ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt({
        finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger: {
          ...READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef:
          "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ledger_not_ready",
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ref_invalid",
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_product_log_evidence_ref_invalid",
      "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceipt({
        finalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger:
          READY_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_LEDGER,
        sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerReceiptRef:
          "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef:
          "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
