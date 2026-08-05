import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retained-ledger-acknowledgement-seal.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-retained-seal-acknowledgement-receipt.ts"

const READY_FINAL_RETAINED_LEDGER_ACKNOWLEDGEMENT_SEAL: YeonjangBrowserActiveTabInfoFinalRetainedLedgerAcknowledgementSeal = {
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
}

describe("task372 active tab info operator retained seal acknowledgement receipt", () => {
  it("builds a minimal redacted operator retained seal acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt({
        finalRetainedLedgerAcknowledgementSeal:
          READY_FINAL_RETAINED_LEDGER_ACKNOWLEDGEMENT_SEAL,
        sanitizedOperatorRetainedSealAcknowledgementReceiptRef:
          "operator-retained-seal-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedSealAcknowledgementRef:
          "operator-retained-seal:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-retained-seal-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_retained_seal_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_retained_seal_acknowledgement_receipt_ready",
      receipt: {
        operatorRetainedSealAcknowledgementReceiptId:
          "operator-retained-seal-acknowledgement-receipt:browser.active_tab_info:53e",
        finalRetainedLedgerAcknowledgementSealId:
          "final-retained-ledger-acknowledgement-seal:browser.active_tab_info:170",
        sanitizedOperatorRetainedSealAcknowledgementReceiptRef:
          "operator-retained-seal-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedSealAcknowledgementRef:
          "operator-retained-seal:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retained ledger acknowledgement seal and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt({
        finalRetainedLedgerAcknowledgementSeal: {
          ...READY_FINAL_RETAINED_LEDGER_ACKNOWLEDGEMENT_SEAL,
          status: "blocked",
          seal: undefined,
        },
        sanitizedOperatorRetainedSealAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorRetainedSealAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_retained_seal_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_retained_seal_acknowledgement_receipt_seal_not_ready",
      "operator_retained_seal_acknowledgement_receipt_ref_invalid",
      "operator_retained_seal_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_retained_seal_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorRetainedSealAcknowledgementReceipt({
        finalRetainedLedgerAcknowledgementSeal:
          READY_FINAL_RETAINED_LEDGER_ACKNOWLEDGEMENT_SEAL,
        sanitizedOperatorRetainedSealAcknowledgementReceiptRef:
          "operator-retained-seal-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorRetainedSealAcknowledgementRef:
          "operator-retained-seal:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
