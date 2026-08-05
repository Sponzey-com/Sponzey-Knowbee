import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger,
} from "./yeonjang-browser-active-tab-info-final-sealed-archive-closeout-ledger.js"

export type YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptStatus = "ready"

export type YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptBlockingReasonCode =
  | "operator_final_closeout_acknowledgement_receipt_ledger_not_ready"
  | "operator_final_closeout_acknowledgement_receipt_ref_invalid"
  | "operator_final_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid"
  | "operator_final_closeout_acknowledgement_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptInput {
  finalSealedArchiveCloseoutLedger: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger
  sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalCloseoutAcknowledgementReceiptRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-closeout-acknowledgement-receipt.v1"
  method: "browser.active_tab_info"
  status: "operator_final_closeout_acknowledgement_receipt_ready" | "blocked"
  reasonCode:
    | "active_tab_info_operator_final_closeout_acknowledgement_receipt_ready"
    | "active_tab_info_operator_final_closeout_acknowledgement_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorFinalCloseoutAcknowledgementReceiptId: string
    finalSealedArchiveCloseoutLedgerId: string
    sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef: string
    productLogEvidenceRef: string
    operatorFinalCloseoutAcknowledgementReceiptRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_FINAL_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN =
  /^operator-final-closeout-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_FINAL_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT_ACK_REF_PATTERN =
  /^operator-final-closeout:active-tab-info:receipt:[a-z0-9._:-]+$/u

function extractFinalSealedArchiveCloseoutLedgerId(
  ledger: YeonjangBrowserActiveTabInfoFinalSealedArchiveCloseoutLedger,
): string | undefined {
  if (
    ledger.status !== "final_sealed_archive_closeout_ledger_ready" ||
    ledger.ledger === undefined
  ) {
    return undefined
  }
  return ledger.ledger.finalSealedArchiveCloseoutLedgerId
}

function buildOperatorFinalCloseoutAcknowledgementReceiptId(input: {
  finalSealedArchiveCloseoutLedgerId: string
  sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalCloseoutAcknowledgementReceiptRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalSealedArchiveCloseoutLedgerId,
    input.sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef,
    input.productLogEvidenceRef,
    input.operatorFinalCloseoutAcknowledgementReceiptRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-final-closeout-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-final-closeout-acknowledgement-receipt.v1",
    method: "browser.active_tab_info",
    status: input.status,
    reasonCode: input.reasonCode,
    ...(input.blockingReasonCodes === undefined
      ? {}
      : { blockingReasonCodes: Object.freeze([...input.blockingReasonCodes]) }),
    ...(input.receipt === undefined ? {} : { receipt: input.receipt }),
    releaseReadinessNow: false,
    publicationReadinessNow: false,
    enableSkillMappingNow: false,
    addProductionBindingNow: false,
    enableDefaultLiveSmokeNow: false,
  })
}

export function buildYeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorFinalCloseoutAcknowledgementReceiptBlockingReasonCode[] = []
  const finalSealedArchiveCloseoutLedgerId =
    extractFinalSealedArchiveCloseoutLedgerId(input.finalSealedArchiveCloseoutLedger)
  if (finalSealedArchiveCloseoutLedgerId === undefined) {
    blockingReasonCodes.push("operator_final_closeout_acknowledgement_receipt_ledger_not_ready")
  }
  const sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef =
    input.sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef.trim()
  if (!SAFE_OPERATOR_FINAL_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef)) {
    blockingReasonCodes.push("operator_final_closeout_acknowledgement_receipt_ref_invalid")
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push("operator_final_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid")
  }
  const operatorFinalCloseoutAcknowledgementReceiptRef =
    input.operatorFinalCloseoutAcknowledgementReceiptRef.trim()
  if (!SAFE_OPERATOR_FINAL_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT_ACK_REF_PATTERN.test(operatorFinalCloseoutAcknowledgementReceiptRef)) {
    blockingReasonCodes.push("operator_final_closeout_acknowledgement_receipt_ack_ref_invalid")
  }

  if (blockingReasonCodes.length > 0 || finalSealedArchiveCloseoutLedgerId === undefined) {
    return baseResult({
      status: "blocked",
      reasonCode: "active_tab_info_operator_final_closeout_acknowledgement_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status: "operator_final_closeout_acknowledgement_receipt_ready",
    reasonCode: "active_tab_info_operator_final_closeout_acknowledgement_receipt_ready",
    receipt: Object.freeze({
      operatorFinalCloseoutAcknowledgementReceiptId:
        buildOperatorFinalCloseoutAcknowledgementReceiptId({
          finalSealedArchiveCloseoutLedgerId,
          sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef,
          productLogEvidenceRef,
          operatorFinalCloseoutAcknowledgementReceiptRef,
          receiptStatus,
        }),
      finalSealedArchiveCloseoutLedgerId,
      sanitizedOperatorFinalCloseoutAcknowledgementReceiptRef,
      productLogEvidenceRef,
      operatorFinalCloseoutAcknowledgementReceiptRef,
      receiptStatus,
    }),
  })
}
