import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger,
} from "./yeonjang-browser-active-tab-info-final-retained-acknowledgement-ledger.js"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptBlockingReasonCode =
  | "operator_final_retained_acknowledgement_receipt_ledger_not_ready"
  | "operator_final_retained_acknowledgement_receipt_ref_invalid"
  | "operator_final_retained_acknowledgement_receipt_product_log_evidence_ref_invalid"
  | "operator_final_retained_acknowledgement_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptInput {
  finalRetainedAcknowledgementLedger: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger
  sanitizedOperatorFinalRetainedAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-receipt.v1"
  method: "browser.active_tab_info"
  status: "operator_final_retained_acknowledgement_receipt_ready" | "blocked"
  reasonCode:
    | "active_tab_info_operator_final_retained_acknowledgement_receipt_ready"
    | "active_tab_info_operator_final_retained_acknowledgement_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorFinalRetainedAcknowledgementReceiptId: string
    finalRetainedAcknowledgementLedgerId: string
    sanitizedOperatorFinalRetainedAcknowledgementReceiptRef: string
    productLogEvidenceRef: string
    operatorFinalRetainedAcknowledgementRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN =
  /^operator-final-retained-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_REF_PATTERN =
  /^operator-final-retained-acknowledgement:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalRetainedAcknowledgementLedgerId(
  ledger: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementLedger,
): string | undefined {
  if (
    ledger.status !== "final_retained_acknowledgement_ledger_ready" ||
    ledger.ledger === undefined
  ) {
    return undefined
  }
  return ledger.ledger.finalRetainedAcknowledgementLedgerId
}

function buildOperatorFinalRetainedAcknowledgementReceiptId(input: {
  finalRetainedAcknowledgementLedgerId: string
  sanitizedOperatorFinalRetainedAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedAcknowledgementRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalRetainedAcknowledgementLedgerId,
    input.sanitizedOperatorFinalRetainedAcknowledgementReceiptRef,
    input.productLogEvidenceRef,
    input.operatorFinalRetainedAcknowledgementRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-final-retained-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementReceiptBlockingReasonCode[] = []
  const finalRetainedAcknowledgementLedgerId =
    extractFinalRetainedAcknowledgementLedgerId(
      input.finalRetainedAcknowledgementLedger,
    )
  if (finalRetainedAcknowledgementLedgerId === undefined) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_receipt_ledger_not_ready",
    )
  }
  const sanitizedOperatorFinalRetainedAcknowledgementReceiptRef =
    input.sanitizedOperatorFinalRetainedAcknowledgementReceiptRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetainedAcknowledgementReceiptRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_receipt_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_receipt_product_log_evidence_ref_invalid",
    )
  }
  const operatorFinalRetainedAcknowledgementRef =
    input.operatorFinalRetainedAcknowledgementRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorFinalRetainedAcknowledgementRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_receipt_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    finalRetainedAcknowledgementLedgerId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_operator_final_retained_acknowledgement_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status: "operator_final_retained_acknowledgement_receipt_ready",
    reasonCode:
      "active_tab_info_operator_final_retained_acknowledgement_receipt_ready",
    receipt: Object.freeze({
      operatorFinalRetainedAcknowledgementReceiptId:
        buildOperatorFinalRetainedAcknowledgementReceiptId({
          finalRetainedAcknowledgementLedgerId,
          sanitizedOperatorFinalRetainedAcknowledgementReceiptRef,
          productLogEvidenceRef,
          operatorFinalRetainedAcknowledgementRef,
          receiptStatus,
        }),
      finalRetainedAcknowledgementLedgerId,
      sanitizedOperatorFinalRetainedAcknowledgementReceiptRef,
      productLogEvidenceRef,
      operatorFinalRetainedAcknowledgementRef,
      receiptStatus,
    }),
  })
}
