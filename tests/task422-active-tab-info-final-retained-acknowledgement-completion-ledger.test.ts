import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-ledger.ts"

const READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_retained_acknowledgement_completion_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_retained_acknowledgement_completion_receipt_ready",
  receipt: {
    operatorFinalRetainedAcknowledgementCompletionReceiptId:
      "operator-final-retained-acknowledgement-completion-receipt:browser.active_tab_info:d21",
    finalAcknowledgementLedgerId:
      "final-acknowledgement-ledger:browser.active_tab_info:828",
    sanitizedOperatorFinalRetainedAcknowledgementCompletionReceiptRef:
      "operator-final-retained-acknowledgement-completion-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalRetainedAcknowledgementCompletionRef:
      "operator-final-retained-acknowledgement-completion:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task422 active tab info final retained acknowledgement completion ledger", () => {
  it("builds a minimal redacted final retained acknowledgement completion ledger without release or activation readiness", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger({
        operatorFinalRetainedAcknowledgementCompletionReceipt:
          READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_RECEIPT,
        sanitizedFinalRetainedAcknowledgementCompletionLedgerRef:
          "final-retained-acknowledgement-completion-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedAcknowledgementCompletionRef:
          "final-retained-acknowledgement-completion:active-tab-info:ack:001",
      })

    expect(ledger).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-ledger.v1",
      method: "browser.active_tab_info",
      status: "final_retained_acknowledgement_completion_ledger_ready",
      reasonCode:
        "active_tab_info_final_retained_acknowledgement_completion_ledger_ready",
      ledger: {
        finalRetainedAcknowledgementCompletionLedgerId:
          "final-retained-acknowledgement-completion-ledger:browser.active_tab_info:799",
        operatorFinalRetainedAcknowledgementCompletionReceiptId:
          "operator-final-retained-acknowledgement-completion-receipt:browser.active_tab_info:d21",
        sanitizedFinalRetainedAcknowledgementCompletionLedgerRef:
          "final-retained-acknowledgement-completion-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedAcknowledgementCompletionRef:
          "final-retained-acknowledgement-completion:active-tab-info:ack:001",
        ledgerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator final retained acknowledgement completion receipt and unsafe refs", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger({
        operatorFinalRetainedAcknowledgementCompletionReceipt: {
          ...READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedAcknowledgementCompletionLedgerRef:
          "https://example.test/ledger?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedAcknowledgementCompletionRef: "",
      })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retained_acknowledgement_completion_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retained_acknowledgement_completion_ledger_receipt_not_ready",
      "final_retained_acknowledgement_completion_ledger_ref_invalid",
      "final_retained_acknowledgement_completion_ledger_product_log_evidence_ref_invalid",
      "final_retained_acknowledgement_completion_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger =
      buildYeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger({
        operatorFinalRetainedAcknowledgementCompletionReceipt:
          READY_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_RECEIPT,
        sanitizedFinalRetainedAcknowledgementCompletionLedgerRef:
          "final-retained-acknowledgement-completion-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedAcknowledgementCompletionRef:
          "final-retained-acknowledgement-completion:active-tab-info:ack:001",
      })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
