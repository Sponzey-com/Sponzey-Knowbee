import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-index-retention-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalRetentionClosureLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-retention-closure-ledger.ts"

const READY_OPERATOR_FINAL_INDEX_RETENTION_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalIndexRetentionReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-index-retention-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_index_retention_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_index_retention_receipt_ready",
  receipt: {
    operatorFinalIndexRetentionReceiptId:
      "operator-final-index-retention-receipt:browser.active_tab_info:394",
    finalOperatorCloseoutIndexId:
      "final-operator-closeout-index:browser.active_tab_info:d25",
    sanitizedOperatorFinalIndexRetentionReceiptRef:
      "operator-final-index-retention-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalIndexRetentionReceiptRef:
      "operator-final-index-retention:active-tab-info:receipt:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task338 active tab info final retention closure ledger", () => {
  it("builds a minimal redacted final retention closure ledger without release or activation readiness", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalRetentionClosureLedger({
      operatorFinalIndexRetentionReceipt:
        READY_OPERATOR_FINAL_INDEX_RETENTION_RECEIPT,
      sanitizedFinalRetentionClosureLedgerRef:
        "final-retention-closure-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalRetentionClosureAcknowledgementRef:
        "final-retention-closure:active-tab-info:ack:001",
    })

    expect(ledger).toEqual({
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
    })
  })

  it("blocks unready operator final index retention receipt and unsafe refs", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalRetentionClosureLedger({
      operatorFinalIndexRetentionReceipt: {
        ...READY_OPERATOR_FINAL_INDEX_RETENTION_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedFinalRetentionClosureLedgerRef:
        "https://example.test/ledger?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      finalRetentionClosureAcknowledgementRef: "",
    })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_retention_closure_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_retention_closure_ledger_receipt_not_ready",
      "final_retention_closure_ledger_ref_invalid",
      "final_retention_closure_ledger_product_log_evidence_ref_invalid",
      "final_retention_closure_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalRetentionClosureLedger({
      operatorFinalIndexRetentionReceipt:
        READY_OPERATOR_FINAL_INDEX_RETENTION_RECEIPT,
      sanitizedFinalRetentionClosureLedgerRef:
        "final-retention-closure-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalRetentionClosureAcknowledgementRef:
        "final-retention-closure:active-tab-info:ack:001",
    })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
