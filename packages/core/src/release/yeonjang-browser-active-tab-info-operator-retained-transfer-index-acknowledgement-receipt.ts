import { createHash } from "node:crypto"
import type {
  YeonjangBrowserActiveTabInfoFinalRetainedTransferIndex,
} from "./yeonjang-browser-active-tab-info-final-retained-transfer-index.js"

export type YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptStatus =
  "ready"

export type YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptBlockingReasonCode =
  | "operator_retained_transfer_index_acknowledgement_receipt_index_not_ready"
  | "operator_retained_transfer_index_acknowledgement_receipt_ref_invalid"
  | "operator_retained_transfer_index_acknowledgement_receipt_product_log_evidence_ref_invalid"
  | "operator_retained_transfer_index_acknowledgement_receipt_ack_ref_invalid"

export interface YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptInput {
  finalRetainedTransferIndex: YeonjangBrowserActiveTabInfoFinalRetainedTransferIndex
  sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorRetainedTransferAcknowledgementRef: string
}

export type YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt = Readonly<{
  schemaVersion: "knowbee.yeonjang-browser-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt.v1"
  method: "browser.active_tab_info"
  status:
    | "operator_retained_transfer_index_acknowledgement_receipt_ready"
    | "blocked"
  reasonCode:
    | "active_tab_info_operator_retained_transfer_index_acknowledgement_receipt_ready"
    | "active_tab_info_operator_retained_transfer_index_acknowledgement_receipt_blocked"
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptBlockingReasonCode[]
  receipt?: Readonly<{
    operatorRetainedTransferIndexAcknowledgementReceiptId: string
    finalRetainedTransferIndexId: string
    sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef: string
    productLogEvidenceRef: string
    operatorRetainedTransferAcknowledgementRef: string
    receiptStatus: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptStatus
  }>
  releaseReadinessNow: false
  publicationReadinessNow: false
  enableSkillMappingNow: false
  addProductionBindingNow: false
  enableDefaultLiveSmokeNow: false
}>

const SAFE_OPERATOR_RETAINED_TRANSFER_INDEX_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN =
  /^operator-retained-transfer-index-acknowledgement-receipt:active-tab-info:sanitized:[a-z0-9._:-]+$/u

const SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN =
  /^product-log:active-tab-info:evidence:[a-z0-9._:-]+$/u

const SAFE_OPERATOR_RETAINED_TRANSFER_ACKNOWLEDGEMENT_REF_PATTERN =
  /^operator-retained-transfer:active-tab-info:ack:[a-z0-9._:-]+$/u

function extractFinalRetainedTransferIndexId(
  index: YeonjangBrowserActiveTabInfoFinalRetainedTransferIndex,
): string | undefined {
  if (
    index.status !== "final_retained_transfer_index_ready" ||
    index.index === undefined
  ) {
    return undefined
  }
  return index.index.finalRetainedTransferIndexId
}

function buildOperatorRetainedTransferIndexAcknowledgementReceiptId(input: {
  finalRetainedTransferIndexId: string
  sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef: string
  productLogEvidenceRef: string
  operatorRetainedTransferAcknowledgementRef: string
  receiptStatus: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptStatus
}): string {
  const hash = createHash("sha256")
  for (const value of [
    input.finalRetainedTransferIndexId,
    input.sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef,
    input.productLogEvidenceRef,
    input.operatorRetainedTransferAcknowledgementRef,
    input.receiptStatus,
  ]) {
    hash.update(value)
    hash.update("\n")
  }
  return `operator-retained-transfer-index-acknowledgement-receipt:browser.active_tab_info:${hash.digest("hex").slice(0, 3)}`
}

function baseResult(input: {
  status: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt["status"]
  reasonCode: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt["reasonCode"]
  blockingReasonCodes?: readonly YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptBlockingReasonCode[]
  receipt?: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt["receipt"]
}): YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt {
  return Object.freeze({
    schemaVersion:
      "knowbee.yeonjang-browser-active-tab-info-operator-retained-transfer-index-acknowledgement-receipt.v1",
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

export function buildYeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt(
  input: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptInput,
): YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceipt {
  const blockingReasonCodes: YeonjangBrowserActiveTabInfoOperatorRetainedTransferIndexAcknowledgementReceiptBlockingReasonCode[] = []
  const finalRetainedTransferIndexId = extractFinalRetainedTransferIndexId(
    input.finalRetainedTransferIndex,
  )
  if (finalRetainedTransferIndexId === undefined) {
    blockingReasonCodes.push(
      "operator_retained_transfer_index_acknowledgement_receipt_index_not_ready",
    )
  }
  const sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef =
    input.sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef.trim()
  if (!SAFE_OPERATOR_RETAINED_TRANSFER_INDEX_ACKNOWLEDGEMENT_RECEIPT_REF_PATTERN.test(sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef)) {
    blockingReasonCodes.push(
      "operator_retained_transfer_index_acknowledgement_receipt_ref_invalid",
    )
  }
  const productLogEvidenceRef = input.productLogEvidenceRef.trim()
  if (!SAFE_PRODUCT_LOG_EVIDENCE_REF_PATTERN.test(productLogEvidenceRef)) {
    blockingReasonCodes.push(
      "operator_retained_transfer_index_acknowledgement_receipt_product_log_evidence_ref_invalid",
    )
  }
  const operatorRetainedTransferAcknowledgementRef =
    input.operatorRetainedTransferAcknowledgementRef.trim()
  if (!SAFE_OPERATOR_RETAINED_TRANSFER_ACKNOWLEDGEMENT_REF_PATTERN.test(operatorRetainedTransferAcknowledgementRef)) {
    blockingReasonCodes.push(
      "operator_retained_transfer_index_acknowledgement_receipt_ack_ref_invalid",
    )
  }

  if (
    blockingReasonCodes.length > 0 ||
    finalRetainedTransferIndexId === undefined
  ) {
    return baseResult({
      status: "blocked",
      reasonCode:
        "active_tab_info_operator_retained_transfer_index_acknowledgement_receipt_blocked",
      blockingReasonCodes,
    })
  }

  const receiptStatus = "ready"
  return baseResult({
    status: "operator_retained_transfer_index_acknowledgement_receipt_ready",
    reasonCode:
      "active_tab_info_operator_retained_transfer_index_acknowledgement_receipt_ready",
    receipt: Object.freeze({
      operatorRetainedTransferIndexAcknowledgementReceiptId:
        buildOperatorRetainedTransferIndexAcknowledgementReceiptId({
          finalRetainedTransferIndexId,
          sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef,
          productLogEvidenceRef,
          operatorRetainedTransferAcknowledgementRef,
          receiptStatus,
        }),
      finalRetainedTransferIndexId,
      sanitizedOperatorRetainedTransferIndexAcknowledgementReceiptRef,
      productLogEvidenceRef,
      operatorRetainedTransferAcknowledgementRef,
      receiptStatus,
    }),
  })
}
