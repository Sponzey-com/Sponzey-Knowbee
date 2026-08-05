import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-completion-acknowledgement-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-ledger-acknowledgement-receipt.ts"

const READY_FINAL_RETAINED_COMPLETION_ACKNOWLEDGEMENT_LEDGER: YeonjangBrowserActiveTabInfoFinalRetainedCompletionAcknowledgementLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retained-completion-acknowledgement-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retained_completion_acknowledgement_ledger_ready",
  reasonCode:
    "active_tab_info_final_retained_completion_acknowledgement_ledger_ready",
  ledger: {
    finalRetainedCompletionAcknowledgementLedgerId:
      "final-retained-completion-acknowledgement-ledger:browser.active_tab_info:6e8",
    operatorRetainedCompletionAcknowledgementReceiptId:
      "operator-retained-completion-acknowledgement-receipt:browser.active_tab_info:fd3",
    sanitizedFinalRetainedCompletionAcknowledgementLedgerRef:
      "final-retained-completion-acknowledgement-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetainedCompletionAcknowledgementRef:
      "final-retained-completion:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task368 active tab info operator retained ledger acknowledgement receipt", () => {
  it("builds a minimal redacted operator retained ledger acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt({
        finalRetainedCompletionAcknowledgementLedger:
          READY_FINAL_RETAINED_COMPLETION_ACKNOWLEDGEMENT_LEDGER,
        sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef:
          "operator-retained-ledger-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedLedgerAcknowledgementRef:
          "operator-retained-ledger:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-retained-ledger-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_retained_ledger_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_retained_ledger_acknowledgement_receipt_ready",
      receipt: {
        operatorRetainedLedgerAcknowledgementReceiptId:
          "operator-retained-ledger-acknowledgement-receipt:browser.active_tab_info:d20",
        finalRetainedCompletionAcknowledgementLedgerId:
          "final-retained-completion-acknowledgement-ledger:browser.active_tab_info:6e8",
        sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef:
          "operator-retained-ledger-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedLedgerAcknowledgementRef:
          "operator-retained-ledger:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained completion acknowledgement ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt({
        finalRetainedCompletionAcknowledgementLedger: {
          ...READY_FINAL_RETAINED_COMPLETION_ACKNOWLEDGEMENT_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorRetainedLedgerAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_retained_ledger_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_retained_ledger_acknowledgement_receipt_ledger_not_ready",
      "operator_retained_ledger_acknowledgement_receipt_ref_invalid",
      "operator_retained_ledger_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_retained_ledger_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt({
        finalRetainedCompletionAcknowledgementLedger:
          READY_FINAL_RETAINED_COMPLETION_ACKNOWLEDGEMENT_LEDGER,
        sanitizedOperatorRetainedLedgerAcknowledgementReceiptRef:
          "operator-retained-ledger-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedLedgerAcknowledgementRef:
          "operator-retained-ledger:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
