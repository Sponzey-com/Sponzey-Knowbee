import { describe, expect, it } from "vitest"

import type {
  YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-transfer-closeout-ledger.ts"
import {
  buildYeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-operator-final-transfer-acknowledgement-receipt.ts"

const READY_FINAL_TRANSFER_CLOSEOUT_LEDGER: YeonjangBrowserActiveTabInfoFinalTransferCloseoutLedger = {
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
}

describe("task348 active tab info operator final transfer acknowledgement receipt", () => {
  it("builds a minimal redacted operator final transfer acknowledgement receipt without release or activation readiness", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt({
      finalTransferCloseoutLedger:
        READY_FINAL_TRANSFER_CLOSEOUT_LEDGER,
      sanitizedOperatorFinalTransferAcknowledgementReceiptRef:
        "operator-final-transfer-acknowledgement-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorFinalTransferAcknowledgementRef:
        "operator-final-transfer:active-tab-info:ack:001",
    })

    expect(receipt).toEqual({
      schemaVersion:
        "knowbee.yeonjang-browser-active-tab-info-operator-final-transfer-acknowledgement-receipt.v1",
      method: "browser.active_tab_info",
      status: "operator_final_transfer_acknowledgement_receipt_ready",
      reasonCode:
        "active_tab_info_operator_final_transfer_acknowledgement_receipt_ready",
      receipt: {
        operatorFinalTransferAcknowledgementReceiptId:
          "operator-final-transfer-acknowledgement-receipt:browser.active_tab_info:b20",
        finalTransferCloseoutLedgerId:
          "final-transfer-closeout-ledger:browser.active_tab_info:b00",
        sanitizedOperatorFinalTransferAcknowledgementReceiptRef:
          "operator-final-transfer-acknowledgement-receipt:active-tab-info:sanitized:001",
        productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
        operatorFinalTransferAcknowledgementRef:
          "operator-final-transfer:active-tab-info:ack:001",
        receiptStatus: "ready",
      },
      releaseReadinessNow: false,
      publicationReadinessNow: false,
      enableSkillMappingNow: false,
      addProductionBindingNow: false,
      enableDefaultLiveSmokeNow: false,
    })
  })

  it("blocks unready final transfer closeout ledger and unsafe refs", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt({
      finalTransferCloseoutLedger: {
        ...READY_FINAL_TRANSFER_CLOSEOUT_LEDGER,
        status: "blocked",
        ledger: undefined,
      },
      sanitizedOperatorFinalTransferAcknowledgementReceiptRef:
        "https://example.test/receipt?token=secret",
      productLogEvidenceRef: "/Users/private/product-log.json",
      operatorFinalTransferAcknowledgementRef: "",
    })

    expect(receipt.status).toBe("blocked")
    expect(receipt.reasonCode).toBe(
      "active_tab_info_operator_final_transfer_acknowledgement_receipt_blocked",
    )
    expect(receipt.blockingReasonCodes).toEqual([
      "operator_final_transfer_acknowledgement_receipt_ledger_not_ready",
      "operator_final_transfer_acknowledgement_receipt_ref_invalid",
      "operator_final_transfer_acknowledgement_receipt_product_log_evidence_ref_invalid",
      "operator_final_transfer_acknowledgement_receipt_ack_ref_invalid",
    ])
    expect(receipt.receipt).toBeUndefined()
  })

  it("does not expose raw browser data, local paths, operator proof, or downstream activation ids", () => {
    const receipt = buildYeonjangBrowserActiveTabInfoOperatorFinalTransferAcknowledgementReceipt({
      finalTransferCloseoutLedger:
        READY_FINAL_TRANSFER_CLOSEOUT_LEDGER,
      sanitizedOperatorFinalTransferAcknowledgementReceiptRef:
        "operator-final-transfer-acknowledgement-receipt:active-tab-info:sanitized:001",
      productLogEvidenceRef: "product-log:active-tab-info:evidence:001",
      operatorFinalTransferAcknowledgementRef:
        "operator-final-transfer:active-tab-info:ack:001",
    })

    expect(JSON.stringify(receipt)).not.toMatch(
      /Private Ticket|raw response|response body|https?:\/\/|\/Users\/|token=|raw reasoning|operator-live-proof|raw browser|raw tab|skill-mapping-activation|production-binding-mutation|default-live-smoke-run|release readiness|publication readiness/iu,
    )
  })
})
