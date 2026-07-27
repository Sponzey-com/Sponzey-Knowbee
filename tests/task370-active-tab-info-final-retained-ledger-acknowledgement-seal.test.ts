import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-ledger-acknowledgement-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-ledger-acknowledgement-seal.ts"

const READY_OPERATOR_RETAINED_LEDGER_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorRetainedLedgerAcknowledgementReceipt = {
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
}

describe("task370 active tab info final retained ledger acknowledgement seal", () => {
  it("builds a minimal redacted final retained ledger acknowledgement seal without release or activation readiness", () => {
    const seal =
      buildYeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal({
        operatorRetainedLedgerAcknowledgementReceipt:
          READY_OPERATOR_RETAINED_LEDGER_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedLedgerAcknowledgementSealRef:
          "final-retained-ledger-acknowledgement-seal:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedLedgerAcknowledgementRef:
          "final-retained-ledger:active-tab-info:ack:001",
      })

    expect(seal).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-retained-ledger-acknowledgement-seal.v1",
      method: "browser.active_tab_info",
      status: "final_retained_ledger_acknowledgement_seal_ready",
      reasonCode:
        "active_tab_info_final_retained_ledger_acknowledgement_seal_ready",
      seal: {
        finalRetainedLedgerAcknowledgementSealId:
          "final-retained-ledger-acknowledgement-seal:browser.active_tab_info:170",
        operatorRetainedLedgerAcknowledgementReceiptId:
          "operator-retained-ledger-acknowledgement-receipt:browser.active_tab_info:d20",
        sanitizedFinalRetainedLedgerAcknowledgementSealRef:
          "final-retained-ledger-acknowledgement-seal:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedLedgerAcknowledgementRef:
          "final-retained-ledger:active-tab-info:ack:001",
        sealStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator retained ledger acknowledgement receipt and unsafe refs", () => {
    const seal =
      buildYeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal({
        operatorRetainedLedgerAcknowledgementReceipt: {
          ...READY_OPERATOR_RETAINED_LEDGER_ACKNOWLEDGEMENT_RECEIPT,
          status: "blocked",
          receipt: undefined,
        },
        sanitizedFinalRetainedLedgerAcknowledgementSealRef:
          "https://example.test/seal?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        finalRetainedLedgerAcknowledgementRef: "",
      })

    expect(seal.status).toBe("blocked")
    expect(seal.reasonCode).toBe(
      "active_tab_info_final_retained_ledger_acknowledgement_seal_blocked",
    )
    expect(seal.blockingReasonCodes).toEqual([
      "final_retained_ledger_acknowledgement_seal_receipt_not_ready",
      "final_retained_ledger_acknowledgement_seal_ref_invalid",
      "final_retained_ledger_acknowledgement_seal_product_log_evidence_ref_invalid",
      "final_retained_ledger_acknowledgement_seal_ack_ref_invalid",
    ])
    expect(seal.seal).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const seal =
      buildYeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal({
        operatorRetainedLedgerAcknowledgementReceipt:
          READY_OPERATOR_RETAINED_LEDGER_ACKNOWLEDGEMENT_RECEIPT,
        sanitizedFinalRetainedLedgerAcknowledgementSealRef:
          "final-retained-ledger-acknowledgement-seal:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalRetainedLedgerAcknowledgementRef:
          "final-retained-ledger:active-tab-info:ack:001",
      })

    expect(JSON.stringify(seal)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
