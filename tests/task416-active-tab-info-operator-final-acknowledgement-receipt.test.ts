import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-completion-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-acknowledgement-receipt.ts"

const READY_FINAL_COMPLETION_LEDGER: YeonjangBrowserActiveTabInfoFinalCompletionLedger = {
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
}

describe("task416 active tab info operator final acknowledgement receipt", () => {
  it("builds a minimal redacted operator final acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt({
        finalCompletionLedger: READY_FINAL_COMPLETION_LEDGER,
        sanitizedOperatorFinalAcknowledgementReceiptRef:
          "operator-final-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalAcknowledgementRef:
          "operator-final-acknowledgement:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_final_acknowledgement_receipt_ready",
      reasonCode: "active_tab_info_operator_final_acknowledgement_receipt_ready",
      receipt: {
        operatorFinalAcknowledgementReceiptId:
          "operator-final-acknowledgement-receipt:browser.active_tab_info:fb2",
        finalCompletionLedgerId:
          "final-completion-ledger:browser.active_tab_info:158",
        sanitizedOperatorFinalAcknowledgementReceiptRef:
          "operator-final-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalAcknowledgementRef:
          "operator-final-acknowledgement:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final completion ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt({
        finalCompletionLedger: {
          ...READY_FINAL_COMPLETION_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_acknowledgement_receipt_ledger_not_ready",
      "operator_final_acknowledgement_receipt_ref_invalid",
      "operator_final_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_final_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt({
        finalCompletionLedger: READY_FINAL_COMPLETION_LEDGER,
        sanitizedOperatorFinalAcknowledgementReceiptRef:
          "operator-final-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalAcknowledgementRef:
          "operator-final-acknowledgement:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
