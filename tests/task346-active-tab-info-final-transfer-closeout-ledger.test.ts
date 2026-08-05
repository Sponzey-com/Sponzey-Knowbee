import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-handoff-receipt.ts"
import {
  buildYeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-transfer-closeout-ledger.ts"

const READY_OPERATOR_FINAL_HANDOFF_RECEIPT: YeonjangBrowserActiveTabInfoOperatorFinalHandoffReceipt = {
  schemaVersion:
    "knowbee.yeonjang-browser-active-tab-info-operator-final-handoff-receipt.v1",
  method: "browser.active_tab_info",
  status: "operator_final_handoff_receipt_ready",
  reasonCode:
    "active_tab_info_operator_final_handoff_receipt_ready",
  receipt: {
    operatorFinalHandoffReceiptId:
      "operator-final-handoff-receipt:browser.active_tab_info:a14",
    finalHandoffClosureMarkerId:
      "final-handoff-closure-marker:browser.active_tab_info:cbb",
    sanitizedOperatorFinalHandoffReceiptRef:
      "operator-final-handoff-receipt:active-tab-info:sanitized:001",
    productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
    operatorFinalHandoffAcknowledgementRef:
      "operator-final-handoff:active-tab-info:ack:001",
    receiptStatus: "ready",
  },
  releaseReadinessNow: false,
  publicationReadinessNow: false,
  enableSkillMappingNow: false,
  addProductionBindingNow: false,
  enableDefaultLiveSmokeNow: false,
}

describe("task346 active tab info final transfer closeout ledger", () => {
  it("builds a minimal redacted final transfer closeout ledger without release or activation readiness", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger({
      operatorFinalHandoffReceipt:
        READY_OPERATOR_FINAL_HANDOFF_RECEIPT,
      sanitizedFinalTransferCloseoutLedgerRef:
        "final-transfer-closeout-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalTransferCloseoutAcknowledgementRef:
        "final-transfer-closeout:active-tab-info:ack:001",
    })

    expect(ledger).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-final-transfer-closeout-ledger.v1",
      method: "browser.active_tab_info",
      status: "final_transfer_closeout_ledger_ready",
      reasonCode:
        "active_tab_info_final_transfer_closeout_ledger_ready",
      ledger: {
        finalTransferCloseoutLedgerId:
          "final-transfer-closeout-ledger:browser.active_tab_info:b00",
        operatorFinalHandoffReceiptId:
          "operator-final-handoff-receipt:browser.active_tab_info:a14",
        sanitizedFinalTransferCloseoutLedgerRef:
          "final-transfer-closeout-ledger:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        finalTransferCloseoutAcknowledgementRef:
          "final-transfer-closeout:active-tab-info:ack:001",
        ledgerStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready operator final handoff receipt and unsafe refs", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger({
      operatorFinalHandoffReceipt: {
        ...READY_OPERATOR_FINAL_HANDOFF_RECEIPT,
        status: "blocked",
        receipt: undefined,
      },
      sanitizedFinalTransferCloseoutLedgerRef:
        "https://example.test/ledger?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      finalTransferCloseoutAcknowledgementRef: "",
    })

    expect(ledger.status).toBe("blocked")
    expect(ledger.reasonCode).toBe(
      "active_tab_info_final_transfer_closeout_ledger_blocked",
    )
    expect(ledger.blockingReasonCodes).toEqual([
      "final_transfer_closeout_ledger_receipt_not_ready",
      "final_transfer_closeout_ledger_ref_invalid",
      "final_transfer_closeout_ledger_product_log_evidence_ref_invalid",
      "final_transfer_closeout_ledger_ack_ref_invalid",
    ])
    expect(ledger.ledger).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const ledger = buildYeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger({
      operatorFinalHandoffReceipt:
        READY_OPERATOR_FINAL_HANDOFF_RECEIPT,
      sanitizedFinalTransferCloseoutLedgerRef:
        "final-transfer-closeout-ledger:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      finalTransferCloseoutAcknowledgementRef:
        "final-transfer-closeout:active-tab-info:ack:001",
    })

    expect(JSON.stringify(ledger)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
