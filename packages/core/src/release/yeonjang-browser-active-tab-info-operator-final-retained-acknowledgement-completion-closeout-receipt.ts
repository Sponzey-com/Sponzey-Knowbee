import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger,
} from "./yeonjang-browser-active-tab-info-final-retained-acknowledgement-completion-ledger.js"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptBlockingReasonCode =
  | "operator_final_retained_acknowledgement_completion_closeout_receipt_ledger_not_ready"
  | "operator_final_retained_acknowledgement_completion_closeout_receipt_ref_invalid"
  | "operator_final_retained_acknowledgement_completion_closeout_receipt_product_log_evidence_ref_invalid"
  | "operator_final_retained_acknowledgement_completion_closeout_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptInput {
  finalRetainedAcknowledgementCompletionLedger: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger
  sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedAcknowledgementCompletionCloseoutRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-receipt.v1"
  method: "browser.active_tab_info"
  status:
    | "operator_final_retained_acknowledgement_completion_closeout_receipt_ready"
    | "blocked"
  reasonCode:
    | "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_receipt_ready"
    | "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId: string
    finalRetainedAcknowledgementCompletionLedgerId: string
    sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef: string
    productLogEvidenceRef: string
    operatorFinalRetainedAcknowledgementCompletionCloseoutRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_RECEIPT_REF_PATTERN =
  /^operator-final-retained-acknowledgement-completion-closeout-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_REF_PATTERN =
  /^operator-final-retained-acknowledgement-completion-closeout:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalRetainedAcknowledgementCompletionLedgerId(
  ledger: YeonjangBrowserActiveTabInfoFinalRetainedAcknowledgementCompletionLedger,
): string | undefined {
  if (
    ledger.status !==
      "final_retained_acknowledgement_completion_ledger_ready" ||
    ledger.ledger === undefined
  ) {
    return undefined
  }
  return ledger.ledger.finalRetainedAcknowledgementCompletionLedgerId
}

function buildOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId(input: {
  finalRetainedAcknowledgementCompletionLedgerId: string
  sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedAcknowledgementCompletionCloseoutRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalRetainedAcknowledgementCompletionLedgerId,
    input.sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef,
    input.productLogEvidenceRef,
    input.operatorFinalRetainedAcknowledgementCompletionCloseoutRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-final-retained-acknowledgement-completion-closeout-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-acknowledgement-completion-closeout-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptBlockingReasonCode[] = []
  const finalRetainedAcknowledgementCompletionLedgerId =
    extractFinalRetainedAcknowledgementCompletionLedgerId(
      input.finalRetainedAcknowledgementCompletionLedger,
    )
  if (finalRetainedAcknowledgementCompletionLedgerId === undefined) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_completion_closeout_receipt_ledger_not_ready",
    )
  }
  const sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef =
    input.sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_completion_closeout_receipt_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_completion_closeout_receipt_product_log_evidence_ref_invalid",
    )
  }
  const operatorFinalRetainedAcknowledgementCompletionCloseoutRef =
    input.operatorFinalRetainedAcknowledgementCompletionCloseoutRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_ACKNOWLEDGEMENT_COMPLETION_CLOSEOUT_REF_PATTERN.test(operatorFinalRetainedAcknowledgementCompletionCloseoutRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_acknowledgement_completion_closeout_receipt_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    finalRetainedAcknowledgementCompletionLedgerId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status:
      "operator_final_retained_acknowledgement_completion_closeout_receipt_ready",
    reasonCode:
      "active_tab_info_operator_final_retained_acknowledgement_completion_closeout_receipt_ready",
    receipt: Object.freeze({
      operatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId:
        buildOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptId({
          finalRetainedAcknowledgementCompletionLedgerId,
          sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef,
          productLogEvidenceRef,
          operatorFinalRetainedAcknowledgementCompletionCloseoutRef,
          receiptStatus,
        }),
      finalRetainedAcknowledgementCompletionLedgerId,
      sanitizedOperatorFinalRetainedAcknowledgementCompletionCloseoutReceiptRef,
      productLogEvidenceRef,
      operatorFinalRetainedAcknowledgementCompletionCloseoutRef,
      receiptStatus,
    }),
  })
}
