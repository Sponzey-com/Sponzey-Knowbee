import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-closeout-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-closeout-completion-ledger.ts"

const READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_retained_closeout_acknowledgement_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_retained_closeout_acknowledgement_receipt_ready",
  receipt: {
    operatorFinalRetainedCloseoutAcknowledgementReceiptId:
      "operator-final-retained-closeout-acknowledgement-receipt:browser.active_tab_info:31f",
    finalRetainedCloseoutAcknowledgementLedgerId:
      "final-retained-closeout-acknowledgement-ledger:browser.active_tab_info:b87",
    sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef:
      "operator-final-retained-closeout-acknowledgement-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedCloseoutAcknowledgementRef:
      "operator-final-retained-closeout:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task382 active tab info final retained closeout completion ledger", () => {
  it("builds a minimal redacted final retained closeout completion ledger without release or activation readiness", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger({
        operatorFinalRetainedCloseoutAcknowledgementReceipt:
          READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedCloseoutCompletionLedgerRef:
          "final-retained-closeout-completion-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedCloseoutCompletionRef:
          "final-retained-closeout-completion:active-tab-info:ack:001",
      })

    expect(ledger).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-retained-closeout-completion-ledger.v1",
      method: "browser.active_tab_info",
      status: "final_retained_closeout_completion_ledger_ready",
      reasonCode:
        "active_tab_info_final_retained_closeout_completion_ledger_ready",
      ledger: {
        finalRetainedCloseoutCompletionLedgerId:
          "final-retained-closeout-completion-ledger:browser.active_tab_info:bc1",
        operatorFinalRetainedCloseoutAcknowledgementReceiptId:
          "operator-final-retained-closeout-acknowledgement-receipt:browser.active_tab_info:31f",
        sanitizedFinalRetainedCloseoutCompletionLedgerRef:
          "final-retained-closeout-completion-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedCloseoutCompletionRef:
          "final-retained-closeout-completion:active-tab-info:ack:001",
        ledgerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator final retained closeout acknowledgement receipt and unsafe refs", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger({
        operatorFinalRetainedCloseoutAcknowledgementReceipt: {
          ...READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedCloseoutCompletionLedgerRef:
          "https://example.test/ledger?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedCloseoutCompletionRef: "",
      })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_closeout_completion_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_closeout_completion_ledger_receipt_not_ready",
      "final_retained_closeout_completion_ledger_ref_invalid",
      "final_retained_closeout_completion_ledger_product_log_evidence_ref_invalid",
      "final_retained_closeout_completion_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedCloseoutCompletionLedger({
        operatorFinalRetainedCloseoutAcknowledgementReceipt:
          READY_OPERATOR_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedCloseoutCompletionLedgerRef:
          "final-retained-closeout-completion-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedCloseoutCompletionRef:
          "final-retained-closeout-completion:active-tab-info:ack:001",
      })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
