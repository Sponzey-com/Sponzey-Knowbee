import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoFinalAcknowledgementLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-acknowledgement-ledger.ts"
import type {
  YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-acknowledgement-receipt.ts"

const READY_OPERATOR_FINAL_ACKNOWLEDGEMENT_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalAcknowledgementReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-acknowledgement-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_acknowledgement_receipt_ready",
  reasonCode: "active_tab_info_operator_final_acknowledgement_receipt_ready",
  receipt: {
    operatorFinalAcknowledgementReceiptId:
      "operator-final-acknowledgement-receipt:browser.active_tab_info:fb2",
    finalCompletionLedgerId: "final-completion-ledger:browser.active_tab_info:158",
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
}

describe("task418 active tab info final acknowledgement ledger", () => {
  it("builds a minimal redacted final acknowledgement ledger without release or activation readiness", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalAcknowledgementLedger({
      operatorFinalAcknowledgementReceipt:
        READY_OPERATOR_FINAL_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedFinalAcknowledgementLedgerRef:
        "final-acknowledgement-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalAcknowledgementRef:
        "final-acknowledgement:active-tab-info:ack:001",
    })

    expect(ledger).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-acknowledgement-ledger.v1",
      method: "browser.active_tab_info",
      status: "final_acknowledgement_ledger_ready",
      reasonCode: "active_tab_info_final_acknowledgement_ledger_ready",
      ledger: {
        finalAcknowledgementLedgerId:
          "final-acknowledgement-ledger:browser.active_tab_info:828",
        operatorFinalAcknowledgementReceiptId:
          "operator-final-acknowledgement-receipt:browser.active_tab_info:fb2",
        sanitizedFinalAcknowledgementLedgerRef:
          "final-acknowledgement-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalAcknowledgementRef:
          "final-acknowledgement:active-tab-info:ack:001",
        ledgerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator final acknowledgement receipt and unsafe refs", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalAcknowledgementLedger({
      operatorFinalAcknowledgementReceipt: {
        ...READY_OPERATOR_FINAL_ACKNOWLEDGEMENT_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedFinalAcknowledgementLedgerRef:
        "https://example.test/ledger?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      finalAcknowledgementRef: "",
    })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_acknowledgement_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_acknowledgement_ledger_receipt_not_ready",
      "final_acknowledgement_ledger_ref_invalid",
      "final_acknowledgement_ledger_product_log_evidence_ref_invalid",
      "final_acknowledgement_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalAcknowledgementLedger({
      operatorFinalAcknowledgementReceipt:
        READY_OPERATOR_FINAL_ACKNOWLEDGEMENT_RECEIPT,
      sanitizedFinalAcknowledgementLedgerRef:
        "final-acknowledgement-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalAcknowledgementRef:
        "final-acknowledgement:active-tab-info:ack:001",
    })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
