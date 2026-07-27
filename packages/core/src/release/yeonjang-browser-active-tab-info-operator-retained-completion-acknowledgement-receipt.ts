import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex,
} from "./yeonjang-browser-active-tab-info-final-retained-completion-index.js"

export type YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptBlockingReasonCode =
  | "operator_retained_completion_acknowledgement_receipt_index_not_ready"
  | "operator_retained_completion_acknowledgement_receipt_ref_invalid"
  | "operator_retained_completion_acknowledgement_receipt_product_log_evidence_ref_invalid"
  | "operator_retained_completion_acknowledgement_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptInput {
  finalRetainedCompletionIndex: YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex
  sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorRetainedCompletionAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-retained-completion-acknowledgement-receipt.v1"
  method: "browser.active_tab_info"
  status:
    | "operator_retained_completion_acknowledgement_receipt_ready"
    | "blocked"
  reasonCode:
    | "active_tab_info_operator_retained_completion_acknowledgement_receipt_ready"
    | "active_tab_info_operator_retained_completion_acknowledgement_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorRetainedCompletionAcknowledgementReceiptId: string
    finalRetainedCompletionIndexId: string
    sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef: string
    productLogEvidenceRef: string
    operatorRetainedCompletionAcknowledgementRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_RETAINED_COMPLETION_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN =
  /^operator-retained-completion-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_RETAINED_COMPLETION_ACKNOWLEDGEMENT_REF_PATTERN =
  /^operator-retained-completion:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalRetainedCompletionIndexId(
  index: YeonjangBrowserActiveTabInfoFinalRetainedCompletionIndex,
): string | undefined {
  if (
    index.status !== "final_retained_completion_index_ready" ||
    index.index === undefined
  ) {
    return undefined
  }
  return index.index.finalRetainedCompletionIndexId
}

function buildOperatorRetainedCompletionAcknowledgementReceiptId(input: {
  finalRetainedCompletionIndexId: string
  sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorRetainedCompletionAcknowledgementRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalRetainedCompletionIndexId,
    input.sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef,
    input.productLogEvidenceRef,
    input.operatorRetainedCompletionAcknowledgementRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-retained-completion-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-retained-completion-acknowledgement-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorRetainedCompletionAcknowledgementReceiptBlockingReasonCode[] = []
  const finalRetainedCompletionIndexId = extractFinalRetainedCompletionIndexId(
    input.finalRetainedCompletionIndex,
  )
  if (finalRetainedCompletionIndexId === undefined) {
    blockingReasonCodes.push(
      "operator_retained_completion_acknowledgement_receipt_index_not_ready",
    )
  }
  const sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef =
    input.sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef.trim()
  if (!SAFE_OPERATOR_RETAINED_COMPLETION_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef)) {
    blockingReasonCodes.push(
      "operator_retained_completion_acknowledgement_receipt_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "operator_retained_completion_acknowledgement_receipt_product_log_evidence_ref_invalid",
    )
  }
  const operatorRetainedCompletionAcknowledgementRef =
    input.operatorRetainedCompletionAcknowledgementRef.trim()
  if (!SAFE_OPERATOR_RETAINED_COMPLETION_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorRetainedCompletionAcknowledgementRef)) {
    blockingReasonCodes.push(
      "operator_retained_completion_acknowledgement_receipt_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    finalRetainedCompletionIndexId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_operator_retained_completion_acknowledgement_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status: "operator_retained_completion_acknowledgement_receipt_ready",
    reasonCode:
      "active_tab_info_operator_retained_completion_acknowledgement_receipt_ready",
    receipt: Object.freeze({
      operatorRetainedCompletionAcknowledgementReceiptId:
        buildOperatorRetainedCompletionAcknowledgementReceiptId({
          finalRetainedCompletionIndexId,
          sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef,
          productLogEvidenceRef,
          operatorRetainedCompletionAcknowledgementRef,
          receiptStatus,
        }),
      finalRetainedCompletionIndexId,
      sanitizedOperatorRetainedCompletionAcknowledgementReceiptRef,
      productLogEvidenceRef,
      operatorRetainedCompletionAcknowledgementRef,
      receiptStatus,
    }),
  })
}
