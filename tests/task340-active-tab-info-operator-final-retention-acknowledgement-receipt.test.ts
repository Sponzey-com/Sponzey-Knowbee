import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalRetentionClosureLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retention-closure-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-retention-acknowledgement-receipt.ts"

const READY_FINAL_RETENTION_CLOSURE_LEDGER: YeonjangBrowserActiveTabInfoFinalRetentionClosureLedger = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-final-retention-closure-ledger.v1",
  method: "browser.active_tab_info",
  status: "final_retention_closure_ledger_ready",
  reasonCode:
    "active_tab_info_final_retention_closure_ledger_ready",
  ledger: {
    finalRetentionClosureLedgerId:
      "final-retention-closure-ledger:browser.active_tab_info:647",
    operatorFinalIndexRetentionReceiptId:
      "operator-final-index-retention-receipt:browser.active_tab_info:394",
    sanitizedFinalRetentionClosureLedgerRef:
      "final-retention-closure-ledger:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    finalRetentionClosureAcknowledgementRef:
      "final-retention-closure:active-tab-info:ack:001",
    ledgerStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task340 active tab info operator final retention acknowledgement receipt", () => {
  it("builds a minimal redacted operator final retention acknowledgement receipt without release or activation readiness", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt({
        finalRetentionClosureLedger:
          READY_FINAL_RETENTION_CLOSURE_LEDGER,
        sanitizedOperatorFinalRetentionAcknowledgementReceiptRef:
          "operator-final-retention-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetentionAcknowledgementRef:
          "operator-final-retention-acknowledgement:active-tab-info:ack:001",
      })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-retention-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_final_retention_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_retention_acknowledgement_receipt_ready",
      receipt: {
        operatorFinalRetentionAcknowledgementReceiptId:
          "operator-final-retention-acknowledgement-receipt:browser.active_tab_info:8b2",
        finalRetentionClosureLedgerId:
          "final-retention-closure-ledger:browser.active_tab_info:647",
        sanitizedOperatorFinalRetentionAcknowledgementReceiptRef:
          "operator-final-retention-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetentionAcknowledgementRef:
          "operator-final-retention-acknowledgement:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final retention closure ledger and unsafe refs", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt({
        finalRetentionClosureLedger: {
          ...READY_FINAL_RETENTION_CLOSURE_LEDGER,
          status: "blocked",
          ledger: undefined,
        },
        sanitizedOperatorFinalRetentionAcknowledgementReceiptRef:
          "https://example.test/receipt?token=secret",
        productLogEvidenceRef: "/Users/private/product-log.json",
        operatorFinalRetentionAcknowledgementRef: "",
      })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_retention_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_retention_acknowledgement_receipt_ledger_not_ready",
      "operator_final_retention_acknowledgement_receipt_ref_invalid",
      "operator_final_retention_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_final_retention_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt =
      buildYeonjangBrowserActiveTabInfoOperatorFinalRetentionAcknowledgementReceipt({
        finalRetentionClosureLedger:
          READY_FINAL_RETENTION_CLOSURE_LEDGER,
        sanitizedOperatorFinalRetentionAcknowledgementReceiptRef:
          "operator-final-retention-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalRetentionAcknowledgementRef:
          "operator-final-retention-acknowledgement:active-tab-info:ack:001",
      })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
