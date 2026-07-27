import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger,
} from "./yeonjang-browser-active-tab-info-final-retained-completion-closeout-ledger.js"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptBlockingReasonCode =
  | "operator_final_retained_completion_closeout_acknowledgement_receipt_ledger_not_ready"
  | "operator_final_retained_completion_closeout_acknowledgement_receipt_ref_invalid"
  | "operator_final_retained_completion_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid"
  | "operator_final_retained_completion_closeout_acknowledgement_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptInput {
  finalRetainedCompletionCloseoutLedger: YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger
  sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedCompletionCloseoutAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-completion-closeout-acknowledgement-receipt.v1"
  method: "browser.active_tab_info"
  status:
    | "operator_final_retained_completion_closeout_acknowledgement_receipt_ready"
    | "blocked"
  reasonCode:
    | "active_tab_info_operator_final_retained_completion_closeout_acknowledgement_receipt_ready"
    | "active_tab_info_operator_final_retained_completion_closeout_acknowledgement_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId: string
    finalRetainedCompletionCloseoutLedgerId: string
    sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef: string
    productLogEvidenceRef: string
    operatorFinalRetainedCompletionCloseoutAcknowledgementRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_FINAL_RETAINED_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN =
  /^operator-final-retained-completion-closeout-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_FINAL_RETAINED_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN =
  /^operator-final-retained-completion-closeout:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalRetainedCompletionCloseoutLedgerId(
  ledger: YeonjangBrowserActiveTabInfoFinalRetainedCompletionCloseoutLedger,
): string | undefined {
  if (
    ledger.status !== "final_retained_completion_closeout_ledger_ready" ||
    ledger.ledger === undefined
  ) {
    return undefined
  }
  return ledger.ledger.finalRetainedCompletionCloseoutLedgerId
}

function buildOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId(input: {
  finalRetainedCompletionCloseoutLedgerId: string
  sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedCompletionCloseoutAcknowledgementRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalRetainedCompletionCloseoutLedgerId,
    input.sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef,
    input.productLogEvidenceRef,
    input.operatorFinalRetainedCompletionCloseoutAcknowledgementRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-final-retained-completion-closeout-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-completion-closeout-acknowledgement-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptBlockingReasonCode[] = []
  const finalRetainedCompletionCloseoutLedgerId =
    extractFinalRetainedCompletionCloseoutLedgerId(
      input.finalRetainedCompletionCloseoutLedger,
    )
  if (finalRetainedCompletionCloseoutLedgerId === undefined) {
    blockingReasonCodes.push(
      "operator_final_retained_completion_closeout_acknowledgement_receipt_ledger_not_ready",
    )
  }
  const sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef =
    input.sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_completion_closeout_acknowledgement_receipt_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_completion_closeout_acknowledgement_receipt_product_log_evidence_ref_invalid",
    )
  }
  const operatorFinalRetainedCompletionCloseoutAcknowledgementRef =
    input.operatorFinalRetainedCompletionCloseoutAcknowledgementRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_COMPLETION_CLOSEOUT_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorFinalRetainedCompletionCloseoutAcknowledgementRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_completion_closeout_acknowledgement_receipt_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    finalRetainedCompletionCloseoutLedgerId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_operator_final_retained_completion_closeout_acknowledgement_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status:
      "operator_final_retained_completion_closeout_acknowledgement_receipt_ready",
    reasonCode:
      "active_tab_info_operator_final_retained_completion_closeout_acknowledgement_receipt_ready",
    receipt: Object.freeze({
      operatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId:
        buildOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptId({
          finalRetainedCompletionCloseoutLedgerId,
          sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef,
          productLogEvidenceRef,
          operatorFinalRetainedCompletionCloseoutAcknowledgementRef,
          receiptStatus,
        }),
      finalRetainedCompletionCloseoutLedgerId,
      sanitizedOperatorFinalRetainedCompletionCloseoutAcknowledgementReceiptRef,
      productLogEvidenceRef,
      operatorFinalRetainedCompletionCloseoutAcknowledgementRef,
      receiptStatus,
    }),
  })
}
