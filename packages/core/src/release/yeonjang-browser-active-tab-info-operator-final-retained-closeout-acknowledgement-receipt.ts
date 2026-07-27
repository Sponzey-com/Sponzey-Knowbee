import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger,
} from "./yeonjang-browser-active-tab-info-final-retained-closeout-acknowledgement-ledger.js"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptBlockingReasonCode =
  | "operator_final_retained_closeout_acknowledgement_receipt_ledger_not_ready"
  | "operator_final_retained_closeout_acknowledgement_receipt_ref_invalid"
  | "operator_final_retained_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid"
  | "operator_final_retained_closeout_acknowledgement_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptInput {
  finalRetainedCloseoutAcknowledgementLedger: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger
  sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedCloseoutAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-acknowledgement-receipt.v1"
  method: "browser.active_tab_info"
  status: "operator_final_retained_closeout_acknowledgement_receipt_ready" | "blocked"
  reasonCode:
    | "active_tab_info_operator_final_retained_closeout_acknowledgement_receipt_ready"
    | "active_tab_info_operator_final_retained_closeout_acknowledgement_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorFinalRetainedCloseoutAcknowledgementReceiptId: string
    finalRetainedCloseoutAcknowledgementLedgerId: string
    sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef: string
    productLogEvidenceRef: string
    operatorFinalRetainedCloseoutAcknowledgementRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN =
  /^operator-final-retained-closeout-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN =
  /^operator-final-retained-closeout:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalRetainedCloseoutAcknowledgementLedgerId(
  ledger: YeonjangBrowserActiveTabInfoFinalRetainedCloseoutAcknowledgementLedger,
): string | undefined {
  if (
    ledger.status !== "final_retained_closeout_acknowledgement_ledger_ready" ||
    ledger.ledger === undefined
  ) {
    return undefined
  }
  return ledger.ledger.finalRetainedCloseoutAcknowledgementLedgerId
}

function buildOperatorFinalRetainedCloseoutAcknowledgementReceiptId(input: {
  finalRetainedCloseoutAcknowledgementLedgerId: string
  sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedCloseoutAcknowledgementRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalRetainedCloseoutAcknowledgementLedgerId,
    input.sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef,
    input.productLogEvidenceRef,
    input.operatorFinalRetainedCloseoutAcknowledgementRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-final-retained-closeout-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-closeout-acknowledgement-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCloseoutAcknowledgementReceiptBlockingReasonCode[] = []
  const finalRetainedCloseoutAcknowledgementLedgerId =
    extractFinalRetainedCloseoutAcknowledgementLedgerId(
      input.finalRetainedCloseoutAcknowledgementLedger,
    )
  if (finalRetainedCloseoutAcknowledgementLedgerId === undefined) {
    blockingReasonCodes.push(
      "operator_final_retained_closeout_acknowledgement_receipt_ledger_not_ready",
    )
  }
  const sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef =
    input.sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_closeout_acknowledgement_receipt_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid",
    )
  }
  const operatorFinalRetainedCloseoutAcknowledgementRef =
    input.operatorFinalRetainedCloseoutAcknowledgementRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorFinalRetainedCloseoutAcknowledgementRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_closeout_acknowledgement_receipt_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    finalRetainedCloseoutAcknowledgementLedgerId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_operator_final_retained_closeout_acknowledgement_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status: "operator_final_retained_closeout_acknowledgement_receipt_ready",
    reasonCode:
      "active_tab_info_operator_final_retained_closeout_acknowledgement_receipt_ready",
    receipt: Object.freeze({
      operatorFinalRetainedCloseoutAcknowledgementReceiptId:
        buildOperatorFinalRetainedCloseoutAcknowledgementReceiptId({
          finalRetainedCloseoutAcknowledgementLedgerId,
          sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef,
          productLogEvidenceRef,
          operatorFinalRetainedCloseoutAcknowledgementRef,
          receiptStatus,
        }),
      finalRetainedCloseoutAcknowledgementLedgerId,
      sanitizedOperatorFinalRetainedCloseoutAcknowledgementReceiptRef,
      productLogEvidenceRef,
      operatorFinalRetainedCloseoutAcknowledgementRef,
      receiptStatus,
    }),
  })
}
