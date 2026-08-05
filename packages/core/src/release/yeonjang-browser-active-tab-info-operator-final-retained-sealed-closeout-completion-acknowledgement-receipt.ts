import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger,
} from "./yeonjang-browser-active-tab-info-final-retained-sealed-closeout-acknowledgement-ledger.js"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptBlockingReasonCode =
  | "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ledger_not_ready"
  | "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ref_invalid"
  | "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_product_log_evidence_ref_invalid"
  | "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptInput {
  finalRetainedSealedCloseoutAcknowledgementLedger: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger
  sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-completion-acknowledgement-receipt.v1"
  method: "browser.active_tab_info"
  status:
    | "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ready"
    | "blocked"
  reasonCode:
    | "active_tab_info_operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ready"
    | "active_tab_info_operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptId: string
    finalRetainedSealedCloseoutAcknowledgementLedgerId: string
    sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef: string
    productLogEvidenceRef: string
    operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_FINAL_RETAINED_SEALED_CLOSEOUT_COMPLETION_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN =
  /^operator-final-retained-sealed-closeout-completion-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_FINAL_RETAINED_SEALED_CLOSEOUT_COMPLETION_ACKNOWLEDGEMENT_REF_PATTERN =
  /^operator-final-retained-sealed-closeout-completion:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalRetainedSealedCloseoutAcknowledgementLedgerId(
  ledger: YeonjangBrowserActiveTabInfoFinalRetainedSealedCloseoutAcknowledgementLedger,
): string | undefined {
  if (
    ledger.status !==
      "final_retained_sealed_closeout_acknowledgement_ledger_ready" ||
    ledger.ledger === undefined
  ) {
    return undefined
  }
  return ledger.ledger.finalRetainedSealedCloseoutAcknowledgementLedgerId
}

function buildOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptId(input: {
  finalRetainedSealedCloseoutAcknowledgementLedgerId: string
  sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalRetainedSealedCloseoutAcknowledgementLedgerId,
    input.sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef,
    input.productLogEvidenceRef,
    input.operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-final-retained-sealed-closeout-completion-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-final-retained-sealed-closeout-completion-acknowledgement-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptBlockingReasonCode[] = []
  const finalRetainedSealedCloseoutAcknowledgementLedgerId =
    extractFinalRetainedSealedCloseoutAcknowledgementLedgerId(
      input.finalRetainedSealedCloseoutAcknowledgementLedger,
    )
  if (finalRetainedSealedCloseoutAcknowledgementLedgerId === undefined) {
    blockingReasonCodes.push(
      "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ledger_not_ready",
    )
  }
  const sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef =
    input.sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_SEALED_CLOSEOUT_COMPLETION_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_product_log_evidence_ref_invalid",
    )
  }
  const operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef =
    input.operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef.trim()
  if (!SAFE_OPERATOR_FINAL_RETAINED_SEALED_CLOSEOUT_COMPLETION_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef)) {
    blockingReasonCodes.push(
      "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    finalRetainedSealedCloseoutAcknowledgementLedgerId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status:
      "operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ready",
    reasonCode:
      "active_tab_info_operator_final_retained_sealed_closeout_completion_acknowledgement_receipt_ready",
    receipt: Object.freeze({
      operatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptId:
        buildOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptId({
          finalRetainedSealedCloseoutAcknowledgementLedgerId,
          sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef,
          productLogEvidenceRef,
          operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef,
          receiptStatus,
        }),
      finalRetainedSealedCloseoutAcknowledgementLedgerId,
      sanitizedOperatorFinalRetainedSealedCloseoutCompletionAcknowledgementReceiptRef,
      productLogEvidenceRef,
      operatorFinalRetainedSealedCloseoutCompletionAcknowledgementRef,
      receiptStatus,
    }),
  })
}
