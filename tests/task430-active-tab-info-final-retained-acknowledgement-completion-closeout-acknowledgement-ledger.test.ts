import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-closeout-acknowledgement-ledger.ts"

const READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status:
    "operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_acknowledgement_receipt_ready",
  receipt: {
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptId:
      "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt:browser.active_tab_info:4d7",
    finalRetainedAcknowledgementCompletionCloseoutLedgerId:
      "final-retained-acknowledgement-completion-closeout-ledger:browser.active_tab_info:bcd",
    sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceiptRef:
      "operator-final-retained-acknowledgement-completion-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef:
      "operator-final-retained-acknowledgement-completion-closeout-acknowledgement:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task430 active tab info final retained acknowledgement completion closeout acknowledgement ledger", () => {
  it("builds a minimal redacted final retained acknowledgement completion closeout acknowledgement ledger without release or activation readiness", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger({
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt:
          READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef:
          "final-retained-acknowledgement-completion-closeout-acknowledgement-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef:
          "final-retained-acknowledgement-completion-closeout-acknowledgement:active-tab-info:ack:001",
      })

    expect(ledger).toEqual({
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
    })
  })

  it("blocks unready operator final retained acknowledgement completion closeout acknowledgement receipt and unsafe refs", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger({
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt: {
          ...READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef:
          "https://example.test/ledger?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef: "",
      })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_receipt_not_ready",
      "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ref_invalid",
      "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_product_log_evidence_ref_invalid",
      "final_retained_acknowledgement_completion_closeout_acknowledgement_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedger({
        operatorFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementReceipt:
          READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedAcknowledgementCompletionCloseoutAcknowledgementLedgerRef:
          "final-retained-acknowledgement-completion-closeout-acknowledgement-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedAcknowledgementCompletionCloseoutAcknowledgementRef:
          "final-retained-acknowledgement-completion-closeout-acknowledgement:active-tab-info:ack:001",
      })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
